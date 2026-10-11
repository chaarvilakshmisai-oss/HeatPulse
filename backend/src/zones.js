"use strict";

const KIND_BASE = Object.freeze({
  process: 0.72,
  indoor: 0.45,
  outdoor: 0.68,
  cooled: 0.18,
});

function estimateExposure(zone) {
  const roofAdjustment = { metal: 0.14, concrete: 0.05, open: 0.08 }[zone.roof] || 0;
  const ventilationAdjustment = { poor: 0.13, average: 0.04, good: -0.08 }[zone.ventilation] || 0;
  const workersAdjustment = Math.min(0.05, Math.max(0, zone.headcount) / 5000 * 0.05);
  return Math.max(
    0.1,
    Math.min(1, KIND_BASE[zone.kind] + roofAdjustment + ventilationAdjustment + workersAdjustment)
  );
}

module.exports = { estimateExposure };
