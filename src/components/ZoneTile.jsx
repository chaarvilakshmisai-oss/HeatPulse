import { heatColor, score as getScore, statusWord } from '../lib/scoring.js';

export default function ZoneTile({ zone, hourIndex }) {
  const value = getScore(zone, hourIndex);

  return (
    <article
      className="zone-tile"
      style={{ borderBottomColor: heatColor(value) }}
      aria-label={`${zone.name}, ${statusWord(value)}, ${value}`}
    >
      <h3>{zone.name}</h3>
      <p>{statusWord(value)} · {value}</p>
    </article>
  );
}
