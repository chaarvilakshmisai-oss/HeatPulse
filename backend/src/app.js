"use strict";

const { randomBytes, randomInt, randomUUID } = require("node:crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  TransactWriteCommand,
} = require("@aws-sdk/lib-dynamodb");

const { estimateExposure } = require("./zones");
const { validateBreakEvent, validateReport, validateSite, validateWorker } = require("./validate");
const { defaultAlertSettings, validateAlertSettings } = require("./alert-settings");
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
const WORKER_ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const WORKER_LOGIN_LIMIT = 10;
const WORKER_LOGIN_WINDOW_MS = 60_000;
const workerLoginWindows = new Map();
const workerSessions = new Map();

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

function ownerPartition(ownerId) {
  return `OWNER#${ownerId}`;
}

function ownerPlantKey(ownerId, plantId) {
  return { zoneId: ownerPartition(ownerId), ts: `PLANT#${plantId}` };
}

function plantCodeKey(plantCode) {
  return { zoneId: `PLANTCODE#${plantCode}`, ts: "CODE" };
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
    phone,
    smsConsent,
    ...result
  } = worker;
  return { ...result, zoneId: workerZoneId };
}

function managerWorker(worker) {
  return { ...publicWorker(worker), phone: worker.phone || "", smsConsent: worker.smsConsent === true };
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

async function loadPlant(plantId) {
  return loadSite(plantId);
}

async function loadOwnedPlant(ownerId, plantId) {
  const plant = await loadPlant(plantId);
  return plant?.ownerId === ownerId ? plant : null;
}

async function getAlertSettings(event) {
  const plantId = event.pathParameters?.plantId;
  const result = await doc.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { zoneId: sitePartition(plantId), ts: "ALERT_SETTINGS" },
  }));
  return json(200, result.Item?.settings || defaultAlertSettings(plantId));
}

async function saveAlertSettings(event) {
  const plantId = event.pathParameters?.plantId;
  const parsed = parseBody(event);
  if (!parsed.ok) return json(400, { error: parsed.error });
  const check = validateAlertSettings(parsed.value, plantId);
  if (!check.ok) return json(400, { error: check.error });
  await doc.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      zoneId: sitePartition(plantId),
      ts: "ALERT_SETTINGS",
      entityType: "alertSettings",
      plantId,
      settings: check.value,
      updatedAt: new Date().toISOString(),
    },
  }));
  return json(200, check.value);
}

async function getPlantAlerts(event) {
  const plantId = event.pathParameters?.plantId;
  const result = await doc.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "zoneId = :zoneId AND begins_with(#ts, :alertPrefix)",
    ExpressionAttributeNames: { "#ts": "ts" },
    ExpressionAttributeValues: {
      ":zoneId": `ALERT#${plantId}`,
      ":alertPrefix": "ALERT#",
    },
    ScanIndexForward: false,
  }));
  return json(200, result.Items || []);
}

async function listOwnerPlants(ownerId) {
  const result = await doc.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "zoneId = :owner AND begins_with(#ts, :plantPrefix)",
    ExpressionAttributeNames: { "#ts": "ts" },
    ExpressionAttributeValues: {
      ":owner": ownerPartition(ownerId),
      ":plantPrefix": "PLANT#",
    },
  }));
  const plants = await Promise.all((result.Items || []).map((reference) => loadPlant(reference.plantId)));
  return plants.filter((plant) => plant?.ownerId === ownerId).map(publicManagerSite);
}

async function generatePlantCode(plantId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    let suffix = "";
    for (let index = 0; index < 4; index += 1) {
      suffix += WORKER_ID_ALPHABET[randomInt(WORKER_ID_ALPHABET.length)];
    }
    const plantCode = `HP-${suffix}`;
    try {
      await doc.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: { ...plantCodeKey(plantCode), entityType: "plantCode", plantId },
        ConditionExpression: "attribute_not_exists(zoneId) AND attribute_not_exists(#ts)",
        ExpressionAttributeNames: { "#ts": "ts" },
      }));
      return plantCode;
    } catch (error) {
      if (error.name !== "ConditionalCheckFailedException") throw error;
    }
  }
  throw new Error("Unable to generate a unique plant code");
}

