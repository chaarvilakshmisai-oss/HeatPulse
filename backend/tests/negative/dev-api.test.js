"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const net = require("node:net");

const backendRoot = path.resolve(__dirname, "../..");

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function startIsolatedServer(context, initialData = "[]") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heatpulse-negative-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const dataFile = path.join(directory, "dev-data.json");
  const outboxDir = path.join(directory, "outbox");
  fs.writeFileSync(dataFile, initialData);
  const port = await availablePort();
  const child = spawn(process.execPath, [path.join(backendRoot, "dev-server.js")], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PORT: String(port),
      HEATPULSE_DEV_DATA_FILE: dataFile,
      ALERT_EMAIL_PROVIDER: "console",
      ALERT_SMS_PROVIDER: "console",
      ALERT_INTERVAL_MS: "600000",
      ALERT_OUTBOX_DIR: outboxDir,
      ALERT_ACK_SECRET: "negative-test-only-signing-secret-not-for-real-use",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Isolated local API failed to start: ${stderr}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  if (child.exitCode !== null) throw new Error(`Isolated local API failed to start: ${stderr}`);
  context.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
  });
  return { baseUrl: `http://127.0.0.1:${port}`, child, dataFile, outboxDir };
}

async function checkedResponse(response, expectedStatus, messagePattern) {
  const text = await response.text();
  assert.equal(response.status, expectedStatus, text.slice(0, 200));
  assert.doesNotMatch(text, /(?:\n\s+at\s+|node_modules|[A-Z]:\\|\/(?:home|Users|tmp)\/)/i);
  assert.doesNotMatch(text, /Bearer\s+[A-Za-z0-9._-]+|password|secret/i);
  if (messagePattern) assert.match(text, messagePattern);
  return text ? JSON.parse(text) : null;
}

function plantPayload(overrides = {}) {
  return {
    name: "Negative-test plant",
    lat: 20,
    lon: 30,
    radiusM: 300,
    requireLocation: false,
    timeZone: "UTC",
    zones: [{
      name: "Furnace",
      kind: "process",
      roof: "metal",
      ventilation: "poor",
      headcount: 5,
    }],
    ...overrides,
  };
}

test("invalid and malformed local API requests fail with safe 4xx responses", async (t) => {
  const { baseUrl, dataFile } = await startIsolatedServer(t);
  const cases = [
    {
      label: "malformed JSON on plant creation",
      url: `${baseUrl}/plants`,
      init: { method: "POST", headers: { "content-type": "application/json" }, body: "{" },
      status: 400,
      message: /valid JSON/i,
    },
    {
      label: "empty body on plant creation",
      url: `${baseUrl}/plants`,
      init: { method: "POST", headers: { "content-type": "application/json" }, body: "" },
      status: 400,
      message: /required/i,
    },
    {
      label: "empty plant name",
      url: `${baseUrl}/plants`,
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "  ", lat: 20, lon: 30, radiusM: 300, requireLocation: false, zones: [] }),
      },
      status: 400,
      message: /name/i,
    },
    {
      label: "unknown route",
      url: `${baseUrl}/definitely-not-a-route`,
      init: {},
      status: 404,
      message: /not found/i,
    },
    {
      label: "0,0 coordinates",
      url: `${baseUrl}/plants`,
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(plantPayload({ lat: 0, lon: 0 })),
      },
      status: 400,
      message: /coordinates/i,
    },
    {
      label: "duplicate zone names",
      url: `${baseUrl}/plants`,
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(plantPayload({
          zones: [
            { name: "Furnace", kind: "process", roof: "metal", ventilation: "poor", headcount: 5 },
            { name: " furnace ", kind: "process", roof: "metal", ventilation: "poor", headcount: 8 },
          ],
        })),
      },
      status: 400,
      message: /zone names/i,
    },
    {
      label: "5000 zone payload",
      url: `${baseUrl}/plants`,
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(plantPayload({
          zones: Array.from({ length: 5000 }, (_, index) => ({
            name: `Zone ${index}`,
            kind: "process",
            roof: "metal",
            ventilation: "poor",
            headcount: 1,
          })),
        })),
      },
      status: 400,
      message: /fewer than 5000 zones/i,
    },
    {
      label: "wrong request content type",
      url: `${baseUrl}/plants`,
      init: {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify(plantPayload()),
      },
      status: 415,
      message: /content.type/i,
    },
    {
      label: "request body larger than one megabyte",
      url: `${baseUrl}/plants`,
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(plantPayload({ name: "x".repeat(1_100_000) })),
      },
      status: 413,
      message: /too large/i,
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.label, async () => {
      const response = await fetch(scenario.url, scenario.init);
      await checkedResponse(response, scenario.status, scenario.message);
    });
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(dataFile, "utf8")), []);
});

