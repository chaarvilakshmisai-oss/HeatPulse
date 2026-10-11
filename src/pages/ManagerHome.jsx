import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { deletePlant, findWorkerPlant, getWorkers, getZones } from '../lib/api.js';
import { scoreZone } from '../lib/scoring.js';
import { usePlants } from '../lib/PlantContext.jsx';

function riskLabel(zones) {
  if (!zones.length) return 'No zones yet';
  const scores = zones.map((zone) => scoreZone(zone, 7)).filter(Number.isFinite);
  if (!scores.length) return '--';
  const worst = Math.max(...scores);
  return worst >= 65 ? 'High risk' : worst >= 40 ? 'Watch' : 'Calm';
}

export function ManagerHomeContent({ status, plants, summaries, error, onRetry, onDelete, onOpenPlant }) {
  if (status === 'loading') {
    return <div className="manager-plant-grid" aria-label="Loading plants">{[1, 2, 3].map((item) => <div className="card plant-skeleton" key={item} aria-hidden="true" />)}</div>;
  }
  if (status === 'error') {
    return <section className="card manager-home-error"><p role="alert">{error}</p><button className="secondary-button" type="button" onClick={onRetry}>Retry</button></section>;
  }
  if (!plants.length) {
    return (
      <section className="card empty-state plants-empty">
        <svg viewBox="0 0 120 90" role="img" aria-label="Plant buildings illustration">
          <path d="M12 72h96M22 72V40l18-12 18 12v32M58 72V22h40v50M68 34h8v9h-8zm18 0h8v9h-8zM68 51h8v9h-8zm18 0h8v9h-8z" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2>No plants registered yet</h2>
        <p>Add a plant to start organizing zones, workers, and heat guidance.</p>
        <Link className="primary-button" to="/app/plants/new">Register your first plant</Link>
      </section>
    );
  }
  const totalZones = summaries.reduce((sum, summary) => sum + summary.zones.length, 0);
  const totalWorkers = summaries.reduce((sum, summary) => sum + summary.workers.length, 0);
  const scores = summaries.flatMap((summary) => summary.zones.map((zone) => scoreZone(zone, 7)));
  const highRiskZones = scores.filter((value) => value >= 65).length;
  const highRiskValue = scores.every(Number.isFinite) ? highRiskZones : '--';

  return (
    <>
      <div className="plant-stat-grid" aria-label="Plant summary">
        <article className="card plant-stat"><strong>{plants.length}</strong><span>Total plants</span></article>
        <article className="card plant-stat"><strong>{totalZones}</strong><span>Total zones</span></article>
        <article className="card plant-stat"><strong>{totalWorkers}</strong><span>Total workers</span></article>
        <article className="card plant-stat"><strong>{highRiskValue}</strong><span>Zones at high heat risk</span></article>
      </div>
      <ul className="manager-plant-grid" aria-label="Your plants">
        {plants.map((plant) => {
          const summary = summaries.find((item) => item.plantId === plant.plantId) || { zones: [], workers: [] };
          const location = `${Number(plant.lat).toFixed(4)}, ${Number(plant.lon).toFixed(4)} · ${plant.radiusM} m radius`;
          const base = `/app/plants/${encodeURIComponent(plant.plantId)}`;
          return (
            <li className="card manager-plant-card" key={plant.plantId}>
              <div className="plant-card-heading">
                <h2><Link to={`${base}/dashboard`} onClick={() => onOpenPlant(plant.plantId)}>{plant.name}</Link></h2>
                <span className={`plant-risk-chip risk-${riskLabel(summary.zones).toLowerCase().replaceAll(' ', '-')}`}>{riskLabel(summary.zones)}</span>
              </div>
              <p className="plant-code">Plant code: <code>{plant.plantCode}</code></p>
              <p>{location}</p>
              <p>{summary.zones.length} {summary.zones.length === 1 ? 'zone' : 'zones'} · {summary.workers.length} {summary.workers.length === 1 ? 'worker' : 'workers'}</p>
              <div className="plant-card-actions">
                <Link className="primary-button" to={`${base}/dashboard`} onClick={() => onOpenPlant(plant.plantId)}>Open dashboard</Link>
                <Link className="secondary-button" to={`${base}/zones`} onClick={() => onOpenPlant(plant.plantId)}>Zones</Link>
                <Link className="secondary-button" to={`${base}/workers`} onClick={() => onOpenPlant(plant.plantId)}>Workers</Link>
                <Link className="secondary-button" to={`${base}/site`} onClick={() => onOpenPlant(plant.plantId)}>Edit plant</Link>
                <button type="button" className="secondary-button" onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(plant.plantCode);
                  } catch {
                    window.prompt('Copy plant code', plant.plantCode);
                  }
                }}>Copy code</button>
                <details className="plant-actions-menu">
                  <summary aria-label={`More actions for ${plant.name}`}>…</summary>
                  <button type="button" onClick={() => onDelete(plant)}>Delete plant</button>
                </details>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default function ManagerHome() {
  const {
    plants: contextPlants,
    refreshPlants,
    status: plantsStatus,
    error: plantsError,
    setSelectedPlantId,
  } = usePlants();
  const [status, setStatus] = useState('loading');
  const [summaries, setSummaries] = useState([]);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [search, setSearch] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [workerMatches, setWorkerMatches] = useState(null);
  const [workerLookupError, setWorkerLookupError] = useState('');

  const plants = useMemo(
    () => [...contextPlants].sort((left, right) => left.name.localeCompare(right.name)),
    [contextPlants],
  );

  const loadDetails = useCallback(async () => {
    if (plantsStatus === 'loading') {
      setStatus('loading');
      return;
    }
    if (plantsStatus === 'error') {
      setError(plantsError);
      setStatus('error');
      return;
    }
    setStatus('loading');
    setError('');
    try {
      const details = await Promise.all(plants.map(async (plant) => {
        const [zones, workers] = await Promise.all([
          getZones(plant.plantId),
          getWorkers(plant.plantId),
        ]);
        return { plantId: plant.plantId, zones, workers };
      }));
      setSummaries(details);
      setStatus('ready');
    } catch (loadError) {
      setError(loadError.message || 'Unable to load plant information.');
      setStatus('error');
    }
  }, [plants, plantsError, plantsStatus]);

  useEffect(() => { loadDetails(); }, [loadDetails, retryCount]);

  const filteredPlants = useMemo(() => plants.filter((plant) => plant.name.toLowerCase().includes(search.trim().toLowerCase())), [plants, search]);

  async function removePlant(plant) {
    if (!window.confirm(`Delete ${plant.name} and its zones and workers?`)) return;
    try {
      await deletePlant(plant.plantId);
      await refreshPlants();
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete this plant.');
      setStatus('error');
    }
  }

  async function lookupWorker(event) {
    event.preventDefault();
    setWorkerLookupError('');
    setWorkerMatches(null);
    try {
      const result = await findWorkerPlant(workerId);
      setWorkerMatches(result.matches);
    } catch (lookupError) {
      setWorkerLookupError(lookupError.message || 'Unable to find this worker.');
    }
  }

  async function retry() {
    setError('');
    if (plantsStatus === 'error') {
      try {
        await refreshPlants();
      } catch {
        return;
      }
      return;
    }
    setRetryCount((count) => count + 1);
  }

  return (
    <section className="manager-page">
      <header className="page-heading">
        <div><h1>Your plants</h1><p>Welcome back. Manage your plants and their heat-safety setup.</p></div>
        <Link className="primary-button" to="/app/plants/new">Add plant</Link>
      </header>
      <ManagerHomeContent
        status={status}
        plants={filteredPlants}
        summaries={summaries}
        error={error}
        onRetry={retry}
        onDelete={removePlant}
        onOpenPlant={setSelectedPlantId}
      />
      {status === 'ready' && plants.length > 0 && (
        <form className="card worker-lookup" onSubmit={lookupWorker}>
          <label htmlFor="home-worker-lookup">Find a worker</label>
          <div className="button-row">
            <input id="home-worker-lookup" value={workerId} onChange={(event) => setWorkerId(event.target.value.toUpperCase())} placeholder="W-4K7Q" />
            <button type="submit" className="secondary-button" disabled={!workerId.trim()}>Search</button>
          </div>
          {workerLookupError && <p className="form-error" role="alert">{workerLookupError}</p>}
          {workerMatches && (workerMatches.length
            ? workerMatches.map((match) => <p key={match.plantId}>{match.workerName} works at {match.plantName}{match.zone ? ` · ${match.zone.name}` : ''}</p>)
            : <p>No matching worker found in your plants.</p>)}
        </form>
      )}
      {status === 'ready' && plants.length > 3 && (
        <label className="plant-search">Search plants<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      )}
    </section>
  );
}
