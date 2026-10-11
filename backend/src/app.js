"use strict";

const { randomInt, randomUUID } = require("node:crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  PutCommand,
  TransactWriteCommand,
} = require("@aws-sdk/lib-dynamodb");

const { estimateExposure } = require("./zones");
const { validateBreakEvent, validateReport, validateSite, validateWorker } = require("./validate");
const { getWorkerPlan, localDateString, localDateTimeToUtc, shiftCandidates } = require("./breaks");
const { toIso, twoHoursAgo, expiresAt7Days } = require("./time");

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME;
const HEADERS = {
  "content-type": "application/json",
  "access-control-allow-origin": process.env.ALLOW_ORIGIN || "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
};
const REPORT_PARTITION_PREFIX = "REPORT#";
const BREAK_PARTITION_PREFIX = "BREAK#";
const WORKER_ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function json(statusCode, payload) {
  return { statusCode, headers: HEADERS, body: JSON.stringify(payload) };
}

async function recentTooHotCount(siteId, zone, now = new Date()) {
  const reports = await loadReports(siteId, zone, 10_000, false);
  const cutoff = twoHoursAgo(now);
  return reports.filter((report) => report.level === 3 && report.reportTs >= cutoff).length;
}

function parseBody(event) {
  if (!event.body) return { ok: false, error: "Request body is required" };
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, error: "Body must be valid JSON" };
  }
}

function managerId(event) {
  return event.requestContext?.authorizer?.jwt?.claims?.sub || null;
}

function sitePartition(siteId) {
  return `SITE#${siteId}`;
}

function reportPartition(siteId, zoneId) {
  return `${REPORT_PARTITION_PREFIX}${siteId}#${zoneId}`;
}

function breakPartition(siteId, date) {
  return `${BREAK_PARTITION_PREFIX}${siteId}#${date}`;
}

function workerItemKey(siteId, workerId) {
  return { zoneId: sitePartition(siteId), ts: `WORKER#${workerId}` };
}

function publicWorker(worker) {
  const {
    zoneId: partitionKey,
    workerZoneId,
    ts,
    entityType,
    gsi1pk,
    gsi1sk,
    gsi2pk,
    gsi2sk,
    activeBreak,
    activeBreakScheduledAt,
    activeBreakZoneId,
    lastEndedBreakScheduledAt,
    ...result
  } = worker;
  return { ...result, zoneId: workerZoneId };
}

function validZone(site, zoneId) {
  return site?.zones?.find((zone) => zone.id === zoneId);
}

function genericWorkerNotFound() {
  return json(404, { error: "Worker not found" });
}

async function loadWorker(siteId, workerId) {
  const result = await doc.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: workerItemKey(siteId, workerId),
    ConsistentRead: true,
  }));
  return result.Item || null;
}

async function listSiteWorkers(siteId) {
  const result = await doc.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "zoneId = :zoneId AND begins_with(#ts, :workerPrefix)",
    ExpressionAttributeNames: { "#ts": "ts" },
    ExpressionAttributeValues: {
      ":zoneId": sitePartition(siteId),
      ":workerPrefix": "WORKER#",
    },
  }));
  return result.Items || [];
}

async function workerBreakEvents(siteId, workerId) {
  const result = await doc.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: "WorkerBreaksIndex",
    KeyConditionExpression: "gsi1pk = :workerKey AND begins_with(gsi1sk, :breakPrefix)",
    ExpressionAttributeValues: {
      ":workerKey": `${sitePartition(siteId)}#WORKER#${workerId}`,
      ":breakPrefix": "BREAK#",
    },
    ScanIndexForward: true,
  }));
  return result.Items || [];
}

function generateWorkerId() {
  let suffix = "";
  for (let index = 0; index < 4; index += 1) {
    suffix += WORKER_ID_ALPHABET[randomInt(WORKER_ID_ALPHABET.length)];
  }
  return `W-${suffix}`;
}

async function loadSite(siteId) {
  const result = await doc.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { zoneId: sitePartition(siteId), ts: "SITE" },
  }));
  return result.Item || null;
}

