"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const rows = new Map();

class GetCommand { constructor(input) { this.input = input; this.kind = "get"; } }
class PutCommand { constructor(input) { this.input = input; this.kind = "put"; } }
class QueryCommand { constructor(input) { this.input = input; this.kind = "query"; } }
class TransactWriteCommand { constructor(input) { this.input = input; this.kind = "transact"; } }

const fakeDynamo = {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  DynamoDBDocumentClient: {
    from() {
      return {
        async send(command) {
          const input = command.input;
          if (command.kind === "get") {
            return { Item: rows.get(`${input.Key.zoneId}|${input.Key.ts}`) };
          }
          if (command.kind === "put") {
            const key = `${input.Item.zoneId}|${input.Item.ts}`;
            if (input.ConditionExpression && rows.has(key)) {
              const error = new Error("Conditional request failed");
              error.name = "ConditionalCheckFailedException";
              throw error;
            }
            rows.set(key, input.Item);
            return {};
          }
          if (command.kind === "transact") {
            const [update, put] = input.TransactItems;
            const updateKey = `${update.Update.Key.zoneId}|${update.Update.Key.ts}`;
            const worker = rows.get(updateKey);
            const values = update.Update.ExpressionAttributeValues;
            const starting = update.Update.UpdateExpression.includes("SET activeBreakScheduledAt");
            const valid = worker?.active === true && (starting
              ? !worker.activeBreakScheduledAt
              : worker.activeBreakScheduledAt === values[":scheduledAt"]
                && worker.activeBreakZoneId === values[":zoneId"]);
            const putKey = `${put.Put.Item.zoneId}|${put.Put.Item.ts}`;
            if (!valid || rows.has(putKey)) {
              const error = new Error("Transaction cancelled");
              error.name = "TransactionCanceledException";
              throw error;
            }
            const updatedWorker = { ...worker };
            if (starting) {
              updatedWorker.activeBreakScheduledAt = values[":scheduledAt"];
              updatedWorker.activeBreakZoneId = values[":zoneId"];
            } else {
              updatedWorker.lastEndedBreakScheduledAt = values[":scheduledAt"];
              delete updatedWorker.activeBreakScheduledAt;
              delete updatedWorker.activeBreakZoneId;
            }
            rows.set(updateKey, updatedWorker);
            rows.set(putKey, put.Put.Item);
            return {};
          }
          const values = input.ExpressionAttributeValues;
          const partitionAttribute = input.IndexName === "WorkerBreaksIndex"
            ? "gsi1pk"
            : input.IndexName === "BreaksByPlantDayIndex" ? "gsi2pk" : "zoneId";
          const partition = values[":zoneId"] || values[":workerKey"] || values[":day"];
          const sortAttribute = input.IndexName === "WorkerBreaksIndex"
            ? "gsi1sk"
            : input.IndexName === "BreaksByPlantDayIndex" ? "gsi2sk" : "ts";
          let matches = [...rows.values()].filter((item) => item[partitionAttribute] === partition);
          const prefix = values[":reportPrefix"] || values[":workerPrefix"] || values[":breakPrefix"];
          if (prefix) matches = matches.filter((item) => item[sortAttribute].startsWith(prefix));
          if (values[":since"]) matches = matches.filter((item) => item.ts >= values[":since"]);
          matches.sort((left, right) => left[sortAttribute].localeCompare(right[sortAttribute]));
          if (input.ScanIndexForward === false) matches.reverse();
          const limit = input.Limit || matches.length || 1;
          return { Items: matches.slice(0, limit) };
        },
      };
    },
  },
};
const fakeClient = { DynamoDBClient: class {} };
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === "@aws-sdk/client-dynamodb") return fakeClient;
  if (request === "@aws-sdk/lib-dynamodb") return fakeDynamo;
  return originalLoad.call(this, request, ...args);
};
process.env.TABLE_NAME = "heatpulse-test";
const { handler } = require("../src/app");
Module._load = originalLoad;

const managerSub = "manager-test-sub";
const zoneInput = {
  name: "Furnace",
  kind: "process",
  roof: "metal",
  ventilation: "poor",
  headcount: 25,
};
const siteInput = {
  name: "Test plant",
  lat: 37.7749,
  lon: -122.4194,
  radiusM: 300,
  requireLocation: true,
  timeZone: "UTC",
  zones: [zoneInput],
};

function event(routeKey, { body, siteId, zoneId, workerId, query, sub = managerSub } = {}) {
  return {
    routeKey,
    body: body === undefined ? undefined : JSON.stringify(body),
    pathParameters: { siteId, zoneId, workerId },
    queryStringParameters: query || {},
    requestContext: {
      authorizer: sub ? { jwt: { claims: { sub } } } : undefined,
    },
  };
}

