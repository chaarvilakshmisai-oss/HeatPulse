import { useCallback, useEffect, useMemo, useState } from 'react';
import ActFirst from '../components/ActFirst.jsx';
import DayBars from '../components/DayBars.jsx';
import Header from '../components/Header.jsx';
import KpiCard from '../components/KpiCard.jsx';
import ShiftPlan from '../components/ShiftPlan.jsx';
import Sky from '../components/Sky.jsx';
import ZoneGrid from '../components/ZoneGrid.jsx';
import { HOURLY_CURVE, MOCK_ZONES } from '../data/mock.js';
import { getZones } from '../lib/api.js';
import { hourLabel, score } from '../lib/scoring.js';

export default function Dashboard() {
  const [zones, setZones] = useState(MOCK_ZONES);
  const [hourIndex, setHourIndex] = useState(7);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUsingSampleData, setIsUsingSampleData] = useState(true);

  useEffect(() => {
    let active = true;
    getZones().then((result) => {
      if (!active) return;
      if (Array.isArray(result.zones) && result.zones.length) setZones(result.zones);
      setIsUsingSampleData(result.isUsingSampleData);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = window.setInterval(() => {
      setHourIndex((hour) => (hour + 1) % HOURLY_CURVE.length);
    }, 800);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  const changeHour = useCallback((hour) => {
    setIsPlaying(false);
    setHourIndex(hour);
  }, []);

  const peakHour = useMemo(() => {
    const peakScores = HOURLY_CURVE.map((_, hour) =>
      Math.max(...zones.map((zone) => score(zone, hour)))
    );
    return peakScores.indexOf(Math.max(...peakScores));
  }, [zones]);

  const hotZoneCount = zones.filter((zone) => score(zone, hourIndex) >= 65).length;
  const reportsToday = zones.reduce((total, zone) => total + (zone.baseTaps || 0), 0);
  const peakRiskHour = hourLabel(peakHour);

  return (
    <div className="sky-shell">
      <Sky />
      <main className="dashboard">
        <Header
          hourIndex={hourIndex}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying((playing) => !playing)}
          isUsingSampleData={isUsingSampleData}
        />

        <section className="kpi-grid" aria-label="Today's heat summary">
          <KpiCard label="Zones too hot" value={`${hotZoneCount} / ${zones.length}`} />
          <KpiCard label="Peak risk" value={peakRiskHour} />
          <KpiCard label="Worker reports" value={reportsToday} />
        </section>

        <div className="dashboard-layout">
          <section className="card zone-panel">
            <ZoneGrid zones={zones} hourIndex={hourIndex} />
            <DayBars zones={zones} hourIndex={hourIndex} onSelectHour={changeHour} />
          </section>

          <aside className="card action-panel">
            <ActFirst zones={zones} hourIndex={hourIndex} />
            <div className="divider" />
            <ShiftPlan zones={zones} />
          </aside>
        </div>
      </main>
    </div>
  );
}
