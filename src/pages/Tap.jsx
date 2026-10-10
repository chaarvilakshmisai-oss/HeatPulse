import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPublicSite, sendReport } from '../lib/api.js';
import { isDemoMode } from '../lib/auth.js';
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
  const selectedOption = OPTIONS.find((option) => option.level === selectedLevel);

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
            <span>for Industry</span>
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
