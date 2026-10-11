"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const net = require("node:net");

async function getAvailablePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function startServer(port, dataFile, extraEnv = {}) {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "dev-server.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      HEATPULSE_DEV_DATA_FILE: dataFile,
      ...extraEnv,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Local API exited during startup: ${stderr}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return child;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  child.kill();
  throw new Error(`Local API did not start in time: ${stderr}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve) => child.once("exit", resolve));
}

test("local API keeps the manager site across a backend restart", async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heatpulse-dev-server-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const dataFile = path.join(directory, "local-data.json");
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let child = await startServer(port, dataFile);
  context.after(async () => stopServer(child));

  const siteInput = {
    name: "INDUSTRY1",
    lat: 37.7749,
    lon: -122.4194,
    radiusM: 300,
    requireLocation: false,
    timeZone: "UTC",
    zones: [{
      name: "Furnace",
      kind: "process",
      roof: "metal",
      ventilation: "poor",
      headcount: 25,
    }],
  };
  const noSiteResponse = await fetch(`${baseUrl}/site`);
  assert.equal(noSiteResponse.status, 404);

  const saveResponse = await fetch(`${baseUrl}/site`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(siteInput),
  });
  assert.equal(saveResponse.status, 200);
  const saved = await saveResponse.json();
  assert.equal(saved.site.siteId, "local-manager");
  assert.equal(saved.site.name, "INDUSTRY1");

  const loaded = await fetch(`${baseUrl}/site`);
  assert.equal(loaded.status, 200);
  const loadedSite = await loaded.json();
  assert.equal(loadedSite.name, "INDUSTRY1");
  assert.equal(loadedSite.zones.length, 1);
  assert.equal(loadedSite.zones[0].name, "Furnace");
  assert.equal(fs.existsSync(dataFile), true);

  await stopServer(child);
  child = await startServer(port, dataFile);

  const afterRestart = await fetch(`${baseUrl}/site`);
  assert.equal(afterRestart.status, 200);
  const restartedSite = await afterRestart.json();
  assert.equal(restartedSite.name, "INDUSTRY1");
  assert.equal(restartedSite.zones.length, 1);
  assert.equal(restartedSite.zones[0].name, "Furnace");
  const migratedPlants = await fetch(`${baseUrl}/plants`);
  assert.equal(migratedPlants.status, 200);
  const plants = await migratedPlants.json();
  const migratedPlant = plants.find((plant) => plant.name === "INDUSTRY1");
  assert.ok(migratedPlant);
  assert.equal(migratedPlant.zones[0].name, "Furnace");
});

test("local API rate limits public worker reports by source IP", async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heatpulse-dev-rate-limit-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const port = await getAvailablePort();
  const child = await startServer(port, path.join(directory, "local-data.json"));
  context.after(async () => stopServer(child));

  const responses = await Promise.all(Array.from({ length: 61 }, () => fetch(`http://127.0.0.1:${port}/report`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  })));
  assert.equal(responses.filter((response) => response.status === 429).length, 1);
});

test("local API rate limits worker login attempts per IP", async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heatpulse-worker-rate-limit-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const port = await getAvailablePort();
  const child = await startServer(port, path.join(directory, "local-data.json"));
  context.after(async () => stopServer(child));

  const responses = await Promise.all(Array.from({ length: 11 }, () => fetch(`http://127.0.0.1:${port}/worker-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plantCode: "HP-NONE", workerId: "W-NONE" }),
  })));
  assert.equal(responses.filter((response) => response.status === 404).length, 10);
  assert.equal(responses.filter((response) => response.status === 429).length, 1);
});

test("local API migrates a legacy site and seeds a usable demo worker", async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heatpulse-worker-seed-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const dataFile = path.join(directory, "local-data.json");
  fs.writeFileSync(dataFile, JSON.stringify([{
    zoneId: "SITE#local-manager",
    ts: "SITE",
    entityType: "site",
    siteId: "local-manager",
    name: "Existing sample plant",
    lat: 12.3,
    lon: 45.6,
    radiusM: 300,
    requireLocation: false,
    timeZone: "UTC",
    zones: [{
      id: "sample-zone",
      name: "Packing",
      kind: "indoor",
      roof: "metal",
      ventilation: "average",
      headcount: 10,
    }],
  }]));
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = await startServer(port, dataFile);
  context.after(async () => stopServer(child));

  const plants = await (await fetch(`${baseUrl}/plants`)).json();
  assert.equal(plants.length, 1);
  const workersResponse = await fetch(`${baseUrl}/plants/${plants[0].plantId}/workers`);
  assert.equal(workersResponse.status, 200);
  const workers = await workersResponse.json();
  assert.equal(workers.length, 1);
  assert.match(workers[0].workerId, /^W-[A-Z0-9]{4}$/);
  const login = await fetch(`${baseUrl}/worker-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plantCode: plants[0].plantCode, workerId: workers[0].workerId }),
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).plantName, "Existing sample plant");
});

