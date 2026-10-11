"use strict";

const { randomUUID } = require("node:crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");
const { evaluateZone } = require("./alerts");
const { defaultAlertSettings } = require("./alert-settings");
const { scoreZoneAt } = require("./breaks");

const TABLE_NAME = process.env.TABLE_NAME;
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const HOURLY_START = 7;

function keyForAlert(alert) {
  return {
    zoneId: `ALERT#${alert.plantId}`,
    ts: `ALERT#${alert.createdAt}#${alert.alertId}`,
  };
}

function localHour(date, timeZone) {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone || "UTC",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date));
}

async function queryAll(input, documentClient) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await documentClient.send(new QueryCommand({
      ...input,
      ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}),
    }));
    items.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function recentHotReports(plantId, zoneId, now, documentClient, tableName) {
  const reports = await queryAll({
    TableName: tableName,
    KeyConditionExpression: "zoneId = :zoneId AND begins_with(#ts, :reportPrefix)",
    ExpressionAttributeNames: { "#ts": "ts" },
    ExpressionAttributeValues: {
      ":zoneId": `REPORT#${plantId}#${zoneId}`,
      ":reportPrefix": "REPORT#",
    },
  }, documentClient);
  const cutoff = now.getTime() - 2 * 60 * 60_000;
  return reports.filter((report) => report.level === 3 && Date.parse(report.reportTs) >= cutoff).length;
}

async function sendNotification(notifier, alert, context) {
  try {
    const deliveries = await notifier(alert, context);
    return Array.isArray(deliveries) ? deliveries : [];
  } catch (error) {
    return [{
      channel: "email",
      to: "configured recipients",
      status: "failed",
      sentAt: new Date().toISOString(),
      error: error?.message || "Delivery failed",
    }];
  }
}

async function runAlertSweep({
  now = new Date(),
  documentClient = doc,
  tableName = TABLE_NAME,
  notifier = (...args) => require("./notifier").notifyAlert(...args),
} = {}) {
  const timestamp = now.toISOString();
  const plantResult = await documentClient.send(new ScanCommand({
    TableName: tableName,
    FilterExpression: "entityType = :plant",
    ExpressionAttributeValues: { ":plant": "plant" },
  }));
  const plants = plantResult.Items || [];
  let checkedZones = 0;
  let createdAlerts = 0;
  let deliveries = 0;

  for (const plant of plants) {
    const settingsResult = await documentClient.send(new GetCommand({
      TableName: tableName,
      Key: { zoneId: `SITE#${plant.plantId}`, ts: "ALERT_SETTINGS" },
    }));
    const settingsRecord = settingsResult.Item?.settings
      || defaultAlertSettings(plant.plantId);
    if (!settingsRecord.enabled) continue;
    const settings = { ...settingsRecord, timeZone: plant.timeZone || "UTC" };
    const [alertItems, workers] = await Promise.all([
      queryAll({
        TableName: tableName,
        KeyConditionExpression: "zoneId = :zoneId AND begins_with(#ts, :alertPrefix)",
        ExpressionAttributeNames: { "#ts": "ts" },
        ExpressionAttributeValues: {
          ":zoneId": `ALERT#${plant.plantId}`,
          ":alertPrefix": "ALERT#",
        },
        ScanIndexForward: false,
      }, documentClient),
      queryAll({
        TableName: tableName,
        KeyConditionExpression: "zoneId = :zoneId AND begins_with(#ts, :workerPrefix)",
        ExpressionAttributeNames: { "#ts": "ts" },
        ExpressionAttributeValues: {
          ":zoneId": `SITE#${plant.plantId}`,
          ":workerPrefix": "WORKER#",
        },
      }, documentClient),
    ]);
    const lastByZone = new Map();
    for (const alert of alertItems.sort((left, right) => right.createdAt.localeCompare(left.createdAt))) {
      if (!lastByZone.has(alert.zoneId)) lastByZone.set(alert.zoneId, alert);
    }
    const hourIndex = Math.max(0, Math.min(11, localHour(now, settings.timeZone) - HOURLY_START));

    for (const sourceZone of plant.zones || []) {
      checkedZones += 1;
      const recentTooHotTaps = await recentHotReports(
        plant.plantId,
        sourceZone.id,
        now,
        documentClient,
        tableName,
      );
      const score = scoreZoneAt(sourceZone, hourIndex + HOURLY_START, recentTooHotTaps);
      const zone = { ...sourceZone, score, timeZone: settings.timeZone };
      const previous = lastByZone.get(sourceZone.id) || null;
      const decision = evaluateZone(zone, settings, previous, now);
      if (decision.action === "none") continue;

      const alert = decision.action === "escalate"
        ? { ...previous, escalationSentAt: timestamp }
        : {
          alertId: randomUUID(),
          plantId: plant.plantId,
          zoneId: sourceZone.id,
          level: decision.action === "clear" ? "clear" : decision.level,
          score,
          createdAt: timestamp,
          acknowledgedAt: null,
          acknowledgedBy: null,
          deliveries: [],
          plantName: plant.name,
          zoneName: sourceZone.name,
          workersAssigned: workers
            .filter((worker) => worker.active && worker.workerZoneId === sourceZone.id)
            .map((worker) => worker.name),
        };
      const context = {
        plant,
        zone,
        workers: workers.filter((worker) => (
          worker.active && worker.workerZoneId === sourceZone.id
        )),
        recipients: settings.managerRecipients || [],
        settings,
        action: decision.action,
      };

      if (decision.action !== "escalate") {
        await documentClient.send(new PutCommand({
          TableName: tableName,
          Item: { ...keyForAlert(alert), entityType: "alert", ...alert },
        }));
        createdAlerts += 1;
      }
      const sent = await sendNotification(notifier, alert, context);
      alert.deliveries = [...(alert.deliveries || []), ...sent];
      deliveries += sent.length;
      await documentClient.send(new PutCommand({
        TableName: tableName,
        Item: { ...keyForAlert(alert), entityType: "alert", ...alert },
      }));
    }
  }
  return { plantsChecked: plants.length, checkedZones, createdAlerts, deliveries };
}

exports.handler = async () => {
  const summary = await runAlertSweep();
  return { statusCode: 200, body: JSON.stringify(summary) };
};
exports.runAlertSweep = runAlertSweep;
