/**
 * Pure scoring and color functions for HeatPulse.
 */

/**
 * Calculate heat score for a room at a given hour curve value.
 * score = min(100, max(0, round(100 * curve[h] * (0.4 + 0.6 * exposure) * (1 - totalReduction)) + 3 * simulatedTaps[r]))
 */
export function score(curveValue, exposure, totalReduction = 0, simulatedTaps = 0) {
  const base = Math.round(100 * curveValue * (0.4 + 0.6 * exposure) * Math.max(0, 1 - totalReduction));
  const total = base + 3 * simulatedTaps;
  return Math.min(100, Math.max(0, total));
}

/**
 * Returns status word depending on heat score.
 */
export function statusWord(s) {
  if (s >= 65) return "Too hot";
  if (s >= 40) return "Warm";
  return "Fine";
}

/**
 * Returns action recommendation text based on heat score.
 */
export function actionText(s) {
  if (s >= 65) return "Shade windows or open vents now.";
  if (s >= 40) return "Run fans; avoid heavy use.";
  return "No action needed.";
}

/**
 * Interpolates RGB linearly across heat stops:
 * 0   -> #A9D3B5 (RGB: 169, 211, 181)
 * 45  -> #F0B24A (RGB: 240, 178, 74)
 * 72  -> #D9622F (RGB: 217, 98, 47)
 * 100 -> #8F2410 (RGB: 143, 36, 16)
 */
export function heatColor(s) {
  const clampedScore = Math.min(100, Math.max(0, s));

  let r1, g1, b1, r2, g2, b2, t;

  if (clampedScore <= 0) {
    return "#A9D3B5";
  } else if (clampedScore <= 45) {
    [r1, g1, b1] = [169, 211, 181];
    [r2, g2, b2] = [240, 178, 74];
    t = clampedScore / 45;
  } else if (clampedScore <= 72) {
    [r1, g1, b1] = [240, 178, 74];
    [r2, g2, b2] = [217, 98, 47];
    t = (clampedScore - 45) / (72 - 45);
  } else if (clampedScore < 100) {
    [r1, g1, b1] = [217, 98, 47];
    [r2, g2, b2] = [143, 36, 16];
    t = (clampedScore - 72) / (100 - 72);
  } else {
    return "#8F2410";
  }

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  const toHex = (n) => n.toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Text color for high vs low background contrast.
 * Tile text is white when score >= 76, otherwise ink (#1C1B19).
 */
export function textColor(s) {
  return s >= 76 ? "#FFFFFF" : "#1C1B19";
}

/**
 * Calculate total reduction factor for a room based on active fix IDs.
 */
export function calculateTotalReduction(roomId, activeFixes, fixesData) {
  if (!activeFixes || !fixesData) return 0;
  return fixesData.reduce((acc, fix) => {
    if (activeFixes.includes(fix.id) && fix.targetRooms.includes(roomId)) {
      return acc + fix.reduction;
    }
    return acc;
  }, 0);
}

/**
 * Helper to format hour index (0..11) to string (e.g. 0 -> 7 AM, 7 -> 2 PM).
 */
export function formatHour(index) {
  const hour = 7 + index;
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return `12 PM`;
  return `${hour - 12} PM`;
}