async function loadReports(siteId, zone, limit, reverse = true) {
  const items = [];
  let key;
  do {
    const result = await doc.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "zoneId = :zoneId AND begins_with(#ts, :reportPrefix)",
      ExpressionAttributeNames: { "#ts": "ts" },
      ExpressionAttributeValues: {
        ":zoneId": reportPartition(siteId, zone.id),
        ":reportPrefix": "REPORT#",
      },
      ScanIndexForward: !reverse,
      Limit: limit,
      ExclusiveStartKey: key,
    }));
    items.push(...(result.Items || []));
    key = result.LastEvaluatedKey;
  } while (key && items.length < limit);
  return items.slice(0, limit);
}

async function getSite(event) {
  const sub = managerId(event);
  if (!sub) return json(401, { error: "Unauthorized" });
  const site = await loadSite(sub);
  if (!site) return json(404, { error: "No site yet" });
  return json(200, publicManagerSite(site));
}

function publicManagerSite(site) {
  const { zoneId, ts, entityType, ...result } = site;
  return result;
}

async function putSite(event) {
  const sub = managerId(event);
  if (!sub) return json(401, { error: "Unauthorized" });
  const parsed = parseBody(event);
  if (!parsed.ok) return json(400, { error: parsed.error });

  const check = validateSite(parsed.value);
  if (!check.ok) return json(400, { error: check.error });

  const previous = await loadSite(sub);
  const previousZones = new Map((previous?.zones || []).map((zone) => [zone.id, zone]));
  const zones = check.value.zones.map((zone) => ({
    ...zone,
    id: zone.id || randomUUID(),
    exposure: estimateExposure(zone),
  }));
  const duplicateIds = new Set();
  for (const zone of zones) {
    if (duplicateIds.has(zone.id)) return json(400, { error: "Zone ids must be unique" });
    duplicateIds.add(zone.id);
  }

  const moved = previous && (
    previous.lat !== check.value.lat
    || previous.lon !== check.value.lon
  );
  let locationCheck = null;
  let locationVerifiedAt = moved ? null : previous?.locationVerifiedAt || null;
  if (check.value.deviceLocation) {
    const distanceM = distanceInMetres(
      check.value.lat,
      check.value.lon,
      check.value.deviceLocation.lat,
      check.value.deviceLocation.lon,
    );
    if (distanceM <= check.value.radiusM) {
      locationCheck = { status: "verified" };
      locationVerifiedAt = toIso(new Date());
    } else {
      locationCheck = { status: "outside", distanceM };
    }
  }

  const site = {
    siteId: sub,
    name: check.value.name,
    lat: check.value.lat,
    lon: check.value.lon,
    radiusM: check.value.radiusM,
    requireLocation: check.value.requireLocation,
    timeZone: check.value.timeZone,
    zones: zones.map((zone) => ({
      ...zone,
      tapsToday: previousZones.get(zone.id)?.tapsToday || 0,
      recentTooHotTaps: previousZones.get(zone.id)?.recentTooHotTaps || 0,
    })),
    locationVerifiedAt,
  };
  await doc.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: { zoneId: sitePartition(sub), ts: "SITE", entityType: "site", ...site },
  }));
  return json(200, { site, locationCheck });
}

function distanceInMetres(lat1, lon1, lat2, lon2) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const deltaLat = radians(lat2 - lat1);
  const deltaLon = radians(lon2 - lon1);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
}

async function getPublicSite(siteId) {
  const site = await loadSite(siteId);
  if (!site) return json(404, { error: "Site not found" });
  return json(200, {
    name: site.name,
    requireLocation: site.requireLocation,
    zones: site.zones.map(({ id, name }) => ({ id, name })),
  });
}

