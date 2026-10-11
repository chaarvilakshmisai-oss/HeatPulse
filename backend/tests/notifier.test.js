"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createAckToken, TOKEN_TTL_SECONDS, verifyAckToken } = require("../src/ack-token");
const {
  buildEmail,
  makeSms,
  maskPhone,
  notifyAlert,
  sendWithRetry,
  writeOutbox,
} = require("../src/notifier");

const now = new Date("2026-10-11T12:00:00.000Z");
const alert = {
  alertId: "alert-123",
  plantId: "plant-123",
  zoneId: "zone-123",
  level: "high",
  score: 82,
  createdAt: now.toISOString(),
};
const context = {
  plant: { plantId: alert.plantId, name: "Plant <North>", timeZone: "UTC" },
  zone: { id: alert.zoneId, name: "Furnace & <Bay>" },
  workers: [{ name: "Worker One" }],
  recipients: ["manager@example.test"],
  settings: { workerAlertsEnabled: false, smsEnabled: false },
};

test("acknowledgement tokens expire and reject tampering", () => {
  const token = createAckToken(alert, "test-signing-secret", now);
  assert.deepEqual(verifyAckToken(token, "test-signing-secret", now), {
    plantId: alert.plantId,
    alertId: alert.alertId,
    exp: Math.floor(now.getTime() / 1000) + TOKEN_TTL_SECONDS,
  });
  assert.equal(verifyAckToken(token, "test-signing-secret", new Date(now.getTime() + TOKEN_TTL_SECONDS * 1000)), null);
  const [payload, signature] = token.split(".");
  const changedSignature = `${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
  assert.equal(verifyAckToken(`${payload}.${changedSignature}`, "test-signing-secret", now), null);
  assert.equal(verifyAckToken(token, "different-secret", now), null);
});

test("console outbox writes escaped HTML, subject, and a text fallback", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heatpulse-outbox-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const message = buildEmail(alert, context, {
    now,
    secret: "test-signing-secret",
    dashboardUrl: "https://dashboard.example.test",
    apiBaseUrl: "https://api.example.test",
  });
  const originalLog = console.log;
  console.log = () => {};
  t.after(() => { console.log = originalLog; });
  const file = writeOutbox("manager@example.test", message, directory);
  const output = fs.readFileSync(file, "utf8");
  assert.match(message.subject, /^\[HeatPulse\] HIGH heat risk: Furnace & <Bay> \(score 82\) at Plant <North>$/);
  assert.match(output, /Subject: \[HeatPulse\] HIGH heat risk/);
  assert.match(output, /Plant &lt;North&gt;/);
  assert.match(output, /Furnace &amp; &lt;Bay&gt;/);
  assert.doesNotMatch(output, /<script>/);
  assert.match(output, /Check on workers and start scheduled breaks/);
  assert.match(output, /Acknowledge this alert/);
  assert.match(output, /HeatPulse scores are guidance, not medical advice\./);
  assert.match(output, /--- text fallback ---/);
  assert.match(message.acknowledgeUrl, /token=/);
});

test("delivery retries three times with backoff", async () => {
  let attempts = 0;
  const delays = [];
  await assert.rejects(sendWithRetry(async () => {
    attempts += 1;
    throw new Error("provider details must not be exposed");
  }, { delay: async (attempt) => delays.push(attempt) }));
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [1, 2]);
});

test("SMS requires both worker consent and the plant SMS settings and masks phone numbers", async (t) => {
  const originalProvider = process.env.ALERT_SMS_PROVIDER;
  const originalLog = console.log;
  process.env.ALERT_SMS_PROVIDER = "console";
  const messages = [];
  console.log = (value) => messages.push(value);
  t.after(() => {
    if (originalProvider === undefined) delete process.env.ALERT_SMS_PROVIDER;
    else process.env.ALERT_SMS_PROVIDER = originalProvider;
    console.log = originalLog;
  });
  const results = await notifyAlert(alert, {
    ...context,
    recipients: [],
    settings: { workerAlertsEnabled: true, smsEnabled: true },
    workers: [
      { phone: "+14155552671", smsConsent: false },
      { phone: "+14155552672", smsConsent: true },
    ],
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].channel, "sms");
  assert.equal(results[0].to, "*********72");
  assert.equal(messages.length, 1);
  assert.doesNotMatch(messages[0], /\+14155552672/);
  assert.ok(makeSms(alert, "Furnace").length < 160);
  assert.equal(maskPhone("+14155552672"), "*********72");
});

test("one provider failure is recorded generically without preventing other deliveries", async (t) => {
  const env = {
    ALERT_ACK_SECRET: process.env.ALERT_ACK_SECRET,
    ALERT_EMAIL_PROVIDER: process.env.ALERT_EMAIL_PROVIDER,
    ALERT_SMS_PROVIDER: process.env.ALERT_SMS_PROVIDER,
  };
  process.env.ALERT_ACK_SECRET = "test-signing-secret";
  process.env.ALERT_EMAIL_PROVIDER = "unsupported";
  process.env.ALERT_SMS_PROVIDER = "console";
  const originalLog = console.log;
  const logged = [];
  console.log = (value) => logged.push(value);
  t.after(() => {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    console.log = originalLog;
  });
  const result = await notifyAlert(alert, {
    ...context,
    recipients: ["first@example.test", "second@example.test"],
    settings: { workerAlertsEnabled: true, smsEnabled: true },
    workers: [{ phone: "+14155552672", smsConsent: true }],
  });
  assert.deepEqual(result.map((delivery) => delivery.status), ["failed", "failed", "sent"]);
  assert.match(result[0].error, /delivery failed after retries/);
  assert.doesNotMatch(result[0].error, /unsupported/i);
  assert.equal(result[2].to, "*********72");
  assert.doesNotMatch(logged.join(" "), /\+14155552672/);
});
