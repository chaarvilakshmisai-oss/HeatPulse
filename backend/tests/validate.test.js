"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateBreakEvent, validateReport, validateSite, validateWorker } = require("../src/validate");

const validZone = {
  name: "Furnace",
  kind: "process",
  roof: "metal",
  ventilation: "poor",
  headcount: 32,
};

const validSite = {
  name: "Plant",
  lat: 12.3,
  lon: 45.6,
  radiusM: 300,
  requireLocation: true,
  timeZone: "Asia/Kolkata",
  zones: [validZone],
};

test("validates the public report contract with optional device location", () => {
  const result = validateReport({
    siteId: "site-id",
    zoneId: "zone-id",
    level: 3,
    lat: 12.3,
    lon: 45.6,
    accuracy: 8,
  });
  assert.deepEqual(result, {
    ok: true,
    value: {
      siteId: "site-id",
      zoneId: "zone-id",
      level: 3,
      lat: 12.3,
      lon: 45.6,
      accuracy: 8,
    },
  });
});

test("rejects malformed report bodies, levels, and coordinates", () => {
  for (const body of [null, undefined, "x", 3, [], true]) {
    assert.equal(validateReport(body).ok, false);
  }
  for (const level of [0, 4, -1, 1.5, "2", NaN, Infinity, null, undefined, true, []]) {
    assert.equal(validateReport({ siteId: "s", zoneId: "z", level }).ok, false);
  }
  assert.equal(validateReport({ siteId: "s", zoneId: "z", level: 1, lat: 1 }).ok, false);
  assert.equal(validateReport({ siteId: "s", zoneId: "z", level: 1, lat: 91, lon: 0 }).ok, false);
  assert.equal(validateReport({ siteId: "s", zoneId: "z", level: 1, accuracy: -1 }).ok, false);
});

test("validates and normalizes full site payloads while preserving optional zone ids", () => {
  const result = validateSite({
    ...validSite,
    zones: [{ ...validZone, id: "stable-zone-id" }],
    deviceLocation: { lat: 12.31, lon: 45.61, accuracy: 7 },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.zones[0], { ...validZone, id: "stable-zone-id" });
  assert.deepEqual(result.value.deviceLocation, { lat: 12.31, lon: 45.61, accuracy: 7 });
});

test("rejects invalid plant settings and zone fields with useful messages", () => {
  const invalid = [
    [{ ...validSite, name: "" }, "name"],
    [{ ...validSite, lat: 91 }, "lat"],
    [{ ...validSite, lon: -181 }, "lon"],
    [{ ...validSite, radiusM: 49 }, "radiusM"],
    [{ ...validSite, requireLocation: "yes" }, "requireLocation"],
    [{ ...validSite, zones: "not an array" }, "zones"],
    [{ ...validSite, zones: [{ ...validZone, name: "" }] }, "name"],
    [{ ...validSite, zones: [{ ...validZone, kind: "unknown" }] }, "kind"],
    [{ ...validSite, zones: [{ ...validZone, roof: "unknown" }] }, "roof"],
    [{ ...validSite, zones: [{ ...validZone, ventilation: "unknown" }] }, "ventilation"],
    [{ ...validSite, zones: [{ ...validZone, headcount: 5001 }] }, "headcount"],
  ];

  for (const [payload, messagePart] of invalid) {
    const result = validateSite(payload);
    assert.equal(result.ok, false);
    assert.match(result.error, new RegExp(messagePart));
  }
});

test("validates workers with a short-name source, zone and recurring overnight shift", () => {
  assert.deepEqual(validateWorker({
    name: " Worker One ",
    zoneId: "zone-1",
    shiftStart: "22:00",
    shiftEnd: "06:00",
  }), {
    ok: true,
    value: {
      name: "Worker One",
      zoneId: "zone-1",
      shiftStart: "22:00",
      shiftEnd: "06:00",
      active: true,
    },
  });
  for (const body of [
    { name: "", zoneId: "z", shiftStart: "07:00", shiftEnd: "15:00" },
    { name: "Worker", zoneId: "", shiftStart: "07:00", shiftEnd: "15:00" },
    { name: "Worker", zoneId: "z", shiftStart: "7:00", shiftEnd: "15:00" },
    { name: "Worker", zoneId: "z", shiftStart: "07:00", shiftEnd: "07:00" },
  ]) {
    assert.equal(validateWorker(body).ok, false);
  }
});

test("validates break start/end event payloads and optional coordinates", () => {
  assert.deepEqual(validateBreakEvent({
    type: "start",
    scheduledAt: "2026-10-11T08:00:00.000Z",
    lat: 12.3,
    lon: 45.6,
  }), {
    ok: true,
    value: {
      type: "start",
      scheduledAt: "2026-10-11T08:00:00.000Z",
      lat: 12.3,
      lon: 45.6,
    },
  });
  assert.equal(validateBreakEvent({ type: "pause", scheduledAt: "2026-10-11T08:00:00Z" }).ok, false);
  assert.equal(validateBreakEvent({ type: "end", scheduledAt: "not-a-date" }).ok, false);
  assert.equal(validateBreakEvent({ type: "end", scheduledAt: "2026-10-11T08:00:00Z", lat: 91, lon: 0 }).ok, false);
});
