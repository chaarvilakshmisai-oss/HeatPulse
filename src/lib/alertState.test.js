import { describe, expect, it } from 'vitest';
import { activePlantAlerts } from './alertState.js';

describe('active plant alerts', () => {
  it('returns only the latest non-test alert for each zone until a clear event', () => {
    const alerts = [
      { alertId: 'high', zoneId: 'zone-a', level: 'high', createdAt: '2026-10-11T10:00:00Z' },
      { alertId: 'test', zoneId: 'zone-b', level: 'critical', test: true, createdAt: '2026-10-11T12:00:00Z' },
      { alertId: 'clear', zoneId: 'zone-a', level: 'clear', createdAt: '2026-10-11T13:00:00Z' },
      { alertId: 'critical', zoneId: 'zone-b', level: 'critical', createdAt: '2026-10-11T11:00:00Z' },
    ];
    expect(activePlantAlerts(alerts).map((alert) => alert.alertId)).toEqual(['critical']);
  });
});