function makePlant({ plantId, ownerId, plantCode, input, previous, createdAt }) {
  const previousZones = new Map((previous?.zones || []).map((zone) => [zone.id, zone]));
  const zones = input.zones.map((zone) => ({
    ...zone,
    id: zone.id || randomUUID(),
    exposure: estimateExposure(zone),
    tapsToday: previousZones.get(zone.id)?.tapsToday || 0,
    recentTooHotTaps: previousZones.get(zone.id)?.recentTooHotTaps || 0,
  }));
  return {
    zoneId: sitePartition(plantId),
    ts: "SITE",
    entityType: "plant",
    plantId,
    siteId: plantId,
    ownerId,
    plantCode,
    name: input.name,
    lat: input.lat,
    lon: input.lon,
    radiusM: input.radiusM,
    requireLocation: input.requireLocation,
    timeZone: input.timeZone,
    zones,
    locationVerifiedAt: previous?.locationVerifiedAt || null,
    createdAt: createdAt || new Date().toISOString(),
  };
}

async function putPlantRecord(plant) {
  await doc.send(new PutCommand({ TableName: TABLE_NAME, Item: plant }));
  await doc.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: { ...ownerPlantKey(plant.ownerId, plant.plantId), entityType: "plantOwnerRef", plantId: plant.plantId },
  }));
}

async function migrateLegacySite(ownerId) {
  const legacy = await loadSite(ownerId);
  if (!legacy || legacy.plantId) return null;
  const existingPlants = await listOwnerPlants(ownerId);
  const migratedAlready = existingPlants.some((plant) => (
    plant.migratedFromSiteId === ownerId
    || (plant.name === legacy.name
      && plant.lat === legacy.lat
      && plant.lon === legacy.lon
      && plant.radiusM === legacy.radiusM
      && plant.zones.map((zone) => zone.id).join(",") === (legacy.zones || []).map((zone) => zone.id).join(","))
  ));
  if (migratedAlready) return null;

  const plantId = randomUUID();
  const plantCode = await generatePlantCode(plantId);
  const input = {
    name: legacy.name,
    lat: legacy.lat,
    lon: legacy.lon,
    radiusM: legacy.radiusM,
    requireLocation: legacy.requireLocation,
    timeZone: legacy.timeZone || "Asia/Kolkata",
    zones: legacy.zones || [],
  };
  const plant = makePlant({
    plantId,
    ownerId,
    plantCode,
    input,
    previous: legacy,
    createdAt: legacy.createdAt || new Date().toISOString(),
  });
  plant.migratedFromSiteId = ownerId;
  await putPlantRecord(plant);
  const legacyWorkers = await listSiteWorkers(ownerId);
  for (const worker of legacyWorkers) {
    const migratedWorker = {
      ...worker,
      ...workerItemKey(plantId, worker.workerId),
      plantId,
      gsi1pk: `${sitePartition(plantId)}#WORKER#${worker.workerId}`,
    };
    await doc.send(new PutCommand({ TableName: TABLE_NAME, Item: migratedWorker }));
    await doc.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: workerItemKey(ownerId, worker.workerId),
    }));
  }
  return publicManagerSite(plant);
}

async function getPlants(event) {
  const ownerId = managerId(event);
  if (!ownerId) return json(401, { error: "Unauthorized" });
  await migrateLegacySite(ownerId);
  return json(200, await listOwnerPlants(ownerId));
}

async function createPlant(event) {
  const ownerId = managerId(event);
  if (!ownerId) return json(401, { error: "Unauthorized" });
  const parsed = parseBody(event);
  if (!parsed.ok) return json(400, { error: parsed.error });
  const check = validateSite(parsed.value);
  if (!check.ok) return json(400, { error: check.error });
  const plantId = randomUUID();
  const plantCode = await generatePlantCode(plantId);
  const plant = makePlant({ plantId, ownerId, plantCode, input: check.value });
  try {
    await putPlantRecord(plant);
  } catch (error) {
    await doc.send(new DeleteCommand({ TableName: TABLE_NAME, Key: plantCodeKey(plantCode) }));
    throw error;
  }
  return json(201, publicManagerSite(plant));
}

