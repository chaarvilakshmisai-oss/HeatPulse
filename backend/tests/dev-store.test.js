"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadItems, saveItems } = require("../dev-store");

test("local dev data persists manager-keyed sites across reloads", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heatpulse-dev-store-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "local-data.json");
  const managerSub = "local-manager";
  const site = {
    zoneId: `SITE#${managerSub}`,
    ts: "SITE",
    siteId: managerSub,
    name: "INDUSTRY1",
  };

  saveItems(filePath, [site]);

  const reloadedItems = loadItems(filePath);
  const managerSite = reloadedItems.find((item) => (
    item.zoneId === `SITE#${managerSub}` && item.ts === "SITE"
  ));
  assert.deepEqual(managerSite, site);
});
