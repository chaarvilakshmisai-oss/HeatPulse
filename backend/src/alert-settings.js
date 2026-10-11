"use strict";

const { ALERT_THRESHOLD_DEFAULTS } = require("./alerts");

const DEFAULT_ALERT_SETTINGS = Object.freeze({
  enabled: false,
  thresholds: ALERT_THRESHOLD_DEFAULTS,
  cooldownMinutes: 30,
  escalateAfterMinutes: 20,
  managerRecipients: Object.freeze([]),
  workerAlertsEnabled: false,
  smsEnabled: false,
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function defaultAlertSettings(plantId) {
  return {
    plantId,
    ...DEFAULT_ALERT_SETTINGS,
    thresholds: { ...DEFAULT_ALERT_SETTINGS.thresholds },
    managerRecipients: [],
  };
}

function validateAlertSettings(input, plantId) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Body must be a JSON object" };
  }

  const defaults = defaultAlertSettings(plantId);
  const settings = {
    ...defaults,
    enabled: input.enabled ?? defaults.enabled,
    thresholds: { ...defaults.thresholds, ...input.thresholds },
    cooldownMinutes: input.cooldownMinutes ?? defaults.cooldownMinutes,
    escalateAfterMinutes: input.escalateAfterMinutes ?? defaults.escalateAfterMinutes,
    managerRecipients: input.managerRecipients ?? defaults.managerRecipients,
    workerAlertsEnabled: input.workerAlertsEnabled ?? defaults.workerAlertsEnabled,
    smsEnabled: input.smsEnabled ?? defaults.smsEnabled,
  };

  if (typeof settings.enabled !== "boolean"
    || typeof settings.workerAlertsEnabled !== "boolean"
    || typeof settings.smsEnabled !== "boolean") {
    return { ok: false, error: "Alert toggles must be booleans" };
  }
  if (!settings.thresholds || typeof settings.thresholds !== "object"
    || !["watch", "high", "critical"].every((level) => Number.isFinite(settings.thresholds[level]))) {
    return { ok: false, error: "All three alert thresholds must be numbers" };
  }
  const { watch, high, critical } = settings.thresholds;
  if ([watch, high, critical].some((value) => value < 0 || value > 100)
    || watch >= high || high >= critical) {
    return { ok: false, error: "Thresholds must be ordered from 0 to 100" };
  }
  for (const key of ["cooldownMinutes", "escalateAfterMinutes"]) {
    if (!Number.isInteger(settings[key]) || settings[key] < 1 || settings[key] > 1440) {
      return { ok: false, error: `${key} must be a whole number from 1 to 1440` };
    }
  }
  if (!Array.isArray(settings.managerRecipients)
    || settings.managerRecipients.some((email) => typeof email !== "string" || !EMAIL.test(email.trim()))) {
    return { ok: false, error: "managerRecipients must contain valid email addresses" };
  }
  settings.managerRecipients = [...new Set(settings.managerRecipients.map((email) => email.trim().toLowerCase()))];
  if (input.quietHours !== undefined && input.quietHours !== null) {
    if (!TIME.test(input.quietHours.start || "") || !TIME.test(input.quietHours.end || "")
      || input.quietHours.start === input.quietHours.end) {
      return { ok: false, error: "quietHours must have different HH:mm start and end times" };
    }
    settings.quietHours = { start: input.quietHours.start, end: input.quietHours.end };
  } else {
    delete settings.quietHours;
  }
  settings.plantId = plantId;
  return { ok: true, value: settings };
}

module.exports = { DEFAULT_ALERT_SETTINGS, defaultAlertSettings, validateAlertSettings };
