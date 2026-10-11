import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { getSite } from '../lib/api.js';
import { signOut } from '../lib/auth.js';
import Sky from './Sky.jsx';

const NAV_ITEMS = [
  { to: '/app/dashboard', label: 'Dashboard' },
  { to: '/app/zones', label: 'Zones' },
  { to: '/app/site', label: 'Site & location' },
  { to: '/app/qr', label: 'QR codes' },
  { to: '/app/reports', label: 'Reports' },
  { to: '/app/workers', label: 'Workers' },
];

export function AppShell({ user, children }) {
  const [siteName, setSiteName] = useState('Loading plant…');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let active = true;
    getSite().then((site) => {
      if (active) setSiteName(site?.name || 'Set up your plant');
    }).catch(() => {
      if (active) setSiteName('Plant unavailable');
    });
    return () => {
      active = false;
    };
  }, [location.pathname]);

  function handleSignOut() {
    signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="sky-shell">
      <Sky />
      <main className="app-shell">
        <header className="app-topbar card">
          <div className="app-brand">
            <span className="logo-mark" aria-hidden="true">H</span>
            <div>
              <strong>HeatPulse for Industry</strong>
              <span className="app-site-name">{siteName}</span>
            </div>
          </div>
          <div className="app-user">
            <span>{user?.email}</span>
            <button type="button" className="secondary-button" onClick={handleSignOut}>Sign out</button>
          </div>
        </header>
        {user?.demo && <div className="demo-banner" role="status">Demo mode: sample data, no real sign-in</div>}
        <div className="app-body">
          <nav className="sidebar card" aria-label="Manager navigation">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/app/dashboard'} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <section className="app-content">
            {location.state?.setupRequired && <p className="setup-banner" role="status">Set up your plant</p>}
            {children}
          </section>
        </div>
      </main>
    </div>
  );
}
