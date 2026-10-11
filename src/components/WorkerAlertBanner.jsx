export default function WorkerAlertBanner({ alert, onRetry, error }) {
  if (!alert && !error) return null;
  const critical = alert?.level === 'critical';
  return (
    <section className={`worker-alert-banner${critical ? ' critical' : ''}`} role="alert" aria-live="assertive">
      {alert && (
        <>
          <strong>{critical ? 'Critical heat alert' : 'High heat alert'} · score {alert.score}</strong>
          <span>
            {critical
              ? 'Stop work, move to a cooler area, drink water, and tell a supervisor now.'
              : 'Take a break, drink water, and tell a supervisor.'}
          </span>
        </>
      )}
      {error && <span>{error}</span>}
      {error && onRetry && <button type="button" className="secondary-button" onClick={onRetry}>Retry alert check</button>}
    </section>
  );
}