async function postReport(event) {
  const parsed = parseBody(event);
  if (!parsed.ok) return json(400, { error: parsed.error });
  const { siteId } = parsed.value;
  if (typeof siteId !== "string" || !siteId.trim()) {
    return json(400, { error: "siteId is required" });
  }
  const site = await loadSite(siteId);
  if (!site) return json(404, { error: "Site not found" });

  const zone = site.zones.find((item) => item.id === parsed.value.zoneId);
  if (!zone) return json(404, { error: "Zone not found" });
  const check = validateReport(parsed.value);
  if (!check.ok) return json(400, { error: check.error });

  const { lat, lon, accuracy } = check.value;
  if (site.requireLocation && (lat === undefined || lon === undefined)) {
    return json(403, { error: "Location is required", code: "location_required" });
  }
  const hasCoordinates = lat !== undefined && lon !== undefined;
  const distanceM = hasCoordinates
    ? distanceInMetres(site.lat, site.lon, lat, lon)
    : null;
  const verified = distanceM !== null && distanceM <= site.radiusM;
  if (site.requireLocation && !verified) {
    return json(403, { error: "You appear to be outside the plant area", code: "outside_area" });
  }

  const now = new Date();
  const timestamp = toIso(now);
  const report = {
    reportZoneId: zone.id,
    zoneName: zone.name,
    level: check.value.level,
    reportTs: timestamp,
    verified,
  };
  await doc.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      ...report,
      zoneId: reportPartition(siteId, zone.id),
      ts: `REPORT#${timestamp}#${randomUUID()}`,
      entityType: "report",
      expiresAt: expiresAt7Days(now),
    },
  }));
  return json(201, { ok: true, verified });
}

async function getWorkers(event) {
  const sub = managerId(event);
  if (!sub) return json(401, { error: "Unauthorized" });
  if (!await loadSite(sub)) return json(404, { error: "No site yet" });
  return json(200, (await listSiteWorkers(sub)).map(publicWorker));
}

async function createWorker(event) {
  const sub = managerId(event);
  if (!sub) return json(401, { error: "Unauthorized" });
  const site = await loadSite(sub);
  if (!site) return json(404, { error: "No site yet" });
  const parsed = parseBody(event);
  if (!parsed.ok) return json(400, { error: parsed.error });
  const check = validateWorker(parsed.value);
  if (!check.ok) return json(400, { error: check.error });
  if (!validZone(site, check.value.zoneId)) return json(400, { error: "zoneId must be a saved zone" });

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const workerId = generateWorkerId();
    const worker = {
      ...workerItemKey(sub, workerId),
      entityType: "worker",
      name: check.value.name,
      workerZoneId: check.value.zoneId,
      shiftStart: check.value.shiftStart,
      shiftEnd: check.value.shiftEnd,
      active: check.value.active,
      workerId,
      gsi1pk: `${sitePartition(sub)}#WORKER#${workerId}`,
      gsi1sk: "PROFILE",
    };
    try {
      await doc.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: worker,
        ConditionExpression: "attribute_not_exists(zoneId) AND attribute_not_exists(#ts)",
        ExpressionAttributeNames: { "#ts": "ts" },
      }));
      return json(201, publicWorker(worker));
    } catch (error) {
      if (error.name !== "ConditionalCheckFailedException") throw error;
    }
  }
  throw new Error("Unable to generate a unique worker ID");
}

async function workerHasOpenBreak(siteId, workerId) {
  const open = new Set();
  for (const item of await workerBreakEvents(siteId, workerId)) {
    if (item.type === "start") open.add(item.scheduledAt);
    if (item.type === "end") open.delete(item.scheduledAt);
  }
  return open.size > 0;
}

async function updateWorker(event, deactivate = false) {
  const sub = managerId(event);
  if (!sub) return json(401, { error: "Unauthorized" });
  const workerId = event.pathParameters?.workerId;
  const current = await loadWorker(sub, workerId);
  if (!current) return genericWorkerNotFound();
  if (current.activeBreakScheduledAt || await workerHasOpenBreak(sub, workerId)) {
    return json(409, { error: "End the active break before changing this worker" });
  }
  if (deactivate) {
    const updated = { ...current, active: false };
    await doc.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
    return json(200, publicWorker(updated));
  }

  const site = await loadSite(sub);
  const parsed = parseBody(event);
  if (!parsed.ok) return json(400, { error: parsed.error });
  const check = validateWorker(parsed.value);
  if (!check.ok) return json(400, { error: check.error });
  if (!validZone(site, check.value.zoneId)) return json(400, { error: "zoneId must be a saved zone" });
  const updated = {
    ...current,
    name: check.value.name,
    workerZoneId: check.value.zoneId,
    shiftStart: check.value.shiftStart,
    shiftEnd: check.value.shiftEnd,
    active: parsed.value.active === undefined ? current.active : check.value.active,
  };
  await doc.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
  return json(200, publicWorker(updated));
}

