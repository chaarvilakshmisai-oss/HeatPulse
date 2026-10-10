import { actionText, heatColor, score } from '../lib/scoring.js';

export default function ActFirst({ zones, hourIndex }) {
  const rankedZones = [...zones]
    .map((zone) => ({ zone, value: score(zone, hourIndex, zone.exposure, zone.recentTooHotTaps || 0) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
  const topZone = rankedZones[0];

  return (
    <section className="act-first">
      <h2 className="eyebrow">Act first</h2>
      <ol className="risk-list">
        {rankedZones.map(({ zone, value }) => (
          <li key={zone.id}>
            <span>{zone.name}</span>
            <span
              className={`score-pill${value >= 82 ? ' score-pill-red' : ''}`}
              style={{ backgroundColor: heatColor(value) }}
            >
              {value}
            </span>
          </li>
        ))}
      </ol>
      {topZone && <p className="action-line">{actionText(topZone.value)}</p>}
    </section>
  );
}
