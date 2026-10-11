"use strict";

const fs = require("node:fs");

function loadItems(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const items = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(items)) throw new Error(`Local dev data must be an array: ${filePath}`);
  return items;
}

function saveItems(filePath, items) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(items, null, 2));
  fs.renameSync(temporaryPath, filePath);
}

module.exports = { loadItems, saveItems };
