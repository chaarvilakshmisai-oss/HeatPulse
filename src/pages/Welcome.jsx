import { useState } from 'react';
import { Link } from 'react-router-dom';
import Sky from '../components/Sky.jsx';

const FEATURES = [
  { icon: 'zones', title: 'Zone heat scores', text: 'Understand how heat risk varies across the work areas in your plant.' },
  { icon: 'breaks', title: 'Break scheduling', text: 'Plan reminders for rest breaks as conditions change through a shift.' },
  { icon: 'qr', title: 'QR worker check-ins', text: 'Give workers a quick way to reach their shift and break information.' },
  { icon: 'reports', title: 'Worker heat reports', text: 'Capture how the heat feels on the floor with a simple tap.' },
  { icon: 'shifts', title: 'Shift planning', text: 'See upcoming work shifts alongside zone conditions and breaks.' },
  { icon: 'manager', title: 'Manager reports', text: 'Review worker reports and break activity to decide where to act.' },
];

const HOW_IT_WORKS = [
  { number: '01', title: 'Set up your plant', text: 'Managers register a plant and add the zones where work happens.' },
  { number: '02', title: 'Workers check in', text: 'Workers scan a QR code or sign in with their Worker ID to see their shift.' },
  { number: '03', title: 'See risk and act', text: 'Managers use zone conditions and worker reports to prioritize practical actions.' },
];