async function getPlant(event) {
  const ownerId = managerId(event);
  if (!ownerId) return json(401, { error: "Unauthorized" });
  const plant = await loadOwnedPlant(ownerId, event.pathParameters?.plantId);
  return plant ? json(200, publicManagerSite(plant)) : json(404, { error: "Plant not found" });
}

async function updatePlant(event) {
  const ownerId = managerId(event);
  if (!ownerId) return json(401, { error: "Unauthorized" });
  const plantId = event.pathParameters?.plantId;
  const previous = await loadOwnedPlant(ownerId, plantId);
  if (!previous) return json(404, { error: "Plant not found" });
  const parsed = parseBody(event);
  if (!parsed.ok) return json(400, { error: parsed.error });
  const check = validateSite(parsed.value);
  if (!check.ok) return json(400, { error: check.error });
  const plant = makePlant({
    plantId,
    ownerId,
    plantCode: previous.plantCode,
    input: check.value,
    previous,
    createdAt: previous.createdAt,
  });
  if (previous.lat !== plant.lat || previous.lon !== plant.lon) plant.locationVerifiedAt = null;
  if (check.value.deviceLocation) {
    const distanceM = distanceInMetres(plant.lat, plant.lon, check.value.deviceLocation.lat, check.value.deviceLocation.lon);
    plant.locationVerifiedAt = distanceM <= plant.radiusM ? toIso(new Date()) : null;
  }
  await putPlantRecord(plant);
  return json(200, publicManagerSite(plant));
}

async function deletePlant(event) {
  const ownerId = managerId(event);
  if (!ownerId) return json(401, { error: "Unauthorized" });
  const plantId = event.pathParameters?.plantId;
  const plant = await loadOwnedPlant(ownerId, plantId);
  if (!plant) return json(404, { error: "Plant not found" });
  const workers = await listSiteWorkers(plantId);
  await Promise.all(workers.map((worker) => doc.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: workerItemKey(plantId, worker.workerId),
  }))));
  await Promise.all([
    doc.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { zoneId: sitePartition(plantId), ts: "SITE" } })),
    doc.send(new DeleteCommand({ TableName: TABLE_NAME, Key: ownerPlantKey(ownerId, plantId) })),
    doc.send(new DeleteCommand({ TableName: TABLE_NAME, Key: plantCodeKey(plant.plantCode) })),
  ]);
  return json(200, { ok: true });
}

async function withOwnedPlant(event, handler, deactivate = false) {
  const ownerId = managerId(event);
  if (!ownerId) return json(401, { error: "Unauthorized" });
  const plantId = event.pathParameters?.plantId;
  if (!await loadOwnedPlant(ownerId, plantId)) return json(404, { error: "Plant not found" });
  const scopedEvent = {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { jwt: { claims: { ...event.requestContext?.authorizer?.jwt?.claims, sub: plantId } } },
    },
  };
  return handler(scopedEvent, deactivate);
}

async function loadPlantByCode(plantCode) {
  const result = await doc.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: plantCodeKey(plantCode),
  }));
  if (!result.Item?.plantId) return null;
  const plant = await loadPlant(result.Item.plantId);
  return plant?.plantCode === plantCode ? plant : null;
}

