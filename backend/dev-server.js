"use strict";

/**
 * Runs the production Lambda handler against an in-memory DynamoDB substitute.
 * Manager routes use a fixed local Cognito subject; no AWS account is needed.
 */

const http = require("node:http");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const { loadItems, saveItems } = require("./dev-store");

const DATA_FILE = process.env.HEATPULSE_DEV_DATA_FILE || path.join(__dirname, ".dev-data.json");
const LEGACY_DATA_FILE = path.join(__dirname, ".local-data.json");
let items;
try {
  items = loadItems(
    !process.env.HEATPULSE_DEV_DATA_FILE
      && !fs.existsSync(DATA_FILE)
      && fs.existsSync(LEGACY_DATA_FILE)
      ? LEGACY_DATA_FILE
      : DATA_FILE,
  );
} catch (error) {
  console.error(`Unable to load local dev data: ${error.message}`);
  process.exit(1);
}

function persistItems() {
  saveItems(DATA_FILE, items);
}

class GetCommand { constructor(input) { this.input = input; this.kind = "get"; } }
class QueryCommand { constructor(input) { this.input = input; this.kind = "query"; } }
class ScanCommand { constructor(input) { this.input = input; this.kind = "scan"; } }
class PutCommand { constructor(input) { this.input = input; this.kind = "put"; } }
class DeleteCommand { constructor(input) { this.input = input; this.kind = "delete"; } }
class TransactWriteCommand { constructor(input) { this.input = input; this.kind = "transact"; } }

function indexKey(item, indexName) {
  return indexName === "WorkerBreaksIndex" ? "gsi1pk" : "gsi2pk";
}

const fakeLib = {
  GetCommand,
  QueryCommand,
  ScanCommand,
  PutCommand,
  DeleteCommand,
  TransactWriteCommand,
  DynamoDBDocumentClient: {
    from() {
      return {
        async send(command) {
          const input = command.input;
          if (command.kind === "get") {
            const item = items.find((entry) => (
              entry.zoneId === input.Key.zoneId && entry.ts === input.Key.ts
            ));
            return { Item: item ? { ...item } : undefined };
          }
          if (command.kind === "put") {
            const index = items.findIndex((entry) => (
              entry.zoneId === input.Item.zoneId && entry.ts === input.Item.ts
            ));
            if (index >= 0 && input.ConditionExpression) {
              const error = new Error("Conditional request failed");
              error.name = "ConditionalCheckFailedException";
              throw error;
            }
            if (index >= 0) items[index] = { ...input.Item };
            else items.push({ ...input.Item });
            persistItems();
            return {};
          }
          if (command.kind === "delete") {
            const index = items.findIndex((entry) => (
              entry.zoneId === input.Key.zoneId && entry.ts === input.Key.ts
            ));
            if (index >= 0) items.splice(index, 1);
            persistItems();
            return {};
          }
          if (command.kind === "scan") {
            const filterValue = input.ExpressionAttributeValues?.[":plant"];
            const matches = filterValue
              ? items.filter((entry) => entry.entityType === filterValue)
              : items;
            return { Items: matches.map((item) => ({ ...item })) };
          }
          if (command.kind === "transact") {
            const [update, put] = input.TransactItems;
            const updateKey = `${update.Update.Key.zoneId}|${update.Update.Key.ts}`;
            const worker = items.find((entry) => `${entry.zoneId}|${entry.ts}` === updateKey);
            const values = update.Update.ExpressionAttributeValues;
            const starting = update.Update.UpdateExpression.includes("SET activeBreakScheduledAt");
            const valid = worker?.active === true && (starting
              ? !worker.activeBreakScheduledAt
              : worker.activeBreakScheduledAt === values[":scheduledAt"]
                && worker.activeBreakZoneId === values[":zoneId"]);
            const putExists = items.some((entry) => (
              entry.zoneId === put.Put.Item.zoneId && entry.ts === put.Put.Item.ts
            ));
            if (!valid || putExists) {
              const error = new Error("Transaction cancelled");
              error.name = "TransactionCanceledException";
              throw error;
            }
            if (starting) {
              worker.activeBreakScheduledAt = values[":scheduledAt"];
              worker.activeBreakZoneId = values[":zoneId"];
            } else {
              worker.lastEndedBreakScheduledAt = values[":scheduledAt"];
              delete worker.activeBreakScheduledAt;
              delete worker.activeBreakZoneId;
            }
            items.push({ ...put.Put.Item });
            persistItems();
            return {};
          }

          const values = input.ExpressionAttributeValues;
          const partitionAttribute = input.IndexName ? indexKey(null, input.IndexName) : "zoneId";
          const partition = values[":zoneId"] || values[":owner"] || values[":workerKey"] || values[":day"] || values[":z"];
          const since = values[":since"];
          const prefix = values[":reportPrefix"] || values[":workerPrefix"] || values[":breakPrefix"] || values[":alertPrefix"];
          const sortAttribute = input.IndexName === "WorkerBreaksIndex"
            ? "gsi1sk"
            : input.IndexName === "BreaksByPlantDayIndex" ? "gsi2sk" : "ts";
          let matches = items.filter((entry) => entry[partitionAttribute] === partition);
          if (since) matches = matches.filter((entry) => entry.ts >= since);
          if (prefix) matches = matches.filter((entry) => entry[sortAttribute].startsWith(prefix));
          if (values[":three"] !== undefined) {
            matches = matches.filter((entry) => entry.level === values[":three"]);
          }
          matches.sort((left, right) => left[sortAttribute].localeCompare(right[sortAttribute]));
          if (input.ScanIndexForward === false) matches.reverse();

          if (input.ExclusiveStartKey) {
            const start = matches.findIndex((entry) => (
              entry.zoneId === input.ExclusiveStartKey.zoneId
              && entry.ts === input.ExclusiveStartKey.ts
            ));
            if (start >= 0) matches = matches.slice(start + 1);
          }

          const limit = input.Limit || matches.length || 1;
          const page = matches.slice(0, limit);
          return {
            Items: page.map((item) => ({ ...item })),
            ...(matches.length > limit
              ? { LastEvaluatedKey: { zoneId: page.at(-1).zoneId, ts: page.at(-1).ts } }
              : {}),
          };
        },
      };
    },
  },
};
const fakeClient = { DynamoDBClient: class {} };
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "@aws-sdk/client-dynamodb") return fakeClient;
  if (request === "@aws-sdk/lib-dynamodb") return fakeLib;
  return originalLoad.call(this, request, ...rest);
};

