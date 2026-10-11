"use strict";

const fs = require("node:fs");

function loadItems(filePath) {
  if (!fs.existsSync(filePath)) return [];
  let items;
  try {
    items = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    throw new Error("Local dev data is not valid JSON; the original file was preserved");
  }
  if (!Array.isArray(items)) {
    throw new Error("Local dev data must contain an array; the original file was preserved");
  }
  return items;
}

function saveItems(filePath, items) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(items, null, 2));
  fs.renameSync(temporaryPath, filePath);
}

module.exports = { loadItems, saveItems };