function workerLoginRateLimit(event) {
  const ip = event.requestContext?.http?.sourceIp || "unknown";
  const now = Date.now();
  const current = workerLoginWindows.get(ip);
  if (!current || now - current.startedAt >= WORKER_LOGIN_WINDOW_MS) {
    workerLoginWindows.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  if (current.count >= WORKER_LOGIN_LIMIT) return true;
  current.count += 1;
  return false;
}

function workerLoginNotFound() {
  return json(404, { error: "We couldn't find that worker ID" });
}

async function workerLogin(event) {
  if (workerLoginRateLimit(event)) {
    return json(429, { error: "Too many attempts. Please wait and try again." });
  }
  const parsed = parseBody(event);
  if (!parsed.ok) return workerLoginNotFound();
  const plantCode = typeof parsed.value.plantCode === "string"
    ? parsed.value.plantCode.trim().toUpperCase()
    : "";
  const workerId = typeof parsed.value.workerId === "string"
    ? parsed.value.workerId.trim().toUpperCase()
    : "";
  if (!plantCode || !workerId) return workerLoginNotFound();

  const plant = await loadPlantByCode(plantCode);
  const worker = plant && await loadWorker(plant.plantId, workerId);
  if (!plant || !worker?.active) return workerLoginNotFound();
  const zone = validZone(plant, worker.workerZoneId);
  const workerZone = zone || { exposure: 0.5, recentTooHotTaps: 0 };
  const events = zone ? await workerBreakEvents(plant.plantId, workerId) : [];
  const plan = getWorkerPlan({ ...worker, zone: workerZone }, plant.timeZone || "Asia/Kolkata", events);
  const sessionToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  for (const [token, session] of workerSessions) {
    if (Date.parse(session.expiresAt) <= Date.now()) workerSessions.delete(token);
  }
  workerSessions.set(sessionToken, { plantId: plant.plantId, workerId, expiresAt });
  return json(200, {
    name: worker.name,
    plantName: plant.name,
    zone: zone ? { id: zone.id, name: zone.name } : null,
    shift: plan.shift,
    nextBreak: plan.nextBreak,
    breakStatus: plan.breakStatus,
    sessionToken,
    expiresAt,
  });
}

async function findWorkerPlant(ownerId, workerId, plantCode) {
  const normalizedWorkerId = workerId.trim().toUpperCase();
  const normalizedPlantCode = plantCode?.trim().toUpperCase();
  const plants = await listOwnerPlants(ownerId);
  const matches = [];
  for (const plant of plants) {
    if (normalizedPlantCode && plant.plantCode !== normalizedPlantCode) continue;
    const worker = (await listSiteWorkers(plant.plantId))
      .find((item) => item.workerId === normalizedWorkerId);
    if (!worker) continue;
    const zone = validZone(plant, worker.workerZoneId);
    matches.push({
      plantId: plant.plantId,
      plantCode: plant.plantCode,
      plantName: plant.name,
      workerId: worker.workerId,
      workerName: worker.name,
      zone: zone ? { id: zone.id, name: zone.name } : null,
    });
  }
  return matches;
}

async function seedDemoWorkers(ownerId) {
  const plants = await listOwnerPlants(ownerId);
  const seeded = [];
  for (const plant of plants) {
    const existingWorkers = await listSiteWorkers(plant.plantId);
    const demoWorker = existingWorkers.find((worker) => worker.demoSeed);
    if (demoWorker) {
      seeded.push({ plantCode: plant.plantCode, workerId: demoWorker.workerId });
      continue;
    }
    if (existingWorkers.length) continue;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const workerId = generateWorkerId();
      const worker = {
        ...workerItemKey(plant.plantId, workerId),
        entityType: "worker",
        plantId: plant.plantId,
        demoSeed: true,
        name: "Demo Worker",
        workerZoneId: plant.zones[0]?.id || null,
        shiftStart: "07:00",
        shiftEnd: "15:00",
        active: true,
        workerId,
        createdAt: new Date().toISOString(),
        gsi1pk: `${sitePartition(plant.plantId)}#WORKER#${workerId}`,
        gsi1sk: "PROFILE",
      };
      try {
        await doc.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: worker,
          ConditionExpression: "attribute_not_exists(zoneId) AND attribute_not_exists(#ts)",
          ExpressionAttributeNames: { "#ts": "ts" },
        }));
        seeded.push({ plantCode: plant.plantCode, workerId });
        break;
      } catch (error) {
        if (error.name !== "ConditionalCheckFailedException") throw error;
      }
    }
  }
  return seeded;
}

