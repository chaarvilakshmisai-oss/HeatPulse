"use strict";

// Keep in sync with src/lib/breaks.js; these are placeholders, not medical or legal guidance.
const BREAK_RULES = Object.freeze([
  { maximumHeatScore: 39, intervalMinutes: 120, durationMinutes: 15 },
  { maximumHeatScore: 64, intervalMinutes: 90, durationMinutes: 20 },
  { maximumHeatScore: 100, intervalMinutes: 60, durationMinutes: 30 },
]);

const HOURLY_CURVE = [0.18, 0.24, 0.32, 0.44, 0.58, 0.74, 0.88, 0.94, 0.82, 0.62, 0.44, 0.3];

function getBreakRule(heatScore) {
  return BREAK_RULES.find((rule) => heatScore <= rule.maximumHeatScore) || BREAK_RULES.at(-1);
}

function buildBreakSchedule(shiftStart, shiftEnd, heatScore) {
  const [startHour, startMinute] = shiftStart.split(":").map(Number);
  const [endHour, endMinute] = shiftEnd.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  let end = endHour * 60 + endMinute;
  if (end <= start) end += 24 * 60;
  const rule = getBreakRule(heatScore);
  const breaks = [];
  for (let offsetMinutes = rule.intervalMinutes; offsetMinutes < end - start; offsetMinutes += rule.intervalMinutes) {
    breaks.push({ offsetMinutes, durationMinutes: rule.durationMinutes });
  }
  return breaks;
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function localDateString(date, timeZone) {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localDateTimeToUtc(dateString, timeString, timeZone) {
  const [year, month, day] = dateString.split("-").map(Number);
  const [hour, minute] = timeString.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = zonedParts(new Date(timestamp), timeZone);
    const actual = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const difference = target - actual;
    timestamp += difference;
    if (difference === 0) break;
  }
  return new Date(timestamp);
}

function shiftCandidates(worker, timeZone, now = new Date()) {
  const currentDate = localDateString(now, timeZone);
  const [year, month, day] = currentDate.split("-").map(Number);
  const startMinutes = Number(worker.shiftStart.slice(0, 2)) * 60 + Number(worker.shiftStart.slice(3));
  const endMinutes = Number(worker.shiftEnd.slice(0, 2)) * 60 + Number(worker.shiftEnd.slice(3));
  const shifts = [];
  for (let dayOffset = -1; dayOffset <= 2; dayOffset += 1) {
    const localDate = new Date(Date.UTC(year, month - 1, day + dayOffset));
    const startDate = localDate.toISOString().slice(0, 10);
    const endDate = new Date(Date.UTC(year, month - 1, day + dayOffset + (endMinutes <= startMinutes ? 1 : 0)))
      .toISOString().slice(0, 10);
    const start = localDateTimeToUtc(startDate, worker.shiftStart, timeZone);
    const end = localDateTimeToUtc(endDate, worker.shiftEnd, timeZone);
    const heatScore = scoreZoneAt(worker.zone, midpointHour(start, end, timeZone));
    const schedule = buildBreakSchedule(worker.shiftStart, worker.shiftEnd, heatScore)
      .map((item) => ({
        ...item,
        scheduledAt: new Date(start.getTime() + item.offsetMinutes * 60_000).toISOString(),
      }))
      .filter((item) => new Date(item.scheduledAt) < end);
    shifts.push({ start, end, heatScore, schedule });
  }
  return shifts;
}

function midpointHour(start, end, timeZone) {
  const midpoint = new Date((start.getTime() + end.getTime()) / 2);
  return Number(zonedParts(midpoint, timeZone).hour);
}

function scoreZoneAt(zone, hour, recentTooHotTaps = zone.recentTooHotTaps || 0) {
  const hourIndex = Math.max(0, Math.min(HOURLY_CURVE.length - 1, hour - 7));
  const exposure = Number.isFinite(zone.exposure) ? zone.exposure : 0.5;
  const base = Math.round(100 * HOURLY_CURVE[hourIndex] * (0.4 + 0.6 * exposure));
  return Math.min(100, base + Math.min(15, 3 * recentTooHotTaps));
}

function getWorkerPlan(worker, timeZone, events = [], now = new Date()) {
  const shifts = shiftCandidates(worker, timeZone, now);
  const activeShift = shifts.find(({ start, end }) => start <= now && now < end)
    || shifts.find(({ start }) => start > now);
  if (!activeShift) return { shift: null, nextBreak: null, breakStatus: "done" };

  const eventPairs = new Map();
  for (const event of events) {
    const current = eventPairs.get(event.scheduledAt) || {};
    current[event.type] = event;
    eventPairs.set(event.scheduledAt, current);
  }
  if (worker.activeBreakScheduledAt) {
    const current = eventPairs.get(worker.activeBreakScheduledAt) || {};
    current.start = current.start || { scheduledAt: worker.activeBreakScheduledAt };
    eventPairs.set(worker.activeBreakScheduledAt, current);
  }
  if (worker.lastEndedBreakScheduledAt) {
    const current = eventPairs.get(worker.lastEndedBreakScheduledAt) || {};
    current.end = current.end || { scheduledAt: worker.lastEndedBreakScheduledAt };
    eventPairs.set(worker.lastEndedBreakScheduledAt, current);
  }
  const nextBreak = activeShift.schedule.find(({ scheduledAt }) => !eventPairs.get(scheduledAt)?.end);
  if (!nextBreak) {
    return {
      shift: {
        start: activeShift.start.toISOString(),
        end: activeShift.end.toISOString(),
        timeZone,
      },
      nextBreak: null,
      breakStatus: "done",
    };
  }

  const pair = eventPairs.get(nextBreak.scheduledAt) || {};
  const breakStatus = pair.start
    ? "in_progress"
    : now >= new Date(nextBreak.scheduledAt) ? "due_now" : "upcoming";
  return {
    shift: {
      start: activeShift.start.toISOString(),
      end: activeShift.end.toISOString(),
      timeZone,
    },
    nextBreak: {
      scheduledAt: nextBreak.scheduledAt,
      durationMinutes: nextBreak.durationMinutes,
    },
    breakStatus,
  };
}

module.exports = {
  BREAK_RULES,
  buildBreakSchedule,
  getWorkerPlan,
  localDateString,
  localDateTimeToUtc,
  scoreZoneAt,
  shiftCandidates,
};
