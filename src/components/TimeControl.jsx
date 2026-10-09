import React from 'react';
import { formatHour } from '../lib/scoring.js';

export default function TimeControl({ hourIndex, onChangeHour, isPlaying, onTogglePlay }) {
  const timeLabel = formatHour(hourIndex);

  const handleSliderChange = (e) => {
    onChangeHour(parseInt(e.target.value, 10));
  };

  return (
    <div className="time-control-container">
      <div className="time-control-header">
        <div className="time-display" aria-live="polite">
          <span className="time-big">{timeLabel}</span>
          <span className="time-sub">Hostel Block C heat map</span>
        </div>
        <button
          type="button"
          className={`play-btn ${isPlaying ? 'playing' : ''}`}
          onClick={onTogglePlay}
          aria-label={isPlaying ? "Pause playback" : "Play the day animation"}
        >
          {isPlaying ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              <span>Pause</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <polygon points="5,3 19,12 5,21" />
              </svg>
              <span>Play the day</span>
            </>
          )}
        </button>
      </div>

      <div className="slider-wrapper">
        <input
          type="range"
          min="0"
          max="11"
          step="1"
          value={hourIndex}
          onChange={handleSliderChange}
          className="time-slider"
          aria-label="Select hour of day"
        />
        <div className="slider-ticks" aria-hidden="true">
          <span>7 AM</span>
          <span>12 PM</span>
          <span>6 PM</span>
        </div>
      </div>
    </div>
  );
}
