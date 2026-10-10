import { HOURLY_CURVE } from '../data/mock.js';
import { hourLabel, scoreZone } from './scoring.js';

export function summarizeDashboard(zones, hourIndex) {
  const hourlyScores = HOURLY_CURVE.map((_, hour) => (
    zones.length ? Math.max(...zones.map((zone) => scoreZone(zone, hour))) : 0
  ));
  const peakHour = hourlyScores.indexOf(Math.max(...hourlyScores));
  return {
    hotZoneCount: zones.filter((zone) => scoreZone(zone, hourIndex) >= 65).length,
    reportsToday: zones.reduce((total, zone) => total + (Number(zone.tapsToday) || 0), 0),
    peakRiskHour: hourLabel(peakHour),
  };
}
