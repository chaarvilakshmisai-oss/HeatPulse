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
});
