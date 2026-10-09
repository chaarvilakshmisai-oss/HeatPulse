import React from 'react';
import { statusWord, actionText, heatColor, textColor } from '../lib/scoring.js';

export default function FixFirst({ rooms, getRoomScore, onSelectRoom }) {
  // Compute scores and get top 3 highest score rooms
  const roomsWithScores = rooms.map(room => ({
    room,
    score: getRoomScore(room)
  }));

  roomsWithScores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.room.id - b.room.id;
  });

  const topThree = roomsWithScores.slice(0, 3);

  return (
    <div className="panel fix-first-panel">
      <h2 className="panel-title">Fix first</h2>
      <ol className="fix-first-list">
        {topThree.map(({ room, score }, idx) => {
          const status = statusWord(score);
          const action = actionText(score);
          const bg = heatColor(score);
          const fg = textColor(score);

          return (
            <li key={room.id} className="fix-first-item">
              <button
                type="button"
                className="fix-first-btn"
                onClick={() => onSelectRoom(room.id)}
                aria-label={`Priority ${idx + 1}: Room ${room.id} score ${score}. Action: ${action}`}
              >
                <span className="rank-num">{idx + 1}</span>
                <div className="item-content">
                  <div className="item-header">
                    <span className="item-room-id">Room {room.id}</span>
                    <span
                      className="chip mini-chip"
                      style={{ backgroundColor: bg, color: fg, borderColor: 'transparent' }}
                    >
                      {score} · {status}
                    </span>
                  </div>
                  <p className="item-action">{action}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
