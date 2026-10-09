import React from 'react';
import { heatColor, formatHour } from '../lib/scoring.js';

export default function DayBars({ currentHourIndex, getPeakScoreForHour, onSelectHour }) {
  const hours = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div className="day-bars-container" role="region" aria-label="Daily heat timeline">
      <div className="day-bars-track">
        {hours.map(hourIndex => {
          const peakScore = getPeakScoreForHour(hourIndex);
          const heightPercent = Math.max(6, peakScore);
          const bg = heatColor(peakScore);
          const isCurrent = hourIndex === currentHourIndex;

          return (
            <button
              key={hourIndex}
              type="button"
              className={`day-bar ${isCurrent ? 'current' : ''}`}
              style={{
                height: `${heightPercent}%`,
                backgroundColor: bg,
              }}
              onClick={() => onSelectHour(hourIndex)}
              aria-label={`${formatHour(hourIndex)}: Peak score ${peakScore}`}
              title={`${formatHour(hourIndex)} - Max score: ${peakScore}`}
            >
              <span className="sr-only">
                {formatHour(hourIndex)} score {peakScore}
              </span>
            </button>
          );
        })}
      </div>

      <div className="day-bars-labels" aria-hidden="true">
        <span className="label-start">7 AM</span>
        <span className="label-peak">Peak around 2 PM</span>
        <span className="label-end">6 PM</span>
      </div>
    </div>
  );
}
