"use strict";

const KINDS = new Set(["process", "indoor", "outdoor", "cooled"]);
const ROOFS = new Set(["metal", "concrete", "open"]);
const VENTILATION = new Set(["poor", "average", "good"]);
const SHIFT_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function validTimeZone(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateReport(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  if (typeof body.siteId !== "string" || !body.siteId.trim()) {
    return { ok: false, error: "siteId is required" };
  }
  if (typeof body.zoneId !== "string" || !body.zoneId.trim()) {
    return { ok: false, error: "zoneId is required" };
  }
  if (!Number.isInteger(body.level) || body.level < 1 || body.level > 3) {
    return { ok: false, error: "level must be an integer from 1 to 3" };
  }

  const hasLat = body.lat !== undefined;
  const hasLon = body.lon !== undefined;
  if (hasLat !== hasLon) return { ok: false, error: "lat and lon must be supplied together" };
  if (hasLat && (!finiteNumber(body.lat) || body.lat < -90 || body.lat > 90)) {
    return { ok: false, error: "lat must be a number from -90 to 90" };
  }
  if (hasLon && (!finiteNumber(body.lon) || body.lon < -180 || body.lon > 180)) {
    return { ok: false, error: "lon must be a number from -180 to 180" };
  }
  if (body.accuracy !== undefined && (!finiteNumber(body.accuracy) || body.accuracy < 0)) {
    return { ok: false, error: "accuracy must be a non-negative number" };
  }

  return {
    ok: true,
    value: {
      siteId: body.siteId,
      zoneId: body.zoneId,
      level: body.level,
      ...(hasLat ? { lat: body.lat, lon: body.lon } : {}),
      ...(body.accuracy !== undefined ? { accuracy: body.accuracy } : {}),
    },
  };
}

function validateSite(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 80) {
    return { ok: false, error: "name must be between 1 and 80 characters" };
  }
  if (!finiteNumber(body.lat) || body.lat < -90 || body.lat > 90) {
    return { ok: false, error: "lat must be a number from -90 to 90" };
  }
  if (!finiteNumber(body.lon) || body.lon < -180 || body.lon > 180) {
    return { ok: false, error: "lon must be a number from -180 to 180" };
  }
  if (!Number.isInteger(body.radiusM) || body.radiusM < 50 || body.radiusM > 2000) {
    return { ok: false, error: "radiusM must be an integer from 50 to 2000" };
  }
  if (typeof body.requireLocation !== "boolean") {
    return { ok: false, error: "requireLocation must be a boolean" };
  }
  const timeZone = body.timeZone || "Asia/Kolkata";
  if (!validTimeZone(timeZone)) return { ok: false, error: "timeZone must be a valid IANA time zone" };
  if (!Array.isArray(body.zones)) {
    return { ok: false, error: "zones must be an array" };
  }

  const ids = new Set();
  const zones = [];
  for (const [index, zone] of body.zones.entries()) {
    if (!zone || typeof zone !== "object" || Array.isArray(zone)) {
      return { ok: false, error: `zones[${index}] must be an object` };
    }
    if (zone.id !== undefined && (typeof zone.id !== "string" || !zone.id.trim())) {
      return { ok: false, error: `zones[${index}].id must be a non-empty string` };
    }
    if (zone.id && ids.has(zone.id)) return { ok: false, error: "Zone ids must be unique" };
    if (zone.id) ids.add(zone.id);
    if (typeof zone.name !== "string" || !zone.name.trim() || zone.name.trim().length > 40) {
      return { ok: false, error: `zones[${index}].name must be between 1 and 40 characters` };
    }
    if (!KINDS.has(zone.kind)) return { ok: false, error: `zones[${index}].kind is invalid` };
    if (!ROOFS.has(zone.roof)) return { ok: false, error: `zones[${index}].roof is invalid` };
    if (!VENTILATION.has(zone.ventilation)) {
      return { ok: false, error: `zones[${index}].ventilation is invalid` };
    }
    if (!Number.isInteger(zone.headcount) || zone.headcount < 0 || zone.headcount > 5000) {
      return { ok: false, error: `zones[${index}].headcount must be an integer from 0 to 5000` };
    }
    zones.push({
      ...(zone.id ? { id: zone.id } : {}),
      name: zone.name.trim(),
      kind: zone.kind,
      roof: zone.roof,
      ventilation: zone.ventilation,
      headcount: zone.headcount,
    });
  }

  let deviceLocation;
  if (body.deviceLocation !== undefined) {
    const location = body.deviceLocation;
    if (!location || !finiteNumber(location.lat) || location.lat < -90 || location.lat > 90) {
      return { ok: false, error: "deviceLocation.lat must be a number from -90 to 90" };
    }
    if (!finiteNumber(location.lon) || location.lon < -180 || location.lon > 180) {
      return { ok: false, error: "deviceLocation.lon must be a number from -180 to 180" };
    }
    if (location.accuracy !== undefined && (!finiteNumber(location.accuracy) || location.accuracy < 0)) {
      return { ok: false, error: "deviceLocation.accuracy must be a non-negative number" };
    }
    deviceLocation = {
      lat: location.lat,
      lon: location.lon,
      ...(location.accuracy !== undefined ? { accuracy: location.accuracy } : {}),
    };
  }

  return {
    ok: true,
    value: {
      name: body.name.trim(),
      lat: body.lat,
      lon: body.lon,
      radiusM: body.radiusM,
      requireLocation: body.requireLocation,
      timeZone,
      zones,
      ...(deviceLocation ? { deviceLocation } : {}),
    },
  };
}

