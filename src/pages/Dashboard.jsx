import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ActFirst from '../components/ActFirst.jsx';
import DayBars from '../components/DayBars.jsx';
import Header from '../components/Header.jsx';
import KpiCard from '../components/KpiCard.jsx';
import ShiftPlan from '../components/ShiftPlan.jsx';
import ZoneGrid from '../components/ZoneGrid.jsx';
import { HOURLY_CURVE } from '../data/mock.js';
import { getZones } from '../lib/api.js';
import { isDemoMode } from '../lib/auth.js';
import { summarizeDashboard } from '../lib/dashboard.js';

export default function Dashboard() {
  const { plantId } = useParams();
  const [zones, setZones] = useState([]);
  const [hourIndex, setHourIndex] = useState(7);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUsingSampleData] = useState(isDemoMode());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [hasLoadedData, setHasLoadedData] = useState(false);

  const refresh = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    setRefreshing(true);
    setError('');
    try {
      const result = await getZones(plantId);
      if (!Array.isArray(result)) throw new Error('The zones response was not valid.');
      setZones(result);
      setHasLoadedData(true);
      setUpdatedAt(new Date());
    } catch (requestError) {
      setError(requestError.message || 'Unable to load zones. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [plantId]);

  useEffect(() => {
    refresh(true);
    const timer = window.setInterval(() => refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

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

  const { hotZoneCount, reportsToday, peakRiskHour } = useMemo(
    () => summarizeDashboard(zones, hourIndex),
    [zones, hourIndex]
  );

  if (loading) return <div className="card page-state" role="status">Loading dashboard…</div>;

  return (
      <main className="dashboard">
        <Header
          hourIndex={hourIndex}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying((playing) => !playing)}
          isUsingSampleData={isUsingSampleData}
          showBrand={false}
        />

        {error && (
          <div className="error-panel" role="alert">
            <span>{hasLoadedData ? 'Could not refresh, showing the last data.' : 'Could not load dashboard data.'} {error}</span>
            <button type="button" className="secondary-button" onClick={() => refresh()}>Try again</button>
          </div>
        )}
        <div className="dashboard-toolbar">
          <span className="updated-label">{updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}` : 'Not updated yet'}</span>
          <button type="button" className="secondary-button" onClick={() => refresh()} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <p className="forecast-note">Heat scores are guidance to support decisions, not medical advice.</p>

        {!zones.length ? (
          <section className="card empty-state">
            <h1>No zones yet</h1>
            <p>Add work areas to see their heat-risk guidance.</p>
            <Link to={`/app/plants/${plantId}/zones`}>Set up zones</Link>
          </section>
        ) : (
        <>
        <section className="kpi-grid" aria-label="Today's heat summary">
          <KpiCard label="Zones too hot" value={`${hotZoneCount} / ${zones.length}`} />
          <KpiCard label="Peak risk" value={peakRiskHour} />
          <KpiCard label="Worker reports" value={reportsToday} />
        </section>

        <div className="dashboard-layout">
          <section className="card zone-panel">
            <ZoneGrid zones={zones} hourIndex={hourIndex} />
            <DayBars zones={zones} hourIndex={hourIndex} onSelectHour={changeHour} />
            <p className="forecast-note">Sample forecast curve</p>
          </section>

          <aside className="card action-panel">
            <ActFirst zones={zones} hourIndex={hourIndex} />
            <div className="divider" />
            <ShiftPlan zones={zones} />
          </aside>
        </div>
        </>
        )}
      </main>
  );
}
