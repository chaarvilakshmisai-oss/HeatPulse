export function activePlantAlerts(alerts = []) {
  const latestByZone = new Map();
  for (const alert of [...alerts]
    .filter((item) => !item.test)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))) {
    if (!latestByZone.has(alert.zoneId)) latestByZone.set(alert.zoneId, alert);
  }
  return [...latestByZone.values()].filter((alert) => alert.level !== 'clear');
}
