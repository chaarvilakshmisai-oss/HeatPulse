import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPublicSite, getWorkerPlan, recordWorkerBreak, sendReport } from '../lib/api.js';
import { isDemoMode } from '../lib/auth.js';
import { BREAK_SCHEDULE_NOTE } from '../lib/breaks.js';
import Sky from '../components/Sky.jsx';

const OPTIONS = [
  { level: 1, word: 'Fine', description: 'Comfortable', color: '#2DD4A0' },
  { level: 2, word: 'Warm', description: 'Noticeably warm', color: '#F5C542' },
  { level: 3, word: 'Too hot', description: 'Hard to keep working', color: '#F2603E' },
];

function readPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is unavailable. Allow location access in your browser and try again.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (error) => {
      const message = error.code === 1
        ? 'Allow location access in your browser settings, then try again.'
        : 'Your location could not be read. Check your browser settings and try again.';
      reject(new Error(message));
    }, { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 });
  });
}

export default function Tap() {
  const [searchParams] = useSearchParams();
  const siteId = searchParams.get('site') || '';
  const zoneId = searchParams.get('zone') || '';
  const [loading, setLoading] = useState(true);
  const [site, setSite] = useState(null);
  const [zone, setZone] = useState(null);
  const [position, setPosition] = useState(null);
  const [locationStatus, setLocationStatus] = useState('idle');
  const [locationError, setLocationError] = useState('');
  const [pageError, setPageError] = useState('');
  const [sendError, setSendError] = useState('');
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [workerId, setWorkerId] = useState('');
  const [workerPlan, setWorkerPlan] = useState(null);
  const [workerLoading, setWorkerLoading] = useState(false);
  const [breakSaving, setBreakSaving] = useState(false);
  const [workerError, setWorkerError] = useState('');
  const [breakError, setBreakError] = useState('');
  const [clockNow, setClockNow] = useState(Date.now());
  const selectedOption = OPTIONS.find((option) => option.level === selectedLevel);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!siteId || !zoneId) {
        setPageError('This tap link is missing a plant or work area. Please ask your supervisor for a new QR code.');
        setLoading(false);
        return;
      }
      try {
        const publicSite = await getPublicSite(siteId);
        const publicZone = publicSite.zones?.find((item) => item.id === zoneId);
        if (!publicZone) throw new Error('This work area could not be found. Please ask your supervisor for a new QR code.');
        if (!active) return;
        setSite(publicSite);
        setZone(publicZone);
        if (publicSite.requireLocation) {
          setLocationStatus('checking');
          setLoading(false);
          try {
            const devicePosition = await readPosition();
            if (active) {
              setPosition({
                lat: devicePosition.coords.latitude,
                lon: devicePosition.coords.longitude,
                accuracy: devicePosition.coords.accuracy,
              });
              setLocationStatus('confirmed');
              setLocationError('');
            }
          } catch (geoError) {
            if (active) {
              setLocationStatus('error');
              setLocationError(geoError.message);
            }
          }
        }
      } catch (loadError) {
        if (!active) return;
        if (loadError.status === 404) {
          setPageError('This plant or work area could not be found. Check the QR code or ask your supervisor for a new one.');
        } else {
          setPageError(loadError.message || 'Unable to load this tap link. Check your connection and try again.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [siteId, zoneId]);

  async function retryLocation() {
    setLocationStatus('checking');
    setLocationError('');
    try {
      const devicePosition = await readPosition();
      setPosition({
        lat: devicePosition.coords.latitude,
        lon: devicePosition.coords.longitude,
        accuracy: devicePosition.coords.accuracy,
      });
      setLocationStatus('confirmed');
    } catch (geoError) {
      setLocationStatus('error');
      setLocationError(geoError.message);
    }
  }

  async function submitTap() {
    if (!selectedLevel || sending || (site?.requireLocation && !position)) return;
    setSending(true);
    setSendError('');
    try {
      await sendReport({
        siteId,
        zoneId,
        level: selectedLevel,
        ...(position ? { lat: position.lat, lon: position.lon, accuracy: position.accuracy } : {}),
      });
      setSubmitted(true);
    } catch (error) {
      const code = error.code || error.message;
      if (error.status === 403 && String(code).includes('outside_area')) {
        setSendError('You appear to be outside the plant area. Move closer and try again.');
      } else if (error.status === 403 && String(code).includes('location_required')) {
        setSendError('Please allow location access on your phone, then try again.');
      } else {
        setSendError(error.message || 'Your tap could not be recorded. Please try again.');
      }
    } finally {
      setSending(false);
    }
  }

  async function lookUpWorker(event) {
    event.preventDefault();
    if (!workerId.trim() || workerLoading) return;
    setWorkerLoading(true);
    setWorkerError('');
    setBreakError('');
    setWorkerPlan(null);
    try {
      const plan = await getWorkerPlan(siteId, zoneId, workerId.trim().toUpperCase());
      setWorkerId(workerId.trim().toUpperCase());
      setWorkerPlan(plan);
    } catch (lookupError) {
      setWorkerError(lookupError.status === 404
        ? 'We could not verify that Worker ID for this zone. Check the ID and ask your supervisor if you need help.'
        : lookupError.message || 'The worker timetable could not be loaded. Please try again.');
    } finally {
      setWorkerLoading(false);
    }
  }

  async function recordBreak(type) {
    if (!workerPlan?.nextBreak || breakSaving) return;
    setBreakSaving(true);
    setBreakError('');
    try {
      const result = await recordWorkerBreak(siteId, zoneId, workerId, {
        type,
        scheduledAt: workerPlan.nextBreak.scheduledAt,
        ...(position ? { lat: position.lat, lon: position.lon } : {}),
      });
      if (result.plan) setWorkerPlan(result.plan);
      else setWorkerPlan(await getWorkerPlan(siteId, zoneId, workerId));
    } catch (requestError) {
      if (requestError.status === 404) {
        setBreakError('We could not verify that Worker ID for this zone. Check the ID and ask your supervisor if you need help.');
      } else if (requestError.status === 403 && requestError.code === 'location_required') {
        setBreakError('Allow location access in your browser, then try again.');
      } else if (requestError.status === 403 && requestError.code === 'outside_area') {
        setBreakError('You appear to be outside the plant area. Move closer and try again.');
      } else {
        setBreakError(requestError.message || 'This break could not be recorded. Please try again.');
      }
    } finally {
      setBreakSaving(false);
    }
  }

  function plantTime(value) {
    if (!value) return 'Not scheduled';
    return new Intl.DateTimeFormat(undefined, {
      timeZone: workerPlan?.shift?.timeZone || undefined,
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  }

  function breakCountdown() {
    const scheduledAt = workerPlan?.nextBreak?.scheduledAt;
    if (!scheduledAt) return '';
    const seconds = Math.max(0, Math.ceil((new Date(scheduledAt).getTime() - clockNow) / 1000));
    if (!seconds) return 'Due now';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${hours ? `${hours}h ` : ''}${minutes}m ${remainingSeconds}s`;
  }

  const breakIsDue = workerPlan?.breakStatus === 'due_now'
    || (workerPlan?.breakStatus === 'upcoming' && workerPlan?.nextBreak
      && new Date(workerPlan.nextBreak.scheduledAt).getTime() <= clockNow);

  function tapAgain() {
    setSelectedLevel(null);
    setSubmitted(false);
    setSendError('');
  }

  return (
    <div className="sky-shell">
      <Sky />
      <main className="tap-page-container">
        <header className="tap-header">
          <div className="brand">
            <h1>HeatPulse</h1>
          </div>
          {site && zone && <p className="tap-subtitle">{site.name} · {zone.name}</p>}
          {isDemoMode() && <p className="demo-banner" role="status">Demo mode: sample data, no real sign-in</p>}
        </header>

        {loading ? (
          <section className="card tap-main" role="status">Loading this work area…</section>
        ) : pageError ? (
          <section className="card tap-main">
            <p className="tap-error" role="alert">{pageError}</p>
          </section>
        ) : submitted ? (
          <section className="card tap-main tap-success-view" aria-live="polite">
            <h2 className="tap-success-title">Thanks, recorded.</h2>
            <p className="tap-success-msg">You reported &quot;{selectedOption?.word}&quot; for {zone?.name}.</p>
            <button className="secondary-button" type="button" onClick={tapAgain}>Tap again</button>
          </section>
        ) : (
          <section className="card tap-main">
            <div className="worker-break-panel">
              <h2>Worker timetable &amp; breaks</h2>
              {!workerPlan ? (
                <form className="worker-id-form" onSubmit={lookUpWorker}>
                  <label>
                    Worker ID
                    <input
                      autoCapitalize="characters"
                      autoComplete="off"
                      maxLength={6}
                      placeholder="W-4K7Q"
                      value={workerId}
                      onChange={(event) => setWorkerId(event.target.value.toUpperCase())}
                    />
                  </label>
                  <button type="submit" className="secondary-button" disabled={workerLoading || !workerId.trim()}>
                    {workerLoading ? 'Checking…' : 'Check my shift'}
                  </button>
                  {workerError && <p className="tap-error" role="alert">{workerError}</p>}
                </form>
              ) : (
                <div className="worker-plan" aria-live="polite">
                  <p><strong>Shift:</strong> {plantTime(workerPlan.shift?.start)}–{plantTime(workerPlan.shift?.end)}</p>
                  {workerPlan.nextBreak ? (
                    <>
                      <p><strong>Next break:</strong> {plantTime(workerPlan.nextBreak.scheduledAt)} · {workerPlan.nextBreak.durationMinutes} minutes</p>
                      <p><strong>Status:</strong> {workerPlan.breakStatus === 'in_progress' ? 'In progress' : breakIsDue ? 'Due now' : 'Upcoming'}</p>
                      {workerPlan.breakStatus === 'upcoming' && <p className="break-countdown">Time until break: {breakCountdown()}</p>}
                      {workerPlan.breakStatus === 'in_progress' ? (
                        <button type="button" className="primary-button" disabled={breakSaving || (site?.requireLocation && !position)} onClick={() => recordBreak('end')}>
                          {breakSaving ? 'Recording…' : 'End break'}
                        </button>
                      ) : (
                        <button type="button" className="primary-button" disabled={!breakIsDue || breakSaving || (site?.requireLocation && !position)} onClick={() => recordBreak('start')}>
                          {breakSaving ? 'Recording…' : 'Start break'}
                        </button>
                      )}
                    </>
                  ) : <p>All scheduled breaks for this shift are done.</p>}
                  {site?.requireLocation && locationStatus === 'error' && <p className="tap-error" role="alert">{locationError}</p>}
                  {breakError && <p className="tap-error" role="alert">{breakError}</p>}
                  <button type="button" className="secondary-button" onClick={() => { setWorkerPlan(null); setWorkerError(''); setBreakError(''); }}>
                    Use a different Worker ID
                  </button>
                  <small>{BREAK_SCHEDULE_NOTE}</small>
                </div>
              )}
            </div>
            <h2 className="tap-question">How does it feel right now?</h2>
            {site?.requireLocation && (
              <div className="tap-location-status" aria-live="polite">
                {locationStatus === 'checking' && <p role="status">Checking your location…</p>}
                {locationStatus === 'confirmed' && <p className="status-good" role="status">Location confirmed</p>}
                {locationStatus === 'error' && (
                  <div>
                    <p className="tap-error" role="alert">{locationError}</p>
                    <button type="button" className="secondary-button" onClick={retryLocation}>Try location again</button>
                  </div>
                )}
                <p className="location-privacy">Your location is used once to confirm you are at the plant. It is not stored.</p>
              </div>
            )}
            <div className="tap-options">
              {OPTIONS.map((option) => (
                <button
                  key={option.level}
                  className={`tap-option-btn${selectedLevel === option.level ? ' selected' : ''}`}
                  style={{ backgroundColor: option.color }}
                  type="button"
                  aria-pressed={selectedLevel === option.level}
                  onClick={() => {
                    setSelectedLevel(option.level);
                    setSendError('');
                  }}
                >
                  <span className="tap-word">{option.word}</span>
                  <span className="tap-desc">{option.description}</span>
                </button>
              ))}
            </div>
            <button
              className="primary-button send-tap-btn"
              type="button"
              disabled={!selectedLevel || sending || (site?.requireLocation && !position)}
              onClick={submitTap}
            >
              {sending ? 'Sending…' : 'Send my tap'}
            </button>
            {sendError && <p className="tap-error" role="alert">{sendError}</p>}
          </section>
        )}
        <footer className="tap-footer">Anonymous. Your tap helps supervisors decide where to act first.</footer>
      </main>
    </div>
  );
}
