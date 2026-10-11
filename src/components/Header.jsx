import { hourLabel } from '../lib/scoring.js';

export default function Header({ hourIndex, isPlaying, onTogglePlay, isUsingSampleData, showBrand = true }) {
  return (
    <header className="dashboard-header">
      {showBrand && <div className="brand">
        <h1>HeatPulse</h1>
      </div>}
      <div className="header-meta">
        <span className="header-context">
          Heat forecast · {hourLabel(hourIndex)} · Shift {hourIndex < 7 ? 'A' : 'B'}
        </span>
        <button
          className="play-button"
          type="button"
          onClick={onTogglePlay}
          aria-pressed={isPlaying}
        >
          {isPlaying ? 'Pause day' : 'Play the day'}
        </button>
        {isUsingSampleData && <span className="sample-note">Sample data in use</span>}
      </div>
    </header>
  );
}
