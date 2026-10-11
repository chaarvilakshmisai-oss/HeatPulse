import { Link } from 'react-router-dom';

export default function PlantStatusCard({ status, site, error, onRetry }) {
  if (status === 'loading') {
    return <section className="card plant-status-card" role="status">Loading plant status…</section>;
  }

  if (status === 'error') {
    return (
      <section className="card plant-status-card" aria-labelledby="plant-status-title">
        <h2 id="plant-status-title">Plant status unavailable</h2>
        <p className="form-error" role="alert">{error}</p>
        <button className="secondary-button" type="button" onClick={onRetry}>Retry</button>
      </section>
    );
  }

  if (!site) {
    return (
      <section className="card plant-status-card" aria-labelledby="plant-status-title">
        <h2 id="plant-status-title">No plant registered yet</h2>
        <p>Register your plant and its work zones to get started.</p>
        <Link className="primary-button" to="/app/site">Register your plant</Link>
      </section>
    );
  }

  return (
    <section className="card plant-status-card" aria-labelledby="plant-status-title">
      <h2 id="plant-status-title">Plant registered: {site.name}</h2>
      <p>
        Location: {site.lat}, {site.lon} · Radius: {site.radiusM} m
      </p>
      <p>{site.zones?.length || 0} {site.zones?.length === 1 ? 'zone' : 'zones'}</p>
      <div className="button-row">
        <Link className="primary-button" to="/app/dashboard">Open dashboard</Link>
        <Link className="secondary-button" to="/app/site">Edit plant</Link>
      </div>
    </section>
  );
}
