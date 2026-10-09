import React from 'react';
import { FIXES } from '../data/mock.js';

export default function FixToggles({ activeFixes, onToggleFix }) {
  return (
    <div className="panel fix-toggles-panel">
      <h2 className="panel-title">What if we fix it?</h2>
      <div className="toggles-list">
        {FIXES.map(fix => {
          const isActive = activeFixes.includes(fix.id);
          return (
            <button
              key={fix.id}
              type="button"
              className={`fix-toggle-btn ${isActive ? 'active' : ''}`}
              onClick={() => onToggleFix(fix.id)}
              aria-pressed={isActive}
            >
              <div className="fix-info">
                <span className="fix-title">{fix.title}</span>
                <span className="fix-rooms">{fix.roomsNote}</span>
              </div>
              <span className={`fix-badge ${isActive ? 'active' : ''}`}>
                {isActive ? 'On' : 'Off'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