async function getPublicWorkerPlan(event) {
  const { siteId, zoneId, workerId } = event.pathParameters || {};
  const site = await loadSite(siteId);
  const zone = validZone(site, zoneId);
  const worker = await loadWorker(siteId, workerId);
  if (!site || !zone || !worker?.active || worker.workerZoneId !== zoneId) return genericWorkerNotFound();
  const events = await workerBreakEvents(siteId, workerId);
  const scoredZone = { ...zone, recentTooHotTaps: await recentTooHotCount(siteId, zone) };
  return json(200, getWorkerPlan({ ...worker, zone: scoredZone }, site.timeZone || "Asia/Kolkata", events));
}

async function getPublicWorkerPlanById(event) {
  const { siteId, workerId } = event.pathParameters || {};
  const site = await loadSite(siteId);
  const worker = await loadWorker(siteId, workerId);
  const zone = validZone(site, worker?.workerZoneId);
  if (!site || !worker?.active || !zone) return genericWorkerNotFound();
  const events = await workerBreakEvents(siteId, workerId);
  const scoredZone = { ...zone, recentTooHotTaps: await recentTooHotCount(siteId, zone) };
  return json(200, getWorkerPlan({ ...worker, zone: scoredZone }, site.timeZone || "Asia/Kolkata", events));
}