function FeatureIcon({ name }) {
  const paths = {
    zones: <><path d="M4 5.5h7v6H4zM13 5.5h7v6h-7zM4 14.5h7v4H4zM13 14.5h7v4h-7z" /><path d="M7.5 8.5h0M16.5 8.5h0" /></>,
    breaks: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2M8.5 3.8 6 2.5M15.5 3.8 18 2.5" /></>,
    qr: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2h-2z" /></>,
    reports: <><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.5 1.5M16.5 16.5 18 18M18 6l-1.5 1.5M7.5 16.5 6 18" /><circle cx="12" cy="12" r="4.5" /><path d="m10 12 1.4 1.4L14.5 10" /></>,
    shifts: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M7.5 13h3M7.5 16h6" /></>,
    manager: <><path d="M4 19.5V11l8-6 8 6v8.5h-6v-5h-4v5z" /><path d="M8 10.5h0M12 10.5h0M16 10.5h0" /></>,
  };
  return (
    <svg className="landing-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function LandingNavActions() {
  return (
    <div className="landing-nav-actions">
      <Link className="secondary-button" to="/login">Manager login</Link>
      <Link className="primary-button" to="/worker-login">Worker login</Link>
    </div>
  );
}

function DashboardMockup() {
  return (
    <div className="landing-dashboard" role="img" aria-label="Illustration of a heat-risk dashboard with green, amber, and red zone scores">
      <div className="landing-dashboard-top">
        <div>
          <span className="landing-mock-eyebrow">HEATPULSE · LIVE OVERVIEW</span>
          <h2>Zone heat scores</h2>
        </div>
        <span className="landing-live-dot" aria-label="Illustration"> </span>
      </div>
      <div className="landing-mock-summary">
        <span>Heat risk across your plant</span>
        <strong>Shift overview</strong>
      </div>
      <div className="landing-zone-tiles">
        <div className="landing-zone-tile landing-zone-green"><span>Assembly</span><strong>24</strong><small>Low</small></div>
        <div className="landing-zone-tile landing-zone-amber"><span>Loading bay</span><strong>58</strong><small>Elevated</small></div>
        <div className="landing-zone-tile landing-zone-red"><span>Furnace</span><strong>82</strong><small>High</small></div>
        <div className="landing-zone-tile landing-zone-amber"><span>Packaging</span><strong>46</strong><small>Moderate</small></div>
      </div>
      <div className="landing-mock-footer"><span>Break planning</span><span>Reports</span><span>Shift plan</span></div>
      <p className="landing-mock-note">Illustrative dashboard · sample scores</p>
    </div>
  );
}

export default function Welcome() {
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className="sky-shell landing-shell">
      <Sky />
      <header className={`landing-nav${menuOpen ? ' menu-open' : ''}`}>
        <div className="landing-nav-inner">
          <Link className="landing-brand" to="/" aria-label="HeatPulse home" onClick={closeMenu}>
            <span className="logo-mark" aria-hidden="true">H</span>
            <span>HeatPulse</span>
          </Link>
          <button
            type="button"
            className="landing-menu-toggle"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            aria-controls="landing-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
          </button>
          <nav id="landing-navigation" className={`landing-navigation${menuOpen ? ' is-open' : ''}`} aria-label="Main navigation">
            <a href="#how-it-works" onClick={closeMenu}>How it works</a>
            <a href="#features" onClick={closeMenu}>Features</a>
            <a href="#for-managers" onClick={closeMenu}>For managers</a>
            <a href="#for-workers" onClick={closeMenu}>For workers</a>
          </nav>
          <LandingNavActions />
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <p className="landing-kicker">HEAT SAFETY, MADE PRACTICAL</p>
            <h1 id="landing-title">Protect workers from heat stress.</h1>
            <p className="landing-hero-text">See heat risk by work zone, plan timely breaks, and give every worker a simple way to check in.</p>
            <div className="landing-hero-actions">
              <Link className="primary-button" to="/login">Manager login</Link>
              <Link className="secondary-button" to="/worker-login">Worker login</Link>
            </div>
            <p className="landing-hero-footnote">Clear, practical information for the people running and working each shift.</p>
          </div>
          <DashboardMockup />
        </section>

        <section className="landing-trust-strip" aria-label="HeatPulse tools">
          <div><strong>Zone-level</strong><span>heat scores</span></div>
          <div><strong>Shift-aware</strong><span>break reminders</span></div>
          <div><strong>QR-enabled</strong><span>worker check-ins</span></div>
        </section>

        <section id="features" className="landing-section" aria-labelledby="features-title">
          <header className="landing-section-heading">
            <p className="landing-kicker">ONE CLEAR VIEW</p>
            <h2 id="features-title">Tools for safer, better-informed shifts</h2>
            <p>Bring plant conditions, worker check-ins, and shift planning together in one place.</p>
          </header>
          <div className="landing-feature-grid">
            {FEATURES.map((feature) => (
              <article className="landing-feature-card" key={feature.title}>
                <FeatureIcon name={feature.icon} />
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="landing-how" aria-labelledby="how-title">
          <header className="landing-section-heading">
            <p className="landing-kicker">SIMPLE BY DESIGN</p>
            <h2 id="how-title">From setup to action</h2>
          </header>
          <div className="landing-steps">
            {HOW_IT_WORKS.map((step) => (
              <article className="landing-step" key={step.number}>
                <span className="landing-step-number">{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-roles" aria-label="Choose your HeatPulse sign in">
          <article id="for-managers" className="landing-role-card">
            <p className="landing-kicker">FOR MANAGERS</p>
            <h2>See where attention is needed.</h2>
            <p>Set up your plant, review zone heat scores, and keep an eye on reports and breaks.</p>
            <Link className="primary-button" to="/login">Manager login</Link>
          </article>
          <article id="for-workers" className="landing-role-card landing-worker-role">
            <p className="landing-kicker">FOR WORKERS</p>
            <h2>Know your shift and check in.</h2>
            <p>Use your Worker ID to view your shift and breaks, or scan a plant QR code to report how it feels.</p>
            <Link className="primary-button" to="/worker-login">Worker login</Link>
          </article>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <Link className="landing-footer-brand" to="/">
            <span className="logo-mark" aria-hidden="true">H</span>
            <strong>HeatPulse</strong>
          </Link>
          <nav className="landing-footer-links" aria-label="Footer navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
            <Link to="/login">Manager login</Link>
            <Link to="/worker-login">Worker login</Link>
          </nav>
          <p>Heat scores are guidance to support decisions, not medical advice.</p>
        </div>
      </footer>
    </div>
  );
}