function validateWorker(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 80) {
    return { ok: false, error: "name must be between 1 and 80 characters" };
  }
  if (body.zoneId !== undefined && body.zoneId !== null
    && (typeof body.zoneId !== "string" || !body.zoneId.trim())) {
    return { ok: false, error: "zoneId must be a non-empty string or omitted" };
  }
  if (typeof body.shiftStart !== "string" || !SHIFT_TIME.test(body.shiftStart)) {
    return { ok: false, error: "shiftStart must be a 24-hour HH:mm time" };
  }
  if (typeof body.shiftEnd !== "string" || !SHIFT_TIME.test(body.shiftEnd)) {
    return { ok: false, error: "shiftEnd must be a 24-hour HH:mm time" };
  }
  if (body.shiftStart === body.shiftEnd) {
    return { ok: false, error: "shiftStart and shiftEnd must be different" };
  }
  if (body.active !== undefined && typeof body.active !== "boolean") {
    return { ok: false, error: "active must be a boolean" };
  }
  if (body.smsConsent !== undefined && typeof body.smsConsent !== "boolean") {
    return { ok: false, error: "smsConsent must be a boolean" };
  }
  const smsConsent = body.smsConsent === true;
  if (smsConsent && (typeof body.phone !== "string" || !/^\+?[1-9]\d{7,14}$/.test(body.phone.trim()))) {
    return { ok: false, error: "A valid international phone number is required when SMS consent is given" };
  }
  return {
    ok: true,
    value: {
      name: body.name.trim(),
      ...(body.zoneId ? { zoneId: body.zoneId } : {}),
      shiftStart: body.shiftStart,
      shiftEnd: body.shiftEnd,
      active: body.active !== false,
      smsConsent,
      ...(smsConsent ? { phone: body.phone.trim() } : {}),
    },
  };
}

function validateBreakEvent(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  if (body.type !== "start" && body.type !== "end") {
    return { ok: false, error: "type must be start or end" };
  }
  if (typeof body.scheduledAt !== "string" || Number.isNaN(Date.parse(body.scheduledAt))) {
    return { ok: false, error: "scheduledAt must be an ISO timestamp" };
  }
  const hasLat = body.lat !== undefined;
  const hasLon = body.lon !== undefined;
  if (hasLat !== hasLon) return { ok: false, error: "lat and lon must be supplied together" };
  if (hasLat && (!finiteNumber(body.lat) || body.lat < -90 || body.lat > 90)) {
    return { ok: false, error: "lat must be a number from -90 to 90" };
  }
  if (hasLon && (!finiteNumber(body.lon) || body.lon < -180 || body.lon > 180)) {
    return { ok: false, error: "lon must be a number from -180 to 180" };
  }
  return {
    ok: true,
    value: {
      type: body.type,
      scheduledAt: new Date(body.scheduledAt).toISOString(),
      ...(hasLat ? { lat: body.lat, lon: body.lon } : {}),
    },
  };
}

module.exports = { validateBreakEvent, validateReport, validateSite, validateWorker, validTimeZone };