process.env.TABLE_NAME = "heatpulse-reports";
process.env.ALLOW_ORIGIN = "*";
const { handler, migrateLegacySite, seedDemoWorkers } = require("./src/app");
const { runAlertSweep } = require("./src/alert-scheduler");

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
};

function publicSiteId(path) {
  const match = path.match(/^\/public\/sites\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function routeKey(method, path) {
  if (path.startsWith("/public/sites/")) return `${method} /public/sites/{siteId}`;
  if (path === "/alerts/ack") return `${method} /alerts/ack`;
  if (/^\/plants\/[^/]+\/alerts\/test$/.test(path)) return `${method} /plants/{plantId}/alerts/test`;
  if (/^\/plants\/[^/]+\/alerts\/[^/]+\/ack$/.test(path)) {
    return `${method} /plants/{plantId}/alerts/{alertId}/ack`;
  }
  if (path === "/workers/lookup") return `${method} /workers/lookup`;
  if (/^\/plants\/[^/]+\/workers\/[^/]+$/.test(path)) return `${method} /plants/{plantId}/workers/{workerId}`;
  if (/^\/plants\/[^/]+\/workers$/.test(path)) return `${method} /plants/{plantId}/workers`;
  if (/^\/plants\/[^/]+\/alert-settings$/.test(path)) return `${method} /plants/{plantId}/alert-settings`;
  if (/^\/plants\/[^/]+\/alerts$/.test(path)) return `${method} /plants/{plantId}/alerts`;
  const nestedPlant = path.match(/^\/plants\/[^/]+(?:\/(?:zones|reports|breaks))?$/);
  if (nestedPlant) return `${method} ${nestedPlant[0].replace(/^\/plants\/[^/]+/, "/plants/{plantId}")}`;
  if (path === "/plants") return `${method} /plants`;
  if (/^\/public\/workers\/[^/]+\/[^/]+\/[^/]+\/breaks$/.test(path)) {
    return `${method} /public/workers/{siteId}/{zoneId}/{workerId}/breaks`;
  }
  if (/^\/public\/workers\/[^/]+\/[^/]+\/[^/]+$/.test(path)) {
    return `${method} /public/workers/{siteId}/{zoneId}/{workerId}`;
  }
  if (/^\/public\/workers\/[^/]+\/[^/]+$/.test(path)) {
    return `${method} /public/workers/{siteId}/{workerId}`;
  }
  if (/^\/workers\/[^/]+$/.test(path)) return `${method} /workers/{workerId}`;
  return `${method} ${path}`;
}

const publicRequestWindows = new Map();
const PUBLIC_REQUEST_LIMIT = 60;
const PUBLIC_WINDOW_MS = 60_000;
const MAX_REQUEST_BODY_BYTES = 1_048_576;

const server = http.createServer((request, response) => {
  const chunks = [];
  let requestBodyBytes = 0;
  let requestTooLarge = false;
  request.on("data", (chunk) => {
    requestBodyBytes += chunk.length;
    if (requestBodyBytes > MAX_REQUEST_BODY_BYTES) {
      requestTooLarge = true;
      chunks.length = 0;
      return;
    }
    if (!requestTooLarge) chunks.push(chunk);
  });
  request.on("end", async () => {
    if (requestTooLarge) {
      response.writeHead(413, { ...CORS, "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Request body is too large" }));
      return;
    }
    const url = new URL(request.url, "http://localhost");
    const path = url.pathname;
    if (request.method === "OPTIONS") {
      response.writeHead(204, CORS);
      response.end();
      return;
    }

    const key = routeKey(request.method, path);
    const ip = request.socket.remoteAddress || "unknown";
    const isPublicReport = key === "POST /report";
    const isWorkerLogin = key === "POST /worker-login";
    if (isPublicReport || isWorkerLogin || key.startsWith("GET /public/workers/") || key.startsWith("POST /public/workers/")) {
      const rateLimitKey = `${ip}:${isPublicReport ? "reports" : isWorkerLogin ? "worker-login" : "workers"}`;
      const limit = isWorkerLogin ? 10 : PUBLIC_REQUEST_LIMIT;
      const now = Date.now();
      const current = publicRequestWindows.get(rateLimitKey);
      if (!current || now - current.startedAt >= PUBLIC_WINDOW_MS) {
        publicRequestWindows.set(rateLimitKey, { startedAt: now, count: 1 });
      } else if (current.count >= limit) {
        response.writeHead(429, { ...CORS, "content-type": "application/json" });
        response.end(JSON.stringify({ error: "Too many requests. Please wait and try again." }));
        return;
      } else {
        current.count += 1;
      }
    }

    const body = Buffer.concat(chunks).toString("utf8");
    if (request.method === "POST" && path === "/dev/run-alerts") {
      runAlertSweep().then((summary) => {
        response.writeHead(200, { ...CORS, "content-type": "application/json" });
        response.end(JSON.stringify(summary));
      }).catch((error) => {
        console.error("Manual alert run failed", error?.message || "unknown error");
        response.writeHead(500, { ...CORS, "content-type": "application/json" });
        response.end(JSON.stringify({ error: "Unable to run alerts" }));
      });
      return;
    }
    const nestedPlantMatch = path.match(/^\/plants\/([^/]+)(?:\/workers(?:\/([^/]+))?|\/(zones|reports|breaks|alerts|alert-settings))?$/);
    const plantAlertMatch = path.match(/^\/plants\/([^/]+)\/alerts\/([^/]+)(?:\/ack)?$/);
    const publicWorkerMatch = path.match(/^\/public\/workers\/([^/]+)\/([^/]+)\/([^/]+)(?:\/breaks)?$/);
    const publicWorkerByIdMatch = path.match(/^\/public\/workers\/([^/]+)\/([^/]+)$/);
    const workerMatch = path.match(/^\/workers\/([^/]+)$/);
    const event = {
      routeKey: key,
      rawPath: path,
      pathParameters: {
        plantId: nestedPlantMatch?.[1] || plantAlertMatch?.[1]
          ? decodeURIComponent(nestedPlantMatch?.[1] || plantAlertMatch?.[1])
          : undefined,
        workerId: nestedPlantMatch?.[2] ? decodeURIComponent(nestedPlantMatch[2]) : undefined,
        siteId: publicSiteId(path)
          || (publicWorkerMatch ? decodeURIComponent(publicWorkerMatch[1]) : undefined)
          || (publicWorkerByIdMatch ? decodeURIComponent(publicWorkerByIdMatch[1]) : undefined),
        zoneId: publicWorkerMatch ? decodeURIComponent(publicWorkerMatch[2]) : undefined,
        workerId: publicWorkerMatch
          ? decodeURIComponent(publicWorkerMatch[3])
          : publicWorkerByIdMatch
            ? decodeURIComponent(publicWorkerByIdMatch[2])
            : workerMatch ? decodeURIComponent(workerMatch[1]) : undefined,
        alertId: plantAlertMatch?.[2] && plantAlertMatch[2] !== "test"
          ? decodeURIComponent(plantAlertMatch[2])
          : undefined,
      },
      queryStringParameters: Object.fromEntries(url.searchParams),
      body: body || undefined,
      headers: request.headers,
      isBase64Encoded: false,
      requestContext: {
        authorizer: { jwt: { claims: { sub: "local-manager" } } },
        http: { sourceIp: ip },
      },
    };
    try {
      const result = await handler(event);
      response.writeHead(result.statusCode, result.headers);
      response.end(result.body);
    } catch {
      response.writeHead(500, { ...CORS, "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Internal server error" }));
    }
  });
});

const port = Number(process.env.PORT) || 3000;
const alertIntervalMs = process.env.ALERT_INTERVAL_MS === undefined
  ? 60_000
  : Number(process.env.ALERT_INTERVAL_MS);
if (!Number.isSafeInteger(alertIntervalMs) || alertIntervalMs < 1_000) {
  throw new Error("ALERT_INTERVAL_MS must be a whole number of at least 1000");
}
let startupWorkers = [];
migrateLegacySite("local-manager")
  .then(() => seedDemoWorkers("local-manager"))
  .then((workers) => { startupWorkers = workers; })
  .then(() => {
    server.listen(port, () => {
      console.log(`HeatPulse local API on http://localhost:${server.address().port} (persistent local data; manager subject: local-manager)`);
      for (const worker of startupWorkers) {
        console.log(`Demo worker: plant code ${worker.plantCode}, Worker ID ${worker.workerId}`);
      }
      const timer = setInterval(() => {
        runAlertSweep().catch((error) => {
          console.error("Alert scheduler failed", error?.message || "unknown error");
        });
      }, alertIntervalMs);
      timer.unref();
    });
  })
  .catch((error) => {
    console.error("Unable to migrate local plant data", error.message);
    process.exitCode = 1;
  });
