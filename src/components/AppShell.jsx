import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { invalidateSiteCache } from '../lib/api.js';
import { signOut } from '../lib/auth.js';
import { usePlants } from '../lib/PlantContext.jsx';
import Sky from './Sky.jsx';

export function AppShell({ user, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { plants, selectedPlantId, setSelectedPlantId } = usePlants();
  const selectedPlant = plants.find((plant) => plant.plantId === selectedPlantId);

  function handleSignOut() {
    signOut();
    invalidateSiteCache();
    navigate('/', { replace: true });
  }

  function switchPlant(plantId) {
    setSelectedPlantId(plantId);
    if (!plantId) {
      navigate('/app/home');
      return;
    }
    const remainder = location.pathname.match(/^\/app\/plants\/[^/]+\/(.+)$/)?.[1] || 'dashboard';
    navigate(`/app/plants/${encodeURIComponent(plantId)}/${remainder}`);
  }

  const navItems = [
    { to: '/app/home', label: 'Home' },
    ...['dashboard', 'zones', 'site', 'qr', 'reports', 'workers'].map((page) => ({
      to: selectedPlantId ? `/app/plants/${selectedPlantId}/${page}` : '/app/home',
      label: page === 'site' ? 'Site & location' : page === 'qr' ? 'QR codes' : `${page[0].toUpperCase()}${page.slice(1)}`,
    })),
  ];

  return (
    <div className="sky-shell">
      <Sky />
      <main className="app-shell">
        <header className="app-topbar card">
          <div className="app-brand">
            <span className="logo-mark" aria-hidden="true">H</span>
            <div>
              <strong>HeatPulse</strong>
              <span className="app-site-name">{selectedPlant?.name || (plants.length ? 'Select a plant' : 'Your plants')}</span>
            </div>
          </div>
          <div className="app-user">
            <label className="plant-switcher-label" htmlFor="current-plant">Current plant</label>
            <select
              id="current-plant"
              className="plant-switcher"
              value={selectedPlantId}
              onChange={(event) => switchPlant(event.target.value)}
              aria-label="Switch current plant"
            >
              <option value="">Choose a plant</option>
              {plants.map((plant) => <option key={plant.plantId} value={plant.plantId}>{plant.name}</option>)}
            </select>
            <span>{user?.email}</span>
            <button type="button" className="secondary-button" onClick={handleSignOut}>Sign out</button>
          </div>
        </header>
        {user?.demo && <div className="demo-banner" role="status">Demo mode: sample data, no real sign-in</div>}
        <div className="app-body">
          <nav className="sidebar card" aria-label="Manager navigation">
            {navItems.map((item) => (
              <NavLink key={`${item.label}-${item.to}`} to={item.to} end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
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
