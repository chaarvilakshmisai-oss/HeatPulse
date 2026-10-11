// Placeholder thresholds and durations; not medical or legal guidance.
export const BREAK_RULES = Object.freeze([
  { maximumHeatScore: 39, intervalMinutes: 120, durationMinutes: 15 },
  { maximumHeatScore: 64, intervalMinutes: 90, durationMinutes: 20 },
  { maximumHeatScore: 100, intervalMinutes: 60, durationMinutes: 30 },
]);

export const BREAK_SCHEDULE_NOTE = 'Placeholder schedule only; not medical or legal guidance.';

export function buildZoneBreakSchedule(shiftStart, shiftEnd, zone, hourIndex) {
  return buildBreakSchedule(shiftStart, shiftEnd, scoreZone(zone, hourIndex));
}

export function buildBreakSchedule(shiftStart, shiftEnd, heatScore) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(shiftStart)
    || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(shiftEnd)
    || shiftStart === shiftEnd
    || !Number.isFinite(heatScore)
    || heatScore < 0
    || heatScore > 100) {
    throw new Error('A valid shift and heat score from 0 to 100 are required.');
  }

  const [startHour, startMinute] = shiftStart.split(':').map(Number);
  const [endHour, endMinute] = shiftEnd.split(':').map(Number);
  const startMinutes = startHour * 60 + startMinute;
  let endMinutes = endHour * 60 + endMinute;
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  const rule = BREAK_RULES.find((item) => heatScore <= item.maximumHeatScore) || BREAK_RULES.at(-1);
  const breaks = [];
  for (let offsetMinutes = rule.intervalMinutes; offsetMinutes < endMinutes - startMinutes; offsetMinutes += rule.intervalMinutes) {
    breaks.push({ offsetMinutes, durationMinutes: rule.durationMinutes });
  }
  return breaks;
}
import { scoreZone } from './scoring.js';
