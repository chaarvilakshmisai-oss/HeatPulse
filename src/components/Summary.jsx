import React from 'react';
import { formatHour } from '../lib/scoring.js';

export default function Summary({ hourIndex, hotRoomsCount, baseHotRoomsCount, hasActiveFixes }) {
  const timeLabel = formatHour(hourIndex);

  return (
    <div className="panel summary-panel">
      <h2 className="panel-title">Rooms too hot at {timeLabel}</h2>
      <div className="big-count-display">
        <span className="count-number">{hotRoomsCount}</span>
        <span className="count-total">of 12</span>
      </div>
      <p className="summary-footnote">
        {hasActiveFixes
          ? `Your fixes cut hot rooms from ${baseHotRoomsCount} to ${hotRoomsCount}.`
          : "Try the fixes below to cool the block."}
      </p>
    </div>
  );
}