async function recordPublicBreak(event) {
  const { siteId, zoneId, workerId } = event.pathParameters || {};
  const site = await loadSite(siteId);
  const zone = validZone(site, zoneId);
  const worker = await loadWorker(siteId, workerId);
  if (!site || !zone || !worker?.active || worker.workerZoneId !== zoneId) return genericWorkerNotFound();

  const parsed = parseBody(event);
  if (!parsed.ok) return json(400, { error: parsed.error });
  const check = validateBreakEvent(parsed.value);
  if (!check.ok) return json(400, { error: check.error });
  const { lat, lon, scheduledAt, type } = check.value;
  let withinRadius = null;
  if (lat !== undefined && lon !== undefined) {
    withinRadius = distanceInMetres(site.lat, site.lon, lat, lon) <= site.radiusM;
  }
  if (site.requireLocation && withinRadius === null) {
    return json(403, { error: "Location is required", code: "location_required" });
  }
  if (site.requireLocation && !withinRadius) {
    return json(403, { error: "You appear to be outside the plant area", code: "outside_area" });
  }

  const now = new Date();
  const recentHot = await recentTooHotCount(siteId, zone, now);
  const activeBreak = worker.activeBreakScheduledAt;
  if (type === "start" && activeBreak) return json(409, { error: "A break is already in progress" });
  if (type === "end" && activeBreak !== scheduledAt) {
    return json(409, { error: "There is no matching break in progress" });
  }

  const timeZone = site.timeZone || "Asia/Kolkata";
  const candidates = shiftCandidates({ ...worker, zone: { ...zone, recentTooHotTaps: recentHot } }, timeZone, now);
  const scheduledBreak = candidates.flatMap((shift) => shift.schedule)
    .find((item) => item.scheduledAt === scheduledAt);
  const activeShift = candidates.find(({ start, end }) => start <= now && now < end);
  if (!scheduledBreak || (type === "start" && (
    !activeShift?.schedule.some((item) => item.scheduledAt === scheduledAt)
    || now < new Date(scheduledAt)
  ))) {
    return json(400, { error: "This is not a scheduled break time" });
  }

  const timestamp = now.toISOString();
  const date = localDateString(new Date(scheduledAt), timeZone);
  const record = {
    zoneId: breakPartition(siteId, date),
    ts: `BREAK#${scheduledAt}#${workerId}#${type}`,
    entityType: "break",
    workerId,
    reportZoneId: zoneId,
    type,
    scheduledAt,
    timestamp,
    withinRadius,
    gsi1pk: `${sitePartition(siteId)}#WORKER#${workerId}`,
    gsi1sk: `BREAK#${scheduledAt}#${type}`,
    gsi2pk: breakPartition(siteId, date),
    gsi2sk: `${zoneId}#${workerId}#${scheduledAt}#${type}`,
    expiresAt: expiresAt7Days(now),
  };
  try {
    await doc.send(new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: TABLE_NAME,
            Key: workerItemKey(siteId, workerId),
            UpdateExpression: type === "start"
              ? "SET activeBreakScheduledAt = :scheduledAt, activeBreakZoneId = :zoneId"
              : "SET lastEndedBreakScheduledAt = :scheduledAt REMOVE activeBreakScheduledAt, activeBreakZoneId",
            ConditionExpression: type === "start"
              ? "#active = :active AND attribute_not_exists(activeBreakScheduledAt)"
              : "#active = :active AND activeBreakScheduledAt = :scheduledAt AND activeBreakZoneId = :zoneId",
            ExpressionAttributeNames: { "#active": "active" },
            ExpressionAttributeValues: {
              ":active": true,
              ":scheduledAt": scheduledAt,
              ":zoneId": zoneId,
            },
          },
        },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: record,
            ConditionExpression: "attribute_not_exists(zoneId) AND attribute_not_exists(#ts)",
            ExpressionAttributeNames: { "#ts": "ts" },
          },
        },
      ],
    }));
  } catch (error) {
    if (error.name === "TransactionCanceledException") {
      return json(409, { error: "Break sequence is invalid or this break was already recorded" });
    }
    throw error;
  }
  const previousEvents = await workerBreakEvents(siteId, workerId);
  const updatedEvents = [...previousEvents, record];
  const updatedWorker = type === "start"
    ? { ...worker, activeBreakScheduledAt: scheduledAt, activeBreakZoneId: zoneId }
    : { ...worker, lastEndedBreakScheduledAt: scheduledAt, activeBreakScheduledAt: undefined };
  const plan = getWorkerPlan({ ...updatedWorker, zone: { ...zone, recentTooHotTaps: recentHot } }, timeZone, updatedEvents, now);
  return json(201, { ok: true, breakEvent: { type, timestamp, withinRadius }, plan });
}

async function getBreakSummary(event) {
  const sub = managerId(event);
  if (!sub) return json(401, { error: "Unauthorized" });
  const site = await loadSite(sub);
  if (!site) return json(404, { error: "No site yet" });
  const timeZone = site.timeZone || "Asia/Kolkata";
  const date = event.queryStringParameters?.date || localDateString(new Date(), timeZone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(400, { error: "date must be YYYY-MM-DD" });

  const result = await doc.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: "BreaksByPlantDayIndex",
    KeyConditionExpression: "gsi2pk = :day",
    ExpressionAttributeValues: { ":day": breakPartition(sub, date) },
  }));
  const events = result.Items || [];
  const workers = await listSiteWorkers(sub);
  const scoredZones = await Promise.all(site.zones.map(async (zone) => ({
    ...zone,
    recentTooHotTaps: await recentTooHotCount(sub, zone),
  })));
  const zoneById = new Map(scoredZones.map((zone) => [zone.id, zone]));
  const rows = workers.map((worker) => {
    const zone = zoneById.get(worker.workerZoneId);
    const shifts = zone && shiftCandidates(
      { ...worker, zone },
      timeZone,
      localDateTimeToUtc(date, "12:00", timeZone),
    );
    const required = shifts?.find(({ start }) => localDateString(start, timeZone) === date)?.schedule.length || 0;
    const taken = events.filter((item) => (
      item.workerId === worker.workerId
      && item.reportZoneId === worker.workerZoneId
      && item.type === "end"
    )).length;
    return {
      workerId: worker.workerId,
      name: worker.name,
      zoneId: worker.workerZoneId,
      breaksTaken: taken,
      breaksRequired: required,
    };
  });
  const zones = site.zones.map((zone) => {
    const zoneWorkers = rows.filter((worker) => worker.zoneId === zone.id);
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      breaksTaken: zoneWorkers.reduce((total, worker) => total + worker.breaksTaken, 0),
      breaksRequired: zoneWorkers.reduce((total, worker) => total + worker.breaksRequired, 0),
    };
  });
  return json(200, { date, workers: rows, zones });
}

