import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loginWorker } from '../lib/api.js';
import Sky from '../components/Sky.jsx';

export const WORKER_NOT_FOUND_MESSAGE = "We couldn't find that worker ID";

export function workerLookupErrorMessage(error) {
  if (error?.status === 404) return WORKER_NOT_FOUND_MESSAGE;
  return error?.message || 'Unable to load your shift. Please try again.';
}

function formatTime(value, timeZone) {
  if (!value) return 'Not scheduled';
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timeZone || undefined,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function WorkerLogin() {
  const [plantCode, setPlantCode] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [workerPlan, setWorkerPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [failures, setFailures] = useState(0);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return undefined;
    const timer = window.setTimeout(() => {
      setCooldown((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function submit(event) {
    event.preventDefault();
    if (loading || cooldown) return;
    setLoading(true);
    setError('');
    setWorkerPlan(null);
    try {
      const plan = await loginWorker(plantCode, workerId);
      setWorkerPlan(plan);
      setFailures(0);
    } catch (lookupError) {
      setError(workerLookupErrorMessage(lookupError));
      const nextFailures = failures + 1;
      if (nextFailures >= 5) {
        setFailures(0);
        setCooldown(20);
      } else {
        setFailures(nextFailures);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sky-shell">
      <Sky />
      <main className="login-wrap">
        <section className="login-card card">
          <Link className="login-brand" to="/">
            <span className="logo-mark" aria-hidden="true">H</span>
            <span>HeatPulse</span>
          </Link>
          <h1>Worker login</h1>
          {!workerPlan ? (
            <form onSubmit={submit}>
              <label htmlFor="plant-code">Plant code</label>
              <input
                id="plant-code"
                autoComplete="off"
                value={plantCode}
                onChange={(event) => setPlantCode(event.target.value.toUpperCase())}
                required
              />
              <small className="worker-login-help">Ask your supervisor for the plant code.</small>
              <label htmlFor="worker-id">Worker ID</label>
              <input
                id="worker-id"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={6}
                placeholder="W-4K7Q"
                value={workerId}
                onChange={(event) => setWorkerId(event.target.value.toUpperCase())}
                required
              />
              <button className="primary-button login-submit" type="submit" disabled={loading || cooldown > 0}>
                {loading ? 'Checking…' : cooldown ? `Try again in ${cooldown}s` : 'View my shift'}
              </button>
              {error && <p className="form-error" role="alert">{error}</p>}
            </form>
          ) : (
            <div className="worker-plan" aria-live="polite">
              <h2>{workerPlan.plantName}</h2>
              <p>Welcome, {workerPlan.name}{workerPlan.zone?.name ? ` · ${workerPlan.zone.name}` : ''}</p>
              {workerPlan.shift ? (
                <p><strong>Shift:</strong> {formatTime(workerPlan.shift.start, workerPlan.shift.timeZone)}–{formatTime(workerPlan.shift.end, workerPlan.shift.timeZone)}</p>
              ) : <p>No upcoming shift is scheduled.</p>}
              {workerPlan.nextBreak ? (
                <p><strong>Next break:</strong> {formatTime(workerPlan.nextBreak.scheduledAt, workerPlan.shift?.timeZone)} · {workerPlan.nextBreak.durationMinutes} minutes · {workerPlan.breakStatus === 'due_now' ? 'Due now' : workerPlan.breakStatus === 'in_progress' ? 'In progress' : 'Upcoming'}</p>
              ) : workerPlan.shift && <p>All scheduled breaks for this shift are done.</p>}
              <button className="secondary-button" type="button" onClick={() => setWorkerPlan(null)}>Use a different Worker ID</button>
            </div>
          )}
          <Link className="login-worker-link" to="/">Back to HeatPulse</Link>
        </section>
      </main>
    </div>
  );
}
