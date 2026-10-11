"use strict";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // Asia/Kolkata = UTC+5:30, no DST
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const SEVEN_DAYS_S = 7 * 24 * 60 * 60;

/** ISO UTC timestamp (fixed-width, so string comparison == time comparison). */
function toIso(date) {
  return new Date(date).toISOString();
}

/** Start of the current day in Asia/Kolkata, as an ISO UTC string. */
function startOfTodayIst(now = new Date()) {
  const shifted = new Date(new Date(now).getTime() + IST_OFFSET_MS);
  const midnightShifted = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate()
  );
  return toIso(midnightShifted - IST_OFFSET_MS);
}

/** ISO UTC timestamp for two hours before `now`. */
function twoHoursAgo(now = new Date()) {
  return toIso(new Date(now).getTime() - TWO_HOURS_MS);
}

/** Epoch seconds, 7 days after `now` (DynamoDB TTL value). */
function expiresAt7Days(now = new Date()) {
  return Math.floor(new Date(now).getTime() / 1000) + SEVEN_DAYS_S;
}

module.exports = { toIso, startOfTodayIst, twoHoursAgo, expiresAt7Days };
