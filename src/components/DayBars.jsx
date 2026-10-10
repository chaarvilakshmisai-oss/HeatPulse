import { heatColor, hourLabel, score } from '../lib/scoring.js';

export default function DayBars({ zones, hourIndex, onSelectHour }) {
  const values = Array.from({ length: 12 }, (_, index) =>
    Math.max(...zones.map((zone) => score(zone, index, zone.exposure, zone.recentTooHotTaps || 0)))
  );
  const peakHour = values.indexOf(Math.max(...values));

  return (
    <section className="day-bars">
      <h2 className="eyebrow">Highest zone score through the day</h2>
      <div className="bar-track">
        {values.map((value, index) => (
          <button
            key={index}
            type="button"
            className={`day-bar${index === hourIndex ? ' selected' : ''}`}
            style={{
              height: `${Math.max(6, value)}%`,
              backgroundColor: heatColor(value),
            }}
            onClick={() => onSelectHour(index)}
            aria-label={`${hourLabel(index)}, highest score ${value}`}
            aria-pressed={index === hourIndex}
          />
        ))}
      </div>
      <div className="bar-labels">
        <span>7 AM</span>
        <span>Peak around {hourLabel(peakHour)}</span>
        <span>6 PM</span>
      </div>
    </section>
  );
}
