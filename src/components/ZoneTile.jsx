import { heatColor, score as getScore, statusWord } from '../lib/scoring.js';

export default function ZoneTile({ zone, hourIndex }) {
  const value = getScore(zone, hourIndex, zone.exposure, zone.recentTooHotTaps || 0);
  const taps = zone.tapsToday ?? zone.baseTaps ?? 0;

  return (
    <article
      className="zone-tile"
      style={{ borderBottomColor: heatColor(value) }}
      aria-label={`${zone.name}, ${statusWord(value)}, ${value}`}
    >
      <h3>{zone.name}</h3>
      <p>{statusWord(value)} · {value} · {taps} reports</p>
    </article>
  );
}
