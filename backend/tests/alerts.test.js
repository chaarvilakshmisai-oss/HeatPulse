"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateZone } = require("../src/alerts");

const settings = {
  enabled: true,
  thresholds: { watch: 40, high: 60, critical: 80 },
  cooldownMinutes: 30,
  escalateAfterMinutes: 20,
};
const baseline = new Date("2026-10-11T12:00:00.000Z");
const zoneAt = (score) => ({ id: "zone-1", score });
const alertAt = (level, minutesAgo = 0, options = {}) => ({
  level,
  createdAt: new Date(baseline.getTime() - minutesAgo * 60_000).toISOString(),
  ...options,
});

test("sends the correct first alert band and stays silent below watch", () => {
  assert.deepEqual(evaluateZone(zoneAt(39), settings, null, baseline), { action: "none" });
  assert.deepEqual(evaluateZone(zoneAt(40), settings, null, baseline), { action: "send", level: "watch" });
  assert.deepEqual(evaluateZone(zoneAt(60), settings, null, baseline), { action: "send", level: "high" });
  assert.deepEqual(evaluateZone(zoneAt(80), settings, null, baseline), { action: "send", level: "critical" });
});

test("sends when risk rises to a higher band but not when it falls within an active band", () => {
  assert.deepEqual(evaluateZone(zoneAt(65), settings, alertAt("watch"), baseline), { action: "send", level: "high" });
  assert.deepEqual(evaluateZone(zoneAt(45), settings, alertAt("critical"), baseline), { action: "none" });
});

test("suppresses a repeated level during cooldown and permits it after cooldown", () => {
  const alreadyEscalated = { escalationSentAt: "2026-10-11T11:30:00.000Z" };
  assert.deepEqual(evaluateZone(zoneAt(65), settings, alertAt("high", 29, alreadyEscalated), baseline), { action: "none" });
  assert.deepEqual(evaluateZone(zoneAt(65), settings, alertAt("high", 30, alreadyEscalated), baseline), { action: "send", level: "high" });
});

test("escalates an unacknowledged alert once after the configured delay", () => {
  assert.deepEqual(evaluateZone(zoneAt(65), settings, alertAt("high", 19), baseline), { action: "none" });
  const escalated = alertAt("high", 20, { escalationSentAt: "2026-10-11T12:00:00.000Z" });
  assert.deepEqual(evaluateZone(zoneAt(65), settings, alertAt("high", 20), baseline), { action: "escalate", level: "high" });
  assert.deepEqual(evaluateZone(zoneAt(65), settings, escalated, baseline), { action: "none" });
});

test("acknowledgement prevents escalation", () => {
  assert.deepEqual(evaluateZone(zoneAt(65), settings, alertAt("high", 25, {
    acknowledgedAt: "2026-10-11T11:30:00.000Z",
  }), baseline), { action: "none" });
});

test("sends one clear action after risk falls below watch", () => {
  assert.deepEqual(evaluateZone(zoneAt(39), settings, alertAt("high"), baseline), { action: "clear" });
  assert.deepEqual(evaluateZone(zoneAt(39), settings, alertAt("clear"), baseline), { action: "none" });
});

test("respects quiet hours across midnight, using the plant time zone", () => {
  const quietSettings = { ...settings, quietHours: { start: "22:00", end: "06:00" }, timeZone: "UTC" };
  assert.deepEqual(evaluateZone(zoneAt(65), quietSettings, null, new Date("2026-10-11T23:00:00Z")), { action: "none" });
  assert.deepEqual(evaluateZone(zoneAt(65), quietSettings, null, new Date("2026-10-11T12:00:00Z")), { action: "send", level: "high" });
  assert.deepEqual(evaluateZone(zoneAt(39), quietSettings, alertAt("high"), new Date("2026-10-11T23:00:00Z")), { action: "none" });
});

test("critical risk overrides quiet hours", () => {
  const quietSettings = { ...settings, quietHours: { start: "22:00", end: "06:00" }, timeZone: "UTC" };
  assert.deepEqual(evaluateZone(zoneAt(80), quietSettings, null, new Date("2026-10-11T23:00:00Z")), { action: "send", level: "critical" });
});

test("disabled settings and invalid timestamps never trigger actions", () => {
  assert.deepEqual(evaluateZone(zoneAt(90), { ...settings, enabled: false }, null, baseline), { action: "none" });
  assert.deepEqual(evaluateZone(zoneAt(90), settings, null, "invalid"), { action: "none" });
});
