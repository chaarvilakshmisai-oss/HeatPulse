import { heatColor, scoreZone, statusWord } from '../lib/scoring.js';

export default function ZoneTile({ zone, hourIndex }) {
  const value = scoreZone(zone, hourIndex);
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