test("worker login throttles repeated failed attempts without disclosing identity", async (t) => {
  const { baseUrl } = await startIsolatedServer(t);
  const messages = [];
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch(`${baseUrl}/worker-login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plantCode: "UNKNOWN", workerId: `BAD${attempt}` }),
    });
    const payload = await checkedResponse(response, 404, /couldn't find that worker ID/i);
    messages.push(payload.error);
  }
  assert.equal(new Set(messages).size, 1);
  const limited = await fetch(`${baseUrl}/worker-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plantCode: "UNKNOWN", workerId: "BAD11" }),
  });
  await checkedResponse(limited, 429, /too many requests/i);
});

test("corrupt local store aborts startup and remains byte-for-byte untouched", async (t) => {
  const corrupt = "{ definitely not json";
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heatpulse-negative-corrupt-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const dataFile = path.join(directory, "dev-data.json");
  fs.writeFileSync(dataFile, corrupt);
  const port = await availablePort();
  const child = spawn(process.execPath, [path.join(backendRoot, "dev-server.js")], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PORT: String(port),
      HEATPULSE_DEV_DATA_FILE: dataFile,
      ALERT_EMAIL_PROVIDER: "console",
      ALERT_SMS_PROVIDER: "console",
      ALERT_INTERVAL_MS: "600000",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  await new Promise((resolve) => child.once("exit", resolve));
  assert.match(stderr, /Unable to load local dev data/i);
  assert.doesNotMatch(stderr, /password|secret/i);
  assert.equal(fs.readFileSync(dataFile, "utf8"), corrupt);
});

test("local development API is explicitly a synthetic manager session, not an auth boundary", async (t) => {
  const { baseUrl } = await startIsolatedServer(t);
  const response = await fetch(`${baseUrl}/plants`);
  await checkedResponse(response, 200, /\[\]/);
});

test("plant deletion removes scoped alerts and workers and a second deletion is a 404", async (t) => {
  const { baseUrl, dataFile } = await startIsolatedServer(t);
  const createdResponse = await fetch(`${baseUrl}/plants`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(plantPayload()),
  });
  const plant = await checkedResponse(createdResponse, 201);
  const plantId = plant.plantId;
  const zoneId = plant.zones[0].id;
  const workerResponse = await fetch(`${baseUrl}/plants/${plantId}/workers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Isolated worker",
      zoneId,
      shiftStart: "07:00",
      shiftEnd: "15:00",
    }),
  });
  const worker = await checkedResponse(workerResponse, 201);
  const settingsResponse = await fetch(`${baseUrl}/plants/${plantId}/alert-settings`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      enabled: false,
      managerRecipients: ["negative-test@example.invalid"],
    }),
  });
  await checkedResponse(settingsResponse, 200);
  const alertResponse = await fetch(`${baseUrl}/plants/${plantId}/alerts/test`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ level: "high", zoneId }),
  });
  await checkedResponse(alertResponse, 200);

  const deleted = await fetch(`${baseUrl}/plants/${plantId}`, { method: "DELETE" });
  await checkedResponse(deleted, 200);
  const rows = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  assert.equal(rows.some((row) => row.plantId === plantId), false);
  assert.equal(rows.some((row) => row.zoneId === `ALERT#${plantId}`), false);
  assert.equal(rows.some((row) => row.workerId === worker.workerId), false);
  const deletedAgain = await fetch(`${baseUrl}/plants/${plantId}`, { method: "DELETE" });
  await checkedResponse(deletedAgain, 404, /plant not found/i);
});
