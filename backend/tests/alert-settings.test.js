"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { defaultAlertSettings, validateAlertSettings } = require("../src/alert-settings");

test("provides plant-scoped placeholder alert defaults", () => {
  assert.deepEqual(defaultAlertSettings("plant-1"), {
    plantId: "plant-1",
    enabled: false,
    thresholds: { watch: 40, high: 60, critical: 80 },
    cooldownMinutes: 30,
    escalateAfterMinutes: 20,
    managerRecipients: [],
    workerAlertsEnabled: false,
    smsEnabled: false,
  });
});

test("validates and normalizes alert settings", () => {
  assert.deepEqual(validateAlertSettings({
    enabled: true,
    thresholds: { watch: 35, high: 55, critical: 75 },
    cooldownMinutes: 15,
    escalateAfterMinutes: 25,
    quietHours: { start: "22:00", end: "06:00" },
    managerRecipients: [" Manager@Example.com ", "manager@example.com"],
    workerAlertsEnabled: true,
    smsEnabled: true,
  }, "plant-2"), {
    ok: true,
    value: {
      plantId: "plant-2",
      enabled: true,
      thresholds: { watch: 35, high: 55, critical: 75 },
      cooldownMinutes: 15,
      escalateAfterMinutes: 25,
      quietHours: { start: "22:00", end: "06:00" },
      managerRecipients: ["manager@example.com"],
      workerAlertsEnabled: true,
      smsEnabled: true,
    },
  });
});

test("rejects invalid thresholds, recipients, toggles, durations, and quiet hours", () => {
  const cases = [
    { thresholds: { watch: 60, high: 40, critical: 80 } },
    { thresholds: { watch: -1, high: 60, critical: 80 } },
    { managerRecipients: ["not-email"] },
    { enabled: "yes" },
    { cooldownMinutes: 0 },
    { quietHours: { start: "22:00", end: "22:00" } },
  ];
  for (const settings of cases) {
    assert.equal(validateAlertSettings(settings, "plant-1").ok, false, JSON.stringify(settings));
  }
});