async function lookupWorker(event) {
  const ownerId = managerId(event);
  if (!ownerId) return json(401, { error: "Unauthorized" });
  const workerId = event.queryStringParameters?.workerId;
  if (typeof workerId !== "string" || !workerId.trim()) {
    return json(400, { error: "workerId is required" });
  }
  const matches = await findWorkerPlant(ownerId, workerId, event.queryStringParameters?.plantCode);
  return json(200, { matches });
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
  return json(200, (await listSiteWorkers(sub)).map(managerWorker));
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
  if (check.value.zoneId && !validZone(site, check.value.zoneId)) {
    return json(400, { error: "zoneId must be a saved zone" });
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const workerId = generateWorkerId();
    const worker = {
      ...workerItemKey(sub, workerId),
      entityType: "worker",
      plantId: site.plantId || sub,
      name: check.value.name,
      workerZoneId: check.value.zoneId || null,
      shiftStart: check.value.shiftStart,
      shiftEnd: check.value.shiftEnd,
      active: check.value.active,
      ...(check.value.smsConsent ? { phone: check.value.phone, smsConsent: true } : { smsConsent: false }),
      workerId,
      createdAt: new Date().toISOString(),
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
      return json(201, managerWorker(worker));
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
  if (check.value.zoneId && !validZone(site, check.value.zoneId)) {
    return json(400, { error: "zoneId must be a saved zone" });
  }
  const updated = {
    ...current,
    name: check.value.name,
    workerZoneId: check.value.zoneId || null,
    shiftStart: check.value.shiftStart,
    shiftEnd: check.value.shiftEnd,
    active: parsed.value.active === undefined ? current.active : check.value.active,
    ...(check.value.smsConsent ? { phone: check.value.phone, smsConsent: true } : { phone: undefined, smsConsent: false }),
  };
  if (!updated.phone) delete updated.phone;
  await doc.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
  return json(200, managerWorker(updated));
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
    if (routeKey === "GET /plants") return getPlants(event);
    if (routeKey === "POST /plants") return createPlant(event);
    if (routeKey === "GET /plants/{plantId}") return getPlant(event);
    if (routeKey === "PUT /plants/{plantId}") return updatePlant(event);
    if (routeKey === "DELETE /plants/{plantId}") return deletePlant(event);
    if (routeKey === "GET /plants/{plantId}/zones") return withOwnedPlant(event, getZones);
    if (routeKey === "GET /plants/{plantId}/reports") return withOwnedPlant(event, getReports);
    if (routeKey === "GET /plants/{plantId}/breaks") return withOwnedPlant(event, getBreakSummary);
    if (routeKey === "GET /plants/{plantId}/workers") return withOwnedPlant(event, getWorkers);
    if (routeKey === "GET /plants/{plantId}/alert-settings") return withOwnedPlant(event, getAlertSettings);
    if (routeKey === "PUT /plants/{plantId}/alert-settings") return withOwnedPlant(event, saveAlertSettings);
    if (routeKey === "GET /plants/{plantId}/alerts") return withOwnedPlant(event, getPlantAlerts);
    if (routeKey === "POST /plants/{plantId}/workers") return withOwnedPlant(event, createWorker);
    if (routeKey === "PUT /plants/{plantId}/workers/{workerId}") return withOwnedPlant(event, updateWorker);
    if (routeKey === "DELETE /plants/{plantId}/workers/{workerId}") return withOwnedPlant(event, updateWorker, true);
    if (routeKey === "GET /public/sites/{siteId}") {
      return getPublicSite(event.pathParameters?.siteId);
    }
    if (routeKey === "POST /report") return postReport(event);
    if (routeKey === "POST /worker-login") return workerLogin(event);
    if (routeKey === "GET /workers/lookup") return lookupWorker(event);
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

exports.migrateLegacySite = migrateLegacySite;
exports.findWorkerPlant = findWorkerPlant;
exports.seedDemoWorkers = seedDemoWorkers;
