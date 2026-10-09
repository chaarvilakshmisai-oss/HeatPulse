import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { sendReport } from '../lib/api.js';

const OPTIONS = [
  {
    level: 1,
    word: 'Fine',
    sub: 'Comfortable',
    bg: '#A9D3B5',
    color: '#1C1B19',
  },
  {
    level: 2,
    word: 'Warm',
    sub: 'Noticeably warm',
    bg: '#F0B24A',
    color: '#1C1B19',
  },
  {
    level: 3,
    word: 'Too hot',
    sub: 'Hard to stay here',
    bg: '#C2391C',
    color: '#FFFFFF',
  },
];

export default function Tap() {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('room') || '304';

  const [selectedLevel, setSelectedLevel] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const selectedOption = OPTIONS.find(o => o.level === selectedLevel);

  const handleSend = async () => {
    if (!selectedLevel) return;
    setIsSending(true);
    try {
      await sendReport(roomId, selectedLevel);
      setIsSubmitted(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  const handleReset = () => {
    setSelectedLevel(null);
    setIsSubmitted(false);
  };

  return (
    <div className="tap-page-container">
      <header className="tap-header">
        <h1 className="wordmark">HeatPulse</h1>
        <span className="tap-subtitle">Block C · Room {roomId}</span>
      </header>

      <main className="tap-main panel">
        {!isSubmitted ? (
          <>
            <h2 className="tap-question">How does it feel right now?</h2>

            <div className="tap-options">
              {OPTIONS.map((opt) => {
                const isSelected = selectedLevel === opt.level;
                return (
                  <button
                    key={opt.level}
                    type="button"
                    className={`tap-option-btn ${isSelected ? 'selected' : ''}`}
                    style={{
                      backgroundColor: opt.bg,
                      color: opt.color,
                    }}
                    onClick={() => setSelectedLevel(opt.level)}
                    aria-pressed={isSelected}
                  >
                    <span className="tap-word">{opt.word}</span>
                    <span className="tap-desc">{opt.sub}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className={`send-tap-btn ${selectedLevel ? 'enabled' : 'disabled'}`}
              disabled={!selectedLevel || isSending}
              onClick={handleSend}
            >
              {isSending ? 'Sending...' : 'Send my tap'}
            </button>
          </>
        ) : (
          <div className="tap-success-view">
            <div className="success-icon" aria-hidden="true">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1C1B19" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h2 className="tap-success-title">Thanks, recorded.</h2>
            <p className="tap-success-msg">
              You reported &ldquo;<strong>{selectedOption?.word}</strong>&rdquo; for Room <strong>{roomId}</strong>.
            </p>
            <button
              type="button"
              className="tap-again-btn"
              onClick={handleReset}
            >
              Tap again
            </button>
          </div>
        )}
      </main>

      <footer className="tap-footer">
        <p>Anonymous. Your tap helps the facility team decide where to fix first.</p>
      </footer>
    </div>
  );
}
