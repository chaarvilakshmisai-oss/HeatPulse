import React from 'react';
import { statusWord, actionText, heatColor, textColor } from '../lib/scoring.js';

export default function RoomCard({ room, score, simulatedTaps, onAddTap }) {
  if (!room) return null;

  const status = statusWord(score);
  const action = actionText(score);
  const bg = heatColor(score);
  const fg = textColor(score);
  const baseTaps = room.baseTaps || 0;
  const extraTaps = simulatedTaps || 0;
  const totalTaps = baseTaps + extraTaps;

  return (
    <div className="panel room-card-panel">
      <div className="card-header">
        <h2 className="room-title">Room {room.id}</h2>
        <span
          className="chip room-score-chip"
          style={{ backgroundColor: bg, color: fg, borderColor: 'transparent' }}
        >
          {status} · {score}
        </span>
      </div>

      <p className="room-description">{room.description}</p>

      <div className="card-stats">
        <div className="stat-row">
          <span className="stat-label">Resident taps:</span>
          <span className="stat-value">
            <strong>{totalTaps}</strong> ({baseTaps} base + {extraTaps} simulated)
          </span>
        </div>

        <div className="action-box">
          <span className="action-label">Recommended action:</span>
          <p className="action-text">{action}</p>
        </div>
      </div>

      <button
        type="button"
        className="simulate-tap-btn"
        onClick={() => onAddTap(room.id)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        <span>Simulate a resident tap</span>
      </button>
    </div>
  );
}
