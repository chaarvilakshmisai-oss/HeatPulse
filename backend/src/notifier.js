"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const { createAckToken } = require("./ack-token");

const OUTBOX = process.env.ALERT_OUTBOX_DIR || path.join(__dirname, "..", ".dev-outbox");
const ses = new SESv2Client({});
const sns = new SNSClient({});

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

function instructionFor(level) {
  if (level === "critical") return "Stop work, move to a cooler area, drink water, and tell a supervisor now.";
  if (level === "high") return "Check on workers and start scheduled breaks; drink water and tell a supervisor.";
  if (level === "watch") return "Schedule rest breaks, drink water, and check on workers.";
  return "The heat score is now below the watch threshold. Normal monitoring can continue.";
}

function makeSubject(alert, context) {
  if (alert.level === "clear") return `[HeatPulse] All clear: ${context.zone.name} at ${context.plant.name}`;
  return `[HeatPulse] ${alert.level.toUpperCase()} heat risk: ${context.zone.name} (score ${alert.score}) at ${context.plant.name}`;
}

function buildEmail(alert, context, options = {}) {
  const now = options.now || new Date();
  const dashboardBase = (options.dashboardUrl || process.env.ALERT_DASHBOARD_URL || "http://localhost:5173")
    .replace(/\/+$/, "");
  const apiBase = (options.apiBaseUrl || process.env.ALERT_API_BASE_URL || "http://localhost:3000")
    .replace(/\/+$/, "");
  const dashboardUrl = `${dashboardBase}/app/plants/${encodeURIComponent(alert.plantId)}/dashboard`;
  const token = createAckToken(alert, options.secret, now);
  const acknowledgeUrl = `${apiBase}/alerts/ack?${new URLSearchParams({ token })}`;
  const level = alert.level === "clear" ? "All clear" : alert.level.toUpperCase();
  const time = new Date(alert.createdAt || now).toLocaleString("en-US", {
    timeZone: context.plant.timeZone || "UTC",
  });
  const workers = context.workers?.length
    ? context.workers.map((worker) => worker.name).join(", ")
    : "No workers assigned";
  const instruction = instructionFor(alert.level);
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#152238">
<h1>${escapeHtml(level)} heat risk</h1>
<p><strong>Plant:</strong> ${escapeHtml(context.plant.name)}</p>
<p><strong>Zone:</strong> ${escapeHtml(context.zone.name)}</p>
<p><strong>Score:</strong> ${escapeHtml(alert.score)}</p>
<p><strong>Level:</strong> ${escapeHtml(level)}</p>
<p><strong>Time:</strong> ${escapeHtml(time)}</p>
<p><strong>Workers assigned:</strong> ${escapeHtml(workers)}</p>
<p><strong>Recommended action:</strong> ${escapeHtml(instruction)}</p>
<p><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:12px 18px;background:#153e8a;color:#fff;text-decoration:none;border-radius:6px">Open dashboard</a></p>
<p><a href="${escapeHtml(acknowledgeUrl)}">Acknowledge this alert</a></p>
<hr><p>HeatPulse scores are guidance, not medical advice.</p>
</body></html>`;
  const text = [
    `${level} heat risk`,
    `Plant: ${context.plant.name}`,
    `Zone: ${context.zone.name}`,
    `Score: ${alert.score}`,
    `Level: ${level}`,
    `Time: ${time}`,
    `Workers assigned: ${workers}`,
    `Recommended action: ${instruction}`,
    `Dashboard: ${dashboardUrl}`,
    `Acknowledge: ${acknowledgeUrl}`,
    "HeatPulse scores are guidance, not medical advice.",
  ].join("\n");
  return { subject: makeSubject(alert, context), html, text, dashboardUrl, acknowledgeUrl };
}

async function sendWithRetry(operation, options = {}) {
  const attempts = options.attempts ?? 3;
  const delay = options.delay ?? ((attempt) => new Promise((resolve) => setTimeout(resolve, 100 * 2 ** (attempt - 1))));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await delay(attempt);
    }
  }
  throw lastError || new Error("Delivery failed");
}

function writeOutbox(to, message, directory = OUTBOX) {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${Date.now()}-${randomUUID()}.txt`);
  const content = [
    `To: ${to}`,
    `Subject: ${message.subject}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    message.html,
    "",
    "--- text fallback ---",
    message.text,
    "",
  ].join("\n");
  fs.writeFileSync(file, content);
  console.log(`HeatPulse console alert:\n${content}`);
  return file;
}

async function sendEmail(provider, to, message, env = process.env, options = {}) {
  if (provider === "console") return writeOutbox(to, message, options.outboxDirectory);
  if (provider === "smtp") {
    if (!env.SMTP_HOST || !env.SMTP_PORT || !env.ALERT_FROM) {
      throw new Error("SMTP_HOST, SMTP_PORT, and ALERT_FROM are required for SMTP delivery");
    }
    const nodemailer = require("nodemailer");
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT),
      secure: Number(env.SMTP_PORT) === 465,
      ...(env.SMTP_USER && env.SMTP_PASS
        ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }
        : {}),
    });
    await transport.sendMail({
      from: env.ALERT_FROM,
      to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    return true;
  }
  if (provider === "ses") {
    if (!env.ALERT_FROM) throw new Error("ALERT_FROM is required for SES delivery");
    await ses.send(new SendEmailCommand({
      FromEmailAddress: env.ALERT_FROM,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: message.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: message.html, Charset: "UTF-8" },
            Text: { Data: message.text, Charset: "UTF-8" },
          },
        },
      },
    }));
    return true;
  }
  throw new Error(`Unsupported ALERT_EMAIL_PROVIDER: ${provider}`);
}

function maskPhone(phone) {
  const digits = String(phone).replace(/\D/g, "");
  return `${"*".repeat(Math.max(0, digits.length - 2))}${digits.slice(-2)}`;
}

function makeSms(alert, zoneName) {
  const level = alert.level.toUpperCase();
  const content = `HeatPulse ${level}: ${zoneName}. Take a break, drink water, tell a supervisor.`;
  return content.length < 160 ? content : `${content.slice(0, 159)}`;
}

async function sendSms(provider, phone, message) {
  if (provider === "console") {
    console.log(`HeatPulse console SMS to ${maskPhone(phone)}: ${message}`);
    return true;
  }
  if (provider === "sns") {
    await sns.send(new PublishCommand({ PhoneNumber: phone, Message: message }));
    return true;
  }
  throw new Error(`Unsupported ALERT_SMS_PROVIDER: ${provider}`);
}

async function notifyAlert(alert, context) {
  const results = [];
  const recipients = context.recipients || context.settings.managerRecipients || [];
  let message;
  let messageError;
  if (recipients.length) {
    try {
      message = buildEmail(alert, context);
    } catch (error) {
      messageError = error;
    }
  }
  const emailProvider = process.env.ALERT_EMAIL_PROVIDER || "console";
  for (const to of recipients) {
    const sentAt = new Date().toISOString();
    try {
      if (messageError) throw messageError;
      await sendWithRetry(() => sendEmail(emailProvider, to, message));
      results.push({ channel: "email", to, status: "sent", sentAt });
    } catch (error) {
      results.push({
        channel: "email",
        to,
        status: "failed",
        sentAt,
        error: `${error?.name || "Error"}: delivery failed after retries`,
      });
    }
  }

  if (context.settings.workerAlertsEnabled && context.settings.smsEnabled
    && ["high", "critical"].includes(alert.level)) {
    const workers = (context.workers || []).filter((worker) => worker.smsConsent === true && worker.phone);
    const smsProvider = process.env.ALERT_SMS_PROVIDER || "console";
    for (const worker of workers) {
      const sentAt = new Date().toISOString();
      try {
        const body = makeSms(alert, context.zone.name);
        await sendWithRetry(() => sendSms(smsProvider, worker.phone, body));
        results.push({ channel: "sms", to: maskPhone(worker.phone), status: "sent", sentAt });
      } catch (error) {
        results.push({
          channel: "sms",
          to: maskPhone(worker.phone),
          status: "failed",
          sentAt,
          error: `${error?.name || "Error"}: delivery failed after retries`,
        });
      }
    }
  }
  return results;
}

module.exports = {
  buildEmail,
  escapeHtml,
  makeSms,
  maskPhone,
  notifyAlert,
  sendEmail,
  sendSms,
  sendWithRetry,
  writeOutbox,
};
