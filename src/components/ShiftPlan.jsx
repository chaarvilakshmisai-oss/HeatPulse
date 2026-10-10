import { formatRanges, scoreZone } from '../lib/scoring.js';

export default function ShiftPlan({ zones }) {
  const safeHours = [];
  const restHours = [];
  const loadingHours = [];
  const outdoorZones = zones.filter((zone) => zone.kind === 'outdoor' || zone.id === 'dock');

  for (let hour = 0; hour < 12; hour += 1) {
    const highestScore = Math.max(...zones.map((zone) => scoreZone(zone, hour)));
    if (highestScore < 65) safeHours.push(hour);
    else restHours.push(hour);
    if (outdoorZones.some((zone) => scoreZone(zone, hour) >= 65)) loadingHours.push(hour);
  }

  const entries = [
    {
      className: 'safe',
      title: 'Safe for heavy work',
      time: safeHours.length ? formatRanges(safeHours) : 'None today',
    },
    {
      className: 'rest',
      title: 'Rest rotation, 15 min/hour',
      time: restHours.length ? formatRanges(restHours) : 'Not needed',
    },
    {
      className: 'loading',
      title: 'Avoid outdoor loading',
      time: loadingHours.length ? formatRanges(loadingHours) : 'Not needed',
    },
  ];

  return (
    <section className="shift-plan">
      <h2 className="eyebrow">Today&apos;s shift plan</h2>
      <div className="plan-list">
        {entries.map((entry, index) => (
          <div className="plan-entry" key={entry.className}>
            <p>
              <span className={`plan-dot ${entry.className}`} aria-hidden="true">●</span>
              <strong>{entry.title}</strong>
            </p>
            <span className="plan-time">{entry.time}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