test("local API exposes empty plant list and owner-scoped plant CRUD", async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heatpulse-plant-routes-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const port = await getAvailablePort();
  const dataFile = path.join(directory, "dev-data.json");
  const child = await startServer(port, dataFile);
  context.after(async () => stopServer(child));
  const baseUrl = `http://127.0.0.1:${port}`;
  const headers = { "content-type": "application/json" };

  const initial = await fetch(`${baseUrl}/plants`);
  assert.equal(initial.status, 200);
  assert.deepEqual(await initial.json(), []);

  const payload = {
    name: "CRUD plant",
    lat: 12.3,
    lon: 45.6,
    radiusM: 300,
    requireLocation: false,
    timeZone: "UTC",
    zones: [],
  };
  const createdResponse = await fetch(`${baseUrl}/plants`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal((await fetch(`${baseUrl}/plants/${created.plantId}`)).status, 200);

  const updatedResponse = await fetch(`${baseUrl}/plants/${created.plantId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ ...payload, name: "Updated CRUD plant" }),
  });
  assert.equal(updatedResponse.status, 200);
  assert.equal((await updatedResponse.json()).name, "Updated CRUD plant");
  assert.equal((await fetch(`${baseUrl}/plants/not-owned`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/plants/${created.plantId}`, { method: "DELETE" })).status, 200);
  assert.deepEqual(await (await fetch(`${baseUrl}/plants`)).json(), []);
});

