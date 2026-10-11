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

async function startServer(port, dataFile) {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "dev-server.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      HEATPULSE_DEV_DATA_FILE: dataFile,
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
