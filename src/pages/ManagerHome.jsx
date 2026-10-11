import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PlantStatusCard from '../components/PlantStatusCard.jsx';
import { getSite } from '../lib/api.js';

export function ManagerHomeContent({ status, site, error, onRetry }) {
  if (status === 'loading') {
    return <div className="card page-state" role="status">Loading your plants…</div>;
  }

  if (status === 'error') {
    return (
      <section className="card manager-home-error">
        <p role="alert">{error}</p>
        <button className="secondary-button" type="button" onClick={onRetry}>Retry</button>
      </section>
    );
  }

  const sites = site ? [site] : [];
  if (!sites.length) {
    return (
      <PlantStatusCard status="ready" site={null} />
    );
  }

  return (
    <ul className="manager-plant-list" aria-label="Your plants">
      {sites.map((plant) => (
        <li className="card manager-plant-card" key={plant.siteId || plant.name}>
          <h2>{plant.name}</h2>
          <p>Location: {plant.lat}, {plant.lon}</p>
          <p>Allowed radius: {plant.radiusM} m</p>
          <p>{plant.zones?.length || 0} {plant.zones?.length === 1 ? 'zone' : 'zones'}</p>
          <div className="button-row">
            <Link className="primary-button" to="/app/dashboard">Open dashboard</Link>
            <Link className="secondary-button" to="/app/site">Edit plant</Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function ManagerHome() {
  const [status, setStatus] = useState('loading');
  const [site, setSite] = useState(null);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  const loadPlants = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      setSite(await getSite());
      setStatus('ready');
    } catch (requestError) {
      setError(requestError.message || 'Unable to load your plants. Please try again.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    loadPlants();
  }, [loadPlants, retryCount]);

  return (
    <section className="manager-page">
      <header className="page-heading">
        <div>
          <h1>Your plants</h1>
          <p>Manage registered plants and open their dashboards.</p>
        </div>
      </header>
      <ManagerHomeContent
        status={status}
        site={site}
        error={error}
        onRetry={() => setRetryCount((count) => count + 1)}
      />
    </section>
  );
}