async function invoke(routeKey, options) {
  const response = await handler(event(routeKey, options));
  return {
    status: response.statusCode,
    body: response.body ? JSON.parse(response.body) : null,
    headers: response.headers,
  };
}

test("health and public site routes expose only their public contract", async () => {
  assert.deepEqual((await invoke("GET /health")).body, { ok: true });
  assert.equal((await invoke("GET /public/sites/{siteId}", { siteId: managerSub })).status, 404);

  const saved = await invoke("PUT /site", {
    body: {
      ...siteInput,
      deviceLocation: { lat: siteInput.lat, lon: siteInput.lon, accuracy: 5 },
    },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.site.siteId, managerSub);
  assert.equal(saved.body.locationCheck.status, "verified");
  assert.equal(Object.hasOwn(saved.body.site, "zoneId"), false);
  assert.equal(Object.hasOwn(saved.body.site, "entityType"), false);

  const publicSite = await invoke("GET /public/sites/{siteId}", { siteId: managerSub });
  assert.equal(publicSite.status, 200);
  assert.deepEqual(publicSite.body, {
    name: "Test plant",
    requireLocation: true,
    zones: [{ id: saved.body.site.zones[0].id, name: "Furnace" }],
  });
  assert.equal(Object.hasOwn(publicSite.body, "lat"), false);
});

test("manager site, zone and reports routes need a Cognito subject", async () => {
  assert.equal((await invoke("GET /site", { sub: null })).status, 401);
  assert.deepEqual((await invoke("GET /site")).body.siteId, managerSub);
  assert.equal((await invoke("GET /zones", { sub: null })).status, 401);
  assert.equal((await invoke("GET /reports", { sub: null })).status, 401);
});

test("worker reports enforce geofence and flow into manager counts/reports", async () => {
  const savedSite = (await invoke("GET /site")).body;
  const zoneId = savedSite.zones[0].id;
  const missingLocation = await invoke("POST /report", {
    body: { siteId: managerSub, zoneId, level: 3 },
  });
  assert.equal(missingLocation.status, 403);
  assert.equal(missingLocation.body.code, "location_required");

  const outside = await invoke("POST /report", {
    body: { siteId: managerSub, zoneId, level: 3, lat: 38.5, lon: -119 },
  });
  assert.equal(outside.status, 403);
  assert.equal(outside.body.code, "outside_area");

  const recorded = await invoke("POST /report", {
    body: { siteId: managerSub, zoneId, level: 3, lat: 37.775, lon: -122.4194, accuracy: 9 },
  });
  assert.equal(recorded.status, 201);
  assert.deepEqual(recorded.body, { ok: true, verified: true });
  const storedReport = [...rows.values()].find((item) => item.entityType === "report");
  assert.equal(storedReport.zoneId, `REPORT#${managerSub}#${zoneId}`);
  assert.match(storedReport.ts, /^REPORT#/);
  assert.equal(storedReport.reportZoneId, zoneId);
  assert.equal(storedReport.reportTs, reportsTimestamp(storedReport.ts));
  assert.equal(Object.hasOwn(storedReport, "lat"), false);
  assert.equal(Object.hasOwn(storedReport, "lon"), false);
  assert.equal(Object.hasOwn(storedReport, "accuracy"), false);

  const zones = await invoke("GET /zones");
  assert.equal(zones.status, 200);
  assert.equal(zones.body[0].tapsToday, 1);
  assert.equal(zones.body[0].recentTooHotTaps, 1);
  assert.equal(zones.body[0].exposure, savedSite.zones[0].exposure);

  const reports = await invoke("GET /reports", { query: { limit: "10" } });
  assert.equal(reports.status, 200);
  assert.equal(reports.body.length, 1);
  assert.deepEqual(
    (({ zoneId: returnedZone, zoneName, level, verified }) => ({ zoneId: returnedZone, zoneName, level, verified }))(reports.body[0]),
    { zoneId, zoneName: "Furnace", level: 3, verified: true },
  );
  assert.equal(typeof reports.body[0].ts, "string");
});

function reportsTimestamp(sortKey) {
  return sortKey.slice("REPORT#".length, sortKey.lastIndexOf("#"));
}

test("site validation and missing resources return contract-shaped errors", async () => {
  const invalid = await invoke("PUT /site", { body: { ...siteInput, radiusM: 20 } });
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error, /radiusM/);

  const invalidLimit = await invoke("GET /reports", { query: { limit: "1000" } });
  assert.equal(invalidLimit.status, 400);
  assert.equal(invalidLimit.body.error, "limit must be an integer from 1 to 100");

  const unknownSite = await invoke("POST /report", {
    body: { siteId: "missing-site", zoneId: "zone", level: 1 },
  });
  assert.equal(unknownSite.status, 404);
});

function workerShiftAroundNow() {
  const now = new Date();
  const time = (date) => `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
  return {
    shiftStart: time(new Date(now.getTime() - 4 * 60 * 60 * 1000)),
    shiftEnd: time(new Date(now.getTime() + 2 * 60 * 60 * 1000)),
  };
}

async function createTestWorker(overrides = {}) {
  const savedSite = (await invoke("GET /site")).body;
  return invoke("POST /workers", {
    body: {
      name: "Worker One",
      zoneId: savedSite.zones[0].id,
      ...workerShiftAroundNow(),
      ...overrides,
    },
  });
}

  test("manager can create, list, update and deactivate uniquely identified workers", async () => {
    const created = await createTestWorker();
    assert.equal(created.status, 201);
    assert.match(created.body.workerId, /^W-[A-Z0-9]{4}$/);
    assert.equal(created.body.active, true);
    const listed = await invoke("GET /workers");
    assert.equal(listed.status, 200);
    assert.ok(listed.body.some((worker) => worker.workerId === created.body.workerId));

    const updated = await invoke("PUT /workers/{workerId}", {
      workerId: created.body.workerId,
      body: { ...created.body, name: "Updated worker" },
    });
    assert.equal(updated.body.name, "Updated worker");
    const deactivated = await invoke("DELETE /workers/{workerId}", { workerId: created.body.workerId });
    assert.equal(deactivated.body.active, false);
  });

  test("public worker lookup hides unknown, inactive, and wrong-plant workers with one generic response", async () => {
    const created = await createTestWorker();
    const zoneId = created.body.zoneId;
    const unknown = await invoke("GET /public/workers/{siteId}/{zoneId}/{workerId}", {
      siteId: managerSub,
      zoneId,
      workerId: "W-UNKNOWN",
    });
    const wrongPlant = await invoke("GET /public/workers/{siteId}/{zoneId}/{workerId}", {
      siteId: "another-plant",
      zoneId,
      workerId: created.body.workerId,
    });
    assert.equal((await invoke("DELETE /workers/{workerId}", { workerId: created.body.workerId })).status, 200);
    const inactive = await invoke("GET /public/workers/{siteId}/{zoneId}/{workerId}", {
      siteId: managerSub,
      zoneId,
      workerId: created.body.workerId,
    });
    assert.deepEqual(
      [unknown, wrongPlant, inactive].map(({ status, body }) => ({ status, body })),
      [404, 404, 404].map(() => ({ status: 404, body: { error: "Worker not found" } })),
    );
  });

  test("public break events enforce start/end sequence and store soft geofence result", async () => {
    const created = await createTestWorker();
    const { workerId, zoneId } = created.body;
    const plan = await invoke("GET /public/workers/{siteId}/{zoneId}/{workerId}", {
      siteId: managerSub,
      zoneId,
      workerId,
    });
    assert.equal(plan.status, 200);
    assert.deepEqual(Object.keys(plan.body).sort(), ["breakStatus", "nextBreak", "shift"]);
    assert.ok(plan.body.nextBreak);
    const payload = {
      scheduledAt: plan.body.nextBreak.scheduledAt,
      lat: siteInput.lat,
      lon: siteInput.lon,
    };
    const endWithoutStart = await invoke("POST /public/workers/{siteId}/{zoneId}/{workerId}/breaks", {
      siteId: managerSub, zoneId, workerId, body: { ...payload, type: "end" },
    });
    assert.equal(endWithoutStart.status, 409);

    const started = await invoke("POST /public/workers/{siteId}/{zoneId}/{workerId}/breaks", {
      siteId: managerSub, zoneId, workerId, body: { ...payload, type: "start" },
    });
    assert.equal(started.status, 201);
    assert.equal(started.body.breakEvent.withinRadius, true);
    const duplicateStart = await invoke("POST /public/workers/{siteId}/{zoneId}/{workerId}/breaks", {
      siteId: managerSub, zoneId, workerId, body: { ...payload, type: "start" },
    });
    assert.equal(duplicateStart.status, 409);
    const ended = await invoke("POST /public/workers/{siteId}/{zoneId}/{workerId}/breaks", {
      siteId: managerSub, zoneId, workerId, body: { ...payload, type: "end" },
    });
    assert.equal(ended.status, 201);

    const summary = await invoke("GET /breaks");
    assert.equal(summary.status, 200);
    assert.equal(summary.body.workers.find((worker) => worker.workerId === workerId).breaksTaken, 1);
  });
