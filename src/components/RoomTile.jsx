import React from 'react';
import { heatColor, textColor, statusWord } from '../lib/scoring.js';

export default function RoomTile({ room, score, isSelected, onSelect }) {
  const bg = heatColor(score);
  const fg = textColor(score);
  const status = statusWord(score);

  return (
    <button
      type="button"
      className={`room-tile ${isSelected ? 'selected' : ''}`}
      style={{
        backgroundColor: bg,
        color: fg,
      }}
      onClick={() => onSelect(room.id)}
      aria-label={`Room ${room.id}, status ${status}, heat score ${score}`}
      aria-pressed={isSelected}
    >
      <span className="room-number">{room.id}</span>
      <span className="room-status">{status}</span>
    </button>
  );
}
