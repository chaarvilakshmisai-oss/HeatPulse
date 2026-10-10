import { describe, expect, it } from 'vitest';
import { MOCK_ZONES } from '../data/mock.js';
import {
  formatRanges,
  heatColor,
  hourLabel,
  score,
  statusWord,
} from './scoring.js';

describe('heat scoring', () => {
  it('scores every zone at 2 PM with no recent taps', () => {
    expect(MOCK_ZONES.map((zone) => score(zone, 7, zone.exposure, 0))).toEqual([
      91, 87, 83, 77, 69, 63, 60, 60, 80, 66, 55, 49,
    ]);
  });

  it('adds up to 15 points for recent too-hot taps', () => {
    expect(score(MOCK_ZONES[0], 7, MOCK_ZONES[0].exposure, 2)).toBe(97);
    expect(score(MOCK_ZONES[0], 7, MOCK_ZONES[0].exposure, 20)).toBe(100);
  });

  it('uses the provided exposure independently of the zone object', () => {
    expect(score(MOCK_ZONES[0], 7, 0.1, 0)).toBe(43);
  });

  it('uses the specified status thresholds', () => {
    expect([39, 40, 64, 65].map(statusWord)).toEqual([
      'Fine', 'Warm', 'Warm', 'Too hot',
    ]);
  });

  it.each([
    [39, '#2DD4A0'],
    [40, '#F5C542'],
    [64, '#F5C542'],
    [65, '#F2603E'],
    [81, '#F2603E'],
    [82, '#C0243A'],
  ])('maps score %i to heat bucket %s', (value, color) => {
    expect(heatColor(value)).toBe(color);
  });

  it('formats time labels and merges contiguous hour ranges', () => {
    expect(hourLabel(7)).toBe('2 PM');
    expect(formatRanges([0, 1, 2, 5, 6, 9])).toBe(
      '7 AM – 9 AM, 12 PM – 1 PM, 4 PM'
    );
    expect(formatRanges([])).toBe('None today');
  });
});
