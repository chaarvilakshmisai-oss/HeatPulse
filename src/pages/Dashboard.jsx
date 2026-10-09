import React, { useState, useEffect, useMemo, useCallback } from 'react';
import TimeControl from '../components/TimeControl.jsx';
import RoomGrid from '../components/RoomGrid.jsx';
import DayBars from '../components/DayBars.jsx';
import { MOCK_ROOMS, HOURLY_CURVE, FIXES } from '../data/mock.js';
import { score as calculateScore, calculateTotalReduction } from '../lib/scoring.js';

export default function Dashboard() {
  const [hourIndex, setHourIndex] = useState(7); // Initial state: 2 PM (index 7)
  const [selectedRoomId, setSelectedRoomId] = useState(301); // Initial state: 301
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeFixes, setActiveFixes] = useState([]); // Initial state: no fixes
  const [simulatedTaps, setSimulatedTaps] = useState({});

  // Playback timer effect: advances one hour every 800 ms and loops
  useEffect(() => {
    let timer = null;
    if (isPlaying) {
      timer = setInterval(() => {
        setHourIndex(prev => (prev + 1) % 12);
      }, 800);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPlaying]);

  // Handler when user changes hour via slider or bar click -> stops playback
  const handleHourChange = useCallback((newHour) => {
    setIsPlaying(false);
    setHourIndex(newHour);
  }, []);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  // Compute room score given hour and room
  const getRoomScore = useCallback((room, targetHour = hourIndex, fixes = activeFixes) => {
    const curveVal = HOURLY_CURVE[targetHour];
    const reduction = calculateTotalReduction(room.id, fixes, FIXES);
    const taps = simulatedTaps[room.id] || 0;
    return calculateScore(curveVal, room.exposure, reduction, taps);
  }, [hourIndex, activeFixes, simulatedTaps]);

  // Peak score across all rooms at a given hour
  const getPeakScoreForHour = useCallback((targetHour) => {
    let max = 0;
    for (const room of MOCK_ROOMS) {
      const s = getRoomScore(room, targetHour);
      if (s > max) max = s;
    }
    return max;
  }, [getRoomScore]);

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-brand">
          <h1 className="wordmark">HeatPulse</h1>
          <span className="subtitle">Hostel Block C · Floor 3</span>
        </div>
        <div className="header-chips">
          <span className="chip">Sample data</span>
          <span className="chip">Forecast 38°C · humidity 55%</span>
        </div>
      </header>

      <main className="dashboard-main">
        <section className="left-panel panel">
          <TimeControl
            hourIndex={hourIndex}
            onChangeHour={handleHourChange}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
          />

          <RoomGrid
            rooms={MOCK_ROOMS}
            getRoomScore={getRoomScore}
            selectedRoomId={selectedRoomId}
            onSelectRoom={setSelectedRoomId}
          />

          <DayBars
            currentHourIndex={hourIndex}
            getPeakScoreForHour={getPeakScoreForHour}
            onSelectHour={handleHourChange}
          />
        </section>

        <section className="right-panel-placeholder">
          {/* Phase 3 will populate right-hand panels */}
        </section>
      </main>
    </div>
  );
}
