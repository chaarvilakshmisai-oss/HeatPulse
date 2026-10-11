"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { startOfTodayIst, twoHoursAgo, expiresAt7Days, toIso } = require("../src/time");

test("startOfTodayIst: midday UTC is the same IST day (18:30 UTC prior day)", () => {
  // 2026-10-10 06:00Z = 11:30 IST -> IST midnight = 2026-10-09T18:30:00Z
  assert.equal(startOfTodayIst(new Date("2026-10-10T06:00:00Z")), "2026-10-09T18:30:00.000Z");
});

test("startOfTodayIst: late UTC evening already rolled to next IST day", () => {
  // 2026-10-10 19:00Z = 2026-10-11 00:30 IST -> midnight = 2026-10-10T18:30Z
  assert.equal(startOfTodayIst(new Date("2026-10-10T19:00:00Z")), "2026-10-10T18:30:00.000Z");
});

test("startOfTodayIst: exact IST midnight boundary", () => {
  assert.equal(startOfTodayIst(new Date("2026-10-09T18:30:00Z")), "2026-10-09T18:30:00.000Z");
  assert.equal(startOfTodayIst(new Date("2026-10-09T18:29:59.999Z")), "2026-10-08T18:30:00.000Z");
});

test("twoHoursAgo subtracts exactly two hours", () => {
  assert.equal(twoHoursAgo(new Date("2026-10-10T06:00:00Z")), "2026-10-10T04:00:00.000Z");
  assert.equal(twoHoursAgo(new Date("2026-10-10T01:00:00Z")), "2026-10-09T23:00:00.000Z");
});

test("expiresAt7Days is epoch seconds exactly 7 days ahead", () => {
  const now = new Date("2026-10-10T06:00:00Z");
  const sec = Math.floor(now.getTime() / 1000);
  assert.equal(expiresAt7Days(now), sec + 7 * 86400);
  assert.ok(Number.isInteger(expiresAt7Days(now)));
});

test("toIso output is fixed-width so string compare matches time order", () => {
  const a = toIso(new Date("2026-01-01T00:00:00Z"));
  const b = toIso(new Date("2026-01-01T00:00:00.001Z"));
  assert.equal(a.length, b.length);
  assert.ok(a < b);
});
