import { describe, it, expect } from 'vitest';
import {
  score,
  statusWord,
  actionText,
  heatColor,
  textColor,
  calculateTotalReduction,
  formatHour
} from './scoring.js';
import { FIXES } from '../data/mock.js';

describe('scoring library pure functions', () => {
  it('calculates score correctly and caps at 100', () => {
    // curveValue = 0.94, exposure = 0.95, totalReduction = 0, simulatedTaps = 0
    // 100 * 0.94 * (0.4 + 0.57) = 100 * 0.94 * 0.97 = 91.18 -> round to 91
    expect(score(0.94, 0.95, 0, 0)).toBe(91);

    // Caps at 100 even with many taps
    expect(score(0.94, 0.95, 0, 10)).toBe(100);
  });

  it('verifies a fix never raises a score', () => {
    const scoreNoFix = score(0.88, 0.90, 0, 0);
    const scoreWithShade = score(0.88, 0.90, 0.30, 0);
    const scoreWithAllFixes = score(0.88, 0.90, 0.55, 0);

    expect(scoreWithShade).toBeLessThanOrEqual(scoreNoFix);
    expect(scoreWithAllFixes).toBeLessThanOrEqual(scoreWithShade);
  });

  it('returns appropriate statusWord based on score thresholds', () => {
    expect(statusWord(0)).toBe('Fine');
    expect(statusWord(39)).toBe('Fine');
    expect(statusWord(40)).toBe('Warm');
    expect(statusWord(64)).toBe('Warm');
    expect(statusWord(65)).toBe('Too hot');
    expect(statusWord(100)).toBe('Too hot');
  });

  it('returns appropriate actionText based on score thresholds', () => {
    expect(actionText(30)).toBe('No action needed.');
    expect(actionText(50)).toBe('Run fans; avoid heavy use.');
    expect(actionText(75)).toBe('Shade windows or open vents now.');
  });

  it('returns exact heatColor at stops and linear interpolation between', () => {
    expect(heatColor(0)).toBe('#A9D3B5');
    expect(heatColor(45)).toBe('#F0B24A');
    expect(heatColor(72)).toBe('#D9622F');
    expect(heatColor(100)).toBe('#8F2410');

    // Values outside range clamp to min/max colors
    expect(heatColor(-10)).toBe('#A9D3B5');
    expect(heatColor(110)).toBe('#8F2410');
  });

  it('determines textColor contrast based on threshold 76', () => {
    expect(textColor(75)).toBe('#1C1B19');
    expect(textColor(76)).toBe('#FFFFFF');
    expect(textColor(90)).toBe('#FFFFFF');
  });

  it('calculates total reduction for active fixes', () => {
    const activeFixes = ['shade', 'fans'];
    // Room 301 gets shade (0.30) + fans (0.10) = 0.40
    expect(calculateTotalReduction(301, activeFixes, FIXES)).toBe(0.40);
    // Room 313 gets only fans (0.10)
    expect(calculateTotalReduction(313, activeFixes, FIXES)).toBe(0.10);
  });

  it('formats hour index correctly', () => {
    expect(formatHour(0)).toBe('7 AM');
    expect(formatHour(5)).toBe('12 PM');
    expect(formatHour(7)).toBe('2 PM');
    expect(formatHour(11)).toBe('6 PM');
  });
});
