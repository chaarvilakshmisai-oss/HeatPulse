import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MOCK_ZONES } from '../data/mock.js';
import { getZones, sendReport } from '../lib/api.js';
import { isDemoMode } from '../lib/auth.js';
import Sky from '../components/Sky.jsx';

const OPTIONS = [
  { level: 1, word: 'Fine', description: 'Comfortable', color: '#2DD4A0' },
  { level: 2, word: 'Warm', description: 'Noticeably warm', color: '#F5C542' },
  { level: 3, word: 'Too hot', description: 'Hard to keep working', color: '#F2603E' },
];

export default function Tap() {
  const [searchParams] = useSearchParams();
  const zoneId = searchParams.get('zone') || 'furnace';
  const [zones, setZones] = useState(MOCK_ZONES);
  const [isUsingSampleData, setIsUsingSampleData] = useState(true);
  const [error, setError] = useState('');
  const zone = zones.find((item) => item.id === zoneId);
  const zoneName = zone?.name || zoneId;
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const selectedOption = OPTIONS.find((option) => option.level === selectedLevel);

  useEffect(() => {
    let active = true;
    getZones().then((result) => {
      if (!active) return;
      if (Array.isArray(result) && result.length) setZones(result);
      setIsUsingSampleData(isDemoMode());
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleSend() {
    if (!selectedLevel || isSending) return;
    setIsSending(true);
    setError('');
    try {
      const result = await sendReport(zoneId, selectedLevel);
      if (result.mocked) setIsUsingSampleData(true);
      setIsSubmitted(true);
    } catch (requestError) {
      console.error('Unable to record worker tap.', requestError);
      setError('Your tap could not be recorded. Please try again.');
    } finally {
      setIsSending(false);
    }
  }

  function resetTap() {
    setSelectedLevel(null);
    setIsSubmitted(false);
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
          <p className="tap-subtitle">Sample Plant · {zoneName}</p>
          {isUsingSampleData && <p className="sample-note">Sample data in use</p>}
        </header>

        <section className="card tap-main">
          {isSubmitted ? (
            <div className="tap-success-view" aria-live="polite">
              <h2 className="tap-success-title">Thanks, recorded.</h2>
              <p className="tap-success-msg">
                You reported &quot;{selectedOption?.word}&quot; for {zoneName}.
              </p>
              <button className="tap-again-btn" type="button" onClick={resetTap}>
                Tap again
              </button>
            </div>
          ) : (
            <>
              <h2 className="tap-question">How does it feel right now?</h2>
              <div className="tap-options">
                {OPTIONS.map((option) => (
                  <button
                    key={option.level}
                    className={`tap-option-btn${selectedLevel === option.level ? ' selected' : ''}`}
                    style={{ backgroundColor: option.color }}
                    type="button"
                    aria-pressed={selectedLevel === option.level}
                    onClick={() => setSelectedLevel(option.level)}
                  >
                    <span className="tap-word">{option.word}</span>
                    <span className="tap-desc">{option.description}</span>
                  </button>
                ))}
              </div>
              <button
                className="send-tap-btn"
                type="button"
                disabled={!selectedLevel || isSending}
                onClick={handleSend}
              >
                {isSending ? 'Sending…' : 'Send my tap'}
              </button>
              {error && <p className="tap-error" role="alert">{error}</p>}
            </>
          )}
        </section>

        <footer className="tap-footer">
          Anonymous. Your tap helps supervisors decide where to act first.
        </footer>
      </main>
    </div>
  );
}
