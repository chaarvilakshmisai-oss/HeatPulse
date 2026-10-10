import { describe, expect, it } from 'vitest';
import { summarizeDashboard } from './dashboard.js';

describe('dashboard data summary', () => {
  it('scores from server exposure and recent too-hot reports and totals today taps', () => {
    const zones = [
      { id: 'hot', exposure: 0.9, recentTooHotTaps: 0, tapsToday: 4 },
      { id: 'cool', exposure: 0.1, recentTooHotTaps: 5, tapsToday: 9 },
    ];
    const summary = summarizeDashboard(zones, 7);

    expect(summary.hotZoneCount).toBe(1);
    expect(summary.reportsToday).toBe(13);
    expect(summary.peakRiskHour).toBe('2 PM');
  });

  it('supports an empty zone list', () => {
    expect(summarizeDashboard([], 7)).toEqual({
      hotZoneCount: 0,
      reportsToday: 0,
      peakRiskHour: '7 AM',
    });
  });
});
