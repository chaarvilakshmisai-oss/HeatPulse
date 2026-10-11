import { describe, expect, it } from 'vitest';
import { buildBreakSchedule, buildZoneBreakSchedule } from './breaks.js';
import { MOCK_ZONES } from '../data/mock.js';
import { scoreZone } from './scoring.js';

describe('placeholder worker break schedule', () => {
  it('schedules low-heat breaks every two hours', () => {
    expect(buildBreakSchedule('08:00', '16:00', 25)).toEqual([
      { offsetMinutes: 120, durationMinutes: 15 },
      { offsetMinutes: 240, durationMinutes: 15 },
      { offsetMinutes: 360, durationMinutes: 15 },
    ]);
  });

  it('schedules medium-heat breaks every 90 minutes', () => {
    expect(buildBreakSchedule('08:00', '16:00', 50)).toEqual([
      { offsetMinutes: 90, durationMinutes: 20 },
      { offsetMinutes: 180, durationMinutes: 20 },
      { offsetMinutes: 270, durationMinutes: 20 },
      { offsetMinutes: 360, durationMinutes: 20 },
      { offsetMinutes: 450, durationMinutes: 20 },
    ]);
  });

  it('schedules high-heat breaks every hour with longer breaks', () => {
    expect(buildBreakSchedule('08:00', '12:00', 80)).toEqual([
      { offsetMinutes: 60, durationMinutes: 30 },
      { offsetMinutes: 120, durationMinutes: 30 },
      { offsetMinutes: 180, durationMinutes: 30 },
    ]);
  });

  it('computes break offsets correctly for shifts crossing midnight', () => {
    expect(buildBreakSchedule('22:00', '06:00', 80)).toEqual([
      { offsetMinutes: 60, durationMinutes: 30 },
      { offsetMinutes: 120, durationMinutes: 30 },
      { offsetMinutes: 180, durationMinutes: 30 },
      { offsetMinutes: 240, durationMinutes: 30 },
      { offsetMinutes: 300, durationMinutes: 30 },
      { offsetMinutes: 360, durationMinutes: 30 },
      { offsetMinutes: 420, durationMinutes: 30 },
    ]);
  });

  it('uses the heat score produced by scoreZone for a zone timetable', () => {
    const zone = MOCK_ZONES[0];
    expect(buildZoneBreakSchedule('08:00', '16:00', zone, 7)).toEqual(
      buildBreakSchedule('08:00', '16:00', scoreZone(zone, 7))
    );
  });
});
