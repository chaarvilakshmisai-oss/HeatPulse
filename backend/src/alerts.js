"use strict";

const ALERT_THRESHOLD_DEFAULTS = Object.freeze({
  // Placeholder thresholds; an occupational health professional must set these.
  watch: 40,
  high: 60,
  critical: 80,
});
const ALERT_COOLDOWN_MINUTES = 30;
const ALERT_ESCALATE_AFTER_MINUTES = 20;

function scoreLevel(score, thresholds) {
  if (!Number.isFinite(score)) return null;
  if (score >= thresholds.critical) return "critical";
  if (score >= thresholds.high) return "high";
  if (score >= thresholds.watch) return "watch";
  return null;
}

function levelRank(level) {
  return ({ watch: 1, high: 2, critical: 3 })[level] || 0;
}

function localMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour").value);
  const minute = Number(parts.find((part) => part.type === "minute").value);
  return hour * 60 + minute;
}

function isQuiet(now, quietHours, timeZone) {
  if (!quietHours) return false;
  const minute = localMinutes(now, timeZone || "UTC");
  const [startHour, startMinute] = quietHours.start.split(":").map(Number);
  const [endHour, endMinute] = quietHours.end.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

function evaluateZone(zone, settings, lastAlert, now = new Date()) {
  if (!settings?.enabled) return { action: "none" };
  const instant = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(instant.getTime())) return { action: "none" };

  const thresholds = { ...ALERT_THRESHOLD_DEFAULTS, ...(settings.thresholds || {}) };
  const level = scoreLevel(zone?.score, thresholds);
  const previousLevel = lastAlert?.level === "clear" ? null : lastAlert?.level;
  const quiet = isQuiet(instant, settings.quietHours, settings.timeZone || zone?.timeZone);

  if (!level) {
    if (previousLevel && !quiet) return { action: "clear" };
    return { action: "none" };
  }

  if (levelRank(level) > levelRank(previousLevel)) {
    if (quiet && level !== "critical") return { action: "none" };
    return { action: "send", level };
  }

  if (!previousLevel) {
    if (quiet && level !== "critical") return { action: "none" };
    return { action: "send", level };
  }

  const createdAt = Date.parse(lastAlert?.createdAt || "");
  const elapsedMinutes = Number.isFinite(createdAt)
    ? (instant.getTime() - createdAt) / 60_000
    : Infinity;
  if (!lastAlert.acknowledgedAt
    && !lastAlert.escalationSentAt
    && elapsedMinutes >= (settings.escalateAfterMinutes ?? ALERT_ESCALATE_AFTER_MINUTES)) {
    if (quiet && previousLevel !== "critical") return { action: "none" };
    return { action: "escalate", level: previousLevel };
  }

  if (level === previousLevel
    && elapsedMinutes >= (settings.cooldownMinutes ?? ALERT_COOLDOWN_MINUTES)) {
    if (quiet && level !== "critical") return { action: "none" };
    return { action: "send", level };
  }
  return { action: "none" };
}

module.exports = {
  ALERT_COOLDOWN_MINUTES,
  ALERT_ESCALATE_AFTER_MINUTES,
  ALERT_THRESHOLD_DEFAULTS,
  evaluateZone,
};
