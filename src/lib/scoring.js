import { HOURLY_CURVE } from '../data/mock.js';

export function score(zone, hourIndex, recentTooHotTaps = 0) {
  const base = Math.round(
    100 * HOURLY_CURVE[hourIndex] * (0.4 + 0.6 * zone.exposure)
  );
  return Math.min(100, base + Math.min(15, 3 * recentTooHotTaps));
}

export function statusWord(value) {
  if (value >= 65) return 'Too hot';
  if (value >= 40) return 'Warm';
  return 'Fine';
}

export function heatColor(value) {
  if (value >= 82) return '#C0243A';
  if (value >= 65) return '#F2603E';
  if (value >= 40) return '#F5C542';
  return '#2DD4A0';
}

export function actionText(value) {
  if (value >= 65) return 'Rotate workers and add water breaks now.';
  if (value >= 40) return 'Schedule rest breaks; limit heavy work.';
  return 'No action needed.';
}

export function hourLabel(hourIndex) {
  const hour = hourIndex + 7;
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

export function formatRanges(hourIndices) {
  if (!hourIndices.length) return 'None today';

  const sorted = [...new Set(hourIndices)].sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0];
  let end = start;

  for (const hour of sorted.slice(1)) {
    if (hour === end + 1) {
      end = hour;
    } else {
      ranges.push([start, end]);
      start = end = hour;
    }
  }
  ranges.push([start, end]);

  return ranges
    .map(([from, to]) =>
      from === to ? hourLabel(from) : `${hourLabel(from)} – ${hourLabel(to)}`
    )
    .join(', ');
}
