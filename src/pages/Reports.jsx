import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getBreakSummary, getReports, getZones } from '../lib/api.js';

function reportRows(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.reports)) return result.reports;
  throw new Error('The reports response was not valid.');
}

function levelLabel(level) {
  if (level === 1 || level === '1' || String(level).toLowerCase() === 'fine') return 'Fine';
  if (level === 2 || level === '2' || String(level).toLowerCase() === 'warm') return 'Warm';
  if (level === 3 || level === '3' || String(level).toLowerCase() === 'too hot') return 'Too hot';
  return 'Unknown';
}

function reportDate(report) {
  const value = report.time || report.createdAt || report.ts;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function isLocationVerified(report) {
  return Boolean(
    report.locationVerified
    || report.locationVerifiedAt
    || report.locationCheck?.status === 'verified'
    || report.locationCheck?.verified === true
    || report.verified === true
  );
}

export default function Reports() {
  const { plantId } = useParams();
  const [reports, setReports] = useState([]);
  const [zoneNames, setZoneNames] = useState({});
  const [breakSummary, setBreakSummary] = useState({ workers: [], zones: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  const refresh = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    setRefreshing(true);
    setError('');
    try {
      const [result, zones, summary] = await Promise.all([getReports(50, plantId), getZones(plantId), getBreakSummary(plantId)]);
      const rows = reportRows(result);
      if (!Array.isArray(zones)) throw new Error('The zones response was not valid.');
      if (!Array.isArray(summary?.workers) || !Array.isArray(summary?.zones)) {
        throw new Error('The break summary response was not valid.');
      }
      setReports(rows);
      setBreakSummary(summary);
      setZoneNames(Object.fromEntries(zones.map((zone) => [zone.id, zone.name])));
      setUpdatedAt(new Date());
    } catch (requestError) {
      setError(requestError.message || 'Unable to load reports. Please try again.');
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

  if (loading) return <div className="card page-state" role="status">Loading reports…</div>;

  return (
    <section className="manager-page">
      <header className="page-heading">
        <div>
          <h1>Worker reports</h1>
          <p>The latest 50 anonymous worker taps.</p>
          <p className="forecast-note">Heat scores are guidance to support decisions, not medical advice.</p>
        </div>
        <div className="reports-refresh">
          <span className="updated-label">{updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}` : 'Not updated yet'}</span>
          <button type="button" className="secondary-button" onClick={() => refresh()} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!reports.length ? (
        <div className="card empty-state">No worker reports have been recorded yet.</div>
      ) : (
        <div className="card table-wrapper">
          <table className="reports-table">
            <caption className="visually-hidden">Recent worker heat reports</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Zone</th>
                <th scope="col">Level</th>
                <th scope="col">Location</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report, index) => {
                const date = reportDate(report);
                const zone = report.zone;
                const zoneName = report.zoneName || (typeof zone === 'string' ? zone : zone?.name)
                  || zoneNames[report.zoneId] || report.zoneId || 'Unknown zone';
                const key = report.id || `${report.zoneId || zoneName}-${date?.toISOString() || index}`;
                return (
                  <tr key={key}>
                    <td>{date ? <time dateTime={date.toISOString()}>{date.toLocaleString()}</time> : 'Unknown time'}</td>
                    <td>{zoneName}</td>
                    <td>{levelLabel(report.level)}</td>
                    <td>
                      <span className={`location-badge${isLocationVerified(report) ? ' verified' : ''}`}>
                        {isLocationVerified(report) ? 'Location verified' : 'Not verified'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <section className="break-report-section">
        <h2>Breaks today {breakSummary.date ? `· ${breakSummary.date}` : ''}</h2>
        {!breakSummary.workers.length ? (
          <div className="card empty-state">No workers have been assigned yet.</div>
        ) : (
          <div className="card table-wrapper">
            <table className="reports-table">
              <caption className="visually-hidden">Breaks taken and required today by worker</caption>
              <thead><tr><th>Worker</th><th>Worker ID</th><th>Zone</th><th>Breaks taken / required</th></tr></thead>
              <tbody>
                {breakSummary.workers.map((worker) => (
                  <tr key={worker.workerId}>
                    <td>{worker.name}</td>
                    <td><code>{worker.workerId}</code></td>
                    <td>{zoneNames[worker.zoneId] || worker.zoneId}</td>
                    <td>{worker.breaksTaken} / {worker.breaksRequired}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!!breakSummary.zones.length && (
          <div className="card table-wrapper">
            <table className="reports-table">
              <caption className="visually-hidden">Breaks taken and required today by zone</caption>
              <thead><tr><th>Zone</th><th>Breaks taken / required</th></tr></thead>
              <tbody>
                {breakSummary.zones.map((zone) => (
                  <tr key={zone.zoneId}><td>{zone.zoneName}</td><td>{zone.breaksTaken} / {zone.breaksRequired}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
