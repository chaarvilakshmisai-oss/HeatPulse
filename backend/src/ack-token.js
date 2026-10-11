"use strict";

const { createHmac, timingSafeEqual } = require("node:crypto");

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

function secretValue(secret) {
  const value = secret || process.env.ALERT_ACK_SECRET;
  if (!value) throw new Error("ALERT_ACK_SECRET is required to create acknowledgement links");
  return value;
}

function createAckToken(alert, secret, now = new Date()) {
  const payload = Buffer.from(JSON.stringify({
    plantId: alert.plantId,
    alertId: alert.alertId,
    exp: Math.floor(now.getTime() / 1000) + TOKEN_TTL_SECONDS,
  })).toString("base64url");
  const signature = createHmac("sha256", secretValue(secret)).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyAckToken(token, secret, now = new Date()) {
  if (typeof token !== "string") return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = createHmac("sha256", secretValue(secret)).update(payload).digest();
  let supplied;
  try {
    supplied = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof value.plantId !== "string" || typeof value.alertId !== "string"
      || !Number.isInteger(value.exp)
      || value.exp <= Math.floor(now.getTime() / 1000)) return null;
    return { plantId: value.plantId, alertId: value.alertId, exp: value.exp };
  } catch {
    return null;
  }
}

module.exports = { TOKEN_TTL_SECONDS, createAckToken, verifyAckToken };