test("local API persists multiple plants and plant-scoped workers across restart", async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heatpulse-dev-plants-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const childData = path.join(directory, "plants.json");
  let child = await startServer(port, childData);
  context.after(async () => stopServer(child));

  const payload = {
    name: "North Works",
    lat: 12.3,
    lon: 45.6,
    radiusM: 300,
    requireLocation: false,
    timeZone: "UTC",
    zones: [{
      id: "zone-1",
      name: "Furnace",
      kind: "process",
      roof: "metal",
      ventilation: "poor",
      headcount: 12,
    }],
  };
  const createdResponse = await fetch(`${baseUrl}/plants`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.match(created.plantCode, /^HP-[A-Z0-9]{4}$/);
  const workerResponse = await fetch(`${baseUrl}/plants/${created.plantId}/workers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Demo Worker", zoneId: "zone-1", shiftStart: "07:00", shiftEnd: "15:00" }),
  });
  assert.equal(workerResponse.status, 201);
  const worker = await workerResponse.json();

  await stopServer(child);
  child = await startServer(port, childData);
  const [plantsResponse, workersResponse] = await Promise.all([
    fetch(`${baseUrl}/plants`),
    fetch(`${baseUrl}/plants/${created.plantId}/workers`),
  ]);
  assert.equal(plantsResponse.status, 200);
  assert.equal(workersResponse.status, 200);
  assert.equal((await plantsResponse.json()).map((plant) => plant.plantId).includes(created.plantId), true);
  assert.equal((await workersResponse.json()).some((item) => item.workerId === worker.workerId), true);
});

test("local alert run creates one outbox email, suppresses duplicates, clears, and persists history", async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heatpulse-alerts-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const outbox = path.join(directory, "outbox");
  const dataFile = path.join(directory, "dev-data.json");
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = {
    ALERT_ACK_SECRET: "local-test-signing-secret",
    ALERT_EMAIL_PROVIDER: "console",
    ALERT_OUTBOX_DIR: outbox,
    ALERT_INTERVAL_MS: "600000",
  };
  let child = await startServer(port, dataFile, env);
  context.after(async () => stopServer(child));
  const headers = { "content-type": "application/json" };
  const plantPayload = {
    name: "Alert plant",
    lat: 12.3,
    lon: 45.6,
    radiusM: 300,
    requireLocation: false,
    timeZone: "UTC",
    zones: [{
      id: "furnace",
      name: "Furnace Bay",
      kind: "process",
      roof: "metal",
      ventilation: "poor",
      headcount: 20,
    }],
  };
  const createdResponse = await fetch(`${baseUrl}/plants`, {
    method: "POST",
    headers,
    body: JSON.stringify(plantPayload),
  });
  assert.equal(createdResponse.status, 201);
  const plant = await createdResponse.json();
  const settings = {
    enabled: true,
    thresholds: { watch: 1, high: 2, critical: 100 },
    cooldownMinutes: 30,
    escalateAfterMinutes: 20,
    managerRecipients: ["manager@example.test"],
    workerAlertsEnabled: true,
    smsEnabled: false,
  };
  const savedSettings = await fetch(`${baseUrl}/plants/${plant.plantId}/alert-settings`, {
    method: "PUT",
    headers,
    body: JSON.stringify(settings),
  });
  assert.equal(savedSettings.status, 200);

  const testResponse = await fetch(`${baseUrl}/plants/${plant.plantId}/alerts/test`, {
    method: "POST",
    headers,
    body: JSON.stringify({ level: "high", zoneId: "furnace" }),
  });
  assert.equal(testResponse.status, 200);
  assert.equal(fs.readdirSync(outbox).length, 1);
  assert.match(fs.readFileSync(path.join(outbox, fs.readdirSync(outbox)[0]), "utf8"), /Furnace Bay/);

  const firstRun = await fetch(`${baseUrl}/dev/run-alerts`, { method: "POST" });
  assert.equal(firstRun.status, 200);
  assert.equal((await firstRun.json()).createdAlerts, 1);
  assert.equal(fs.readdirSync(outbox).length, 2);
  const duplicateRun = await fetch(`${baseUrl}/dev/run-alerts`, { method: "POST" });
  assert.equal((await duplicateRun.json()).createdAlerts, 0);
  assert.equal(fs.readdirSync(outbox).length, 2);

  const workerResponse = await fetch(`${baseUrl}/plants/${plant.plantId}/workers`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Alert worker",
      zoneId: "furnace",
      shiftStart: "07:00",
      shiftEnd: "15:00",
    }),
  });
  const worker = await workerResponse.json();
  const workerLogin = await fetch(`${baseUrl}/worker-login`, {
    method: "POST",
    headers,
    body: JSON.stringify({ plantCode: plant.plantCode, workerId: worker.workerId }),
  });
  assert.equal((await workerLogin.json()).activeAlert.level, "high");

  const coolerPlant = {
    ...plantPayload,
    zones: [{
      ...plantPayload.zones[0],
      kind: "cooled",
      roof: "concrete",
      ventilation: "good",
      headcount: 0,
    }],
  };
  const cooledResponse = await fetch(`${baseUrl}/plants/${plant.plantId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(coolerPlant),
  });
  assert.equal(cooledResponse.status, 200);
  const clearSettings = await fetch(`${baseUrl}/plants/${plant.plantId}/alert-settings`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      ...settings,
      thresholds: { watch: 50, high: 60, critical: 80 },
    }),
  });
  assert.equal(clearSettings.status, 200);
  const clearRun = await fetch(`${baseUrl}/dev/run-alerts`, { method: "POST" });
  assert.equal((await clearRun.json()).createdAlerts, 1);
  assert.equal(fs.readdirSync(outbox).length, 3);

  const alerts = await (await fetch(`${baseUrl}/plants/${plant.plantId}/alerts`)).json();
  assert.deepEqual(alerts.filter((item) => !item.test).map((item) => item.level).sort(), ["clear", "high"]);
  await stopServer(child);
  child = await startServer(port, dataFile, env);
  const persisted = await (await fetch(`${baseUrl}/plants/${plant.plantId}/alerts`)).json();
  assert.equal(persisted.length, 3);
});