async function getZones(event) {
  const sub = managerId(event);
  if (!sub) return json(401, { error: "Unauthorized" });
  const site = await loadSite(sub);
  if (!site) return json(404, { error: "No site yet" });

  const now = new Date();
  const timeZone = site.timeZone || "Asia/Kolkata";
  const midnightIso = localDateTimeToUtc(localDateString(now, timeZone), "00:00", timeZone).toISOString();
  const recentIso = twoHoursAgo(now);
  const result = await Promise.all(site.zones.map(async (zone) => {
    const reports = await loadReports(sub, zone, 10_000, false);
    const today = reports.filter((report) => report.reportTs >= midnightIso);
    const recentTooHotTaps = reports.filter((report) => (
      report.level === 3 && report.reportTs >= recentIso
    )).length;
    return {
      id: zone.id,
      name: zone.name,
      kind: zone.kind,
      roof: zone.roof,
      ventilation: zone.ventilation,
      headcount: zone.headcount,
      exposure: zone.exposure,
      tapsToday: today.length,
      recentTooHotTaps,
    };
  }));
  return json(200, result);
}

async function getReports(event) {
  const sub = managerId(event);
  if (!sub) return json(401, { error: "Unauthorized" });
  const site = await loadSite(sub);
  if (!site) return json(404, { error: "No site yet" });

  const rawLimit = event.queryStringParameters?.limit || "50";
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return json(400, { error: "limit must be an integer from 1 to 100" });
  }
  const reportsByZone = await Promise.all(site.zones.map((zone) => loadReports(sub, zone, limit)));
  return json(200, reportsByZone
    .flat()
    .sort((left, right) => right.reportTs.localeCompare(left.reportTs))
    .slice(0, limit)
    .map(({ reportZoneId, zoneName, level, reportTs, verified }) => ({
      zoneId: reportZoneId,
      zoneName,
      level,
      ts: reportTs,
      verified,
    })));
}

exports.handler = async (event) => {
  try {
    const routeKey = event.routeKey;
    if (routeKey === "OPTIONS /{proxy+}") {
      return { statusCode: 204, headers: HEADERS, body: "" };
    }
    if (routeKey === "GET /health") return json(200, { ok: true });
    if (routeKey === "GET /public/sites/{siteId}") {
      return getPublicSite(event.pathParameters?.siteId);
    }
    if (routeKey === "POST /report") return postReport(event);
    if (routeKey === "GET /workers") return getWorkers(event);
    if (routeKey === "POST /workers") return createWorker(event);
    if (routeKey === "PUT /workers/{workerId}") return updateWorker(event);
    if (routeKey === "DELETE /workers/{workerId}") return updateWorker(event, true);
    if (routeKey === "GET /breaks") return getBreakSummary(event);
    if (routeKey === "GET /public/workers/{siteId}/{workerId}") return getPublicWorkerPlanById(event);
    if (routeKey === "GET /public/workers/{siteId}/{zoneId}/{workerId}") return getPublicWorkerPlan(event);
    if (routeKey === "POST /public/workers/{siteId}/{zoneId}/{workerId}/breaks") return recordPublicBreak(event);
    if (routeKey === "GET /site") return getSite(event);
    if (routeKey === "PUT /site") return putSite(event);
    if (routeKey === "GET /zones") return getZones(event);
    if (routeKey === "GET /reports") return getReports(event);
    return json(404, { error: "Not found" });
  } catch (error) {
    console.error("Unhandled API error", error?.message || "unknown error");
    return json(500, { error: "Internal server error" });
  }
};
