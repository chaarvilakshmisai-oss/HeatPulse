import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getCurrentUser, isDemoMode, signOut } from './lib/auth.js';
import { getPlant, invalidateSiteCache } from './lib/api.js';
import { PlantProvider, usePlants } from './lib/PlantContext.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
import Tap from './pages/Tap.jsx';
import Welcome from './pages/Welcome.jsx';
import WorkerLogin from './pages/WorkerLogin.jsx';
import ManagerHome from './pages/ManagerHome.jsx';
import Zones from './pages/Zones.jsx';
import Site from './pages/Site.jsx';
import QrCodes from './pages/QrCodes.jsx';
import Reports from './pages/Reports.jsx';
import Workers from './pages/Workers.jsx';
import { AppShell } from './components/AppShell.jsx';
import { getAppConfigurationProblem } from './lib/config.js';
import Sky from './components/Sky.jsx';

export const UNKNOWN_ROUTE = '/';
export const HOME_ROUTE = UNKNOWN_ROUTE;

export function ConfigurationProblem({ missing }) {
  return (
    <div className="sky-shell">
      <Sky />
      <main className="login-wrap">
        <section className="login-card card" role="alert">
          <h1>Configuration problem</h1>
          <p>This app is missing required environment configuration:</p>
          <ul>
            {missing.map((variable) => <li key={variable}><code>{variable}</code></li>)}
          </ul>
          <p>Set the missing value in the frontend environment and rebuild the app.</p>
        </section>
      </main>
    </div>
  );
}

export function protectedRouteDecision(user, location) {
  if (user === undefined) return { status: 'loading' };
  if (!user) {
    return {
      status: 'redirect',
      from: `${location.pathname}${location.search}${location.hash}`,
    };
  }
  return { status: 'allow' };
}

function ProtectedRoute() {
  const location = useLocation();
  const [user, setUser] = useState(isDemoMode() ? { email: 'Demo manager', demo: true } : undefined);

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(getCurrentUser)
      .then((current) => {
        if (active) setUser(current);
      })
      .catch(() => {
        if (active) setUser(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const decision = protectedRouteDecision(user, location);
  if (decision.status === 'loading') return <div className="route-loading" role="status">Checking your session…</div>;
  if (decision.status === 'redirect') {
    return <Navigate to="/login" replace state={{ from: decision.from }} />;
  }
  return (
    <PlantProvider>
      <AppShell user={user}><Outlet /></AppShell>
    </PlantProvider>
  );
}

function ManagerRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const previousPathname = useRef(location.pathname);

  useEffect(() => {
    const pages = {
      '/': ['HeatPulse', 'HeatPulse heat-safety tools for plant managers and workers.'],
      '/login': ['Manager sign in', 'Sign in to manage your HeatPulse plant.'],
      '/worker-login': ['Worker login', 'View your HeatPulse shift and break plan.'],
      '/tap': ['Worker check-in', 'Send a worker heat check-in with HeatPulse.'],
      '/app/home': ['Your plants', 'View and manage your HeatPulse plants.'],
      '/app/plants/new': ['Register a plant', 'Register a HeatPulse plant.'],
      '/app/dashboard': ['Dashboard', 'Review heat guidance and worker reports.'],
      '/app/site': ['Site & location', 'Set your HeatPulse plant name and location.'],
      '/app/zones': ['Zones', 'Manage work areas and their conditions.'],
      '/app/qr': ['QR codes', 'Create worker check-in QR codes.'],
      '/app/reports': ['Reports', 'Review worker heat reports and breaks.'],
      '/app/workers': ['Workers', 'Manage worker IDs and shifts.'],
    };
    const plantPage = location.pathname.match(/^\/app\/plants\/[^/]+\/(dashboard|zones|site|qr|reports|workers)$/)?.[1];
    const [page, description] = pages[location.pathname]
      || (plantPage ? pages[`/app/${plantPage}`] : null)
      || ['Page not found', 'This HeatPulse page could not be found.'];
    document.title = location.pathname === '/' ? 'HeatPulse' : `${page} - HeatPulse`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.append(meta);
    }
    meta.content = description;
  }, [location.pathname]);

  useLayoutEffect(() => {
    if (previousPathname.current !== location.pathname) {
      previousPathname.current = location.pathname;
      invalidateSiteCache();
    }
  }, [location.pathname]);

  useEffect(() => {
    function handleUnauthorized() {
      signOut();
      navigate('/login', { replace: true, state: { message: 'Your session expired. Please sign in again.' } });
    }
    window.addEventListener('heatpulse:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('heatpulse:unauthorized', handleUnauthorized);
  }, [navigate]);

  return (
    <Routes>
      <Route path={HOME_ROUTE} element={<Welcome />} />
      <Route path="/login" element={<Login />} />
      <Route path="/worker-login" element={<WorkerLogin />} />
      <Route path="/tap" element={<Tap />} />
      <Route path="/app" element={<ProtectedRoute />}>
        <Route path="home" element={<ManagerHome />} />
        <Route path="plants" element={<Navigate to="/app/home" replace />} />
        <Route path="plants/new" element={<Site />} />
        <Route path="plants/:plantId" element={<PlantRequired />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="zones" element={<Zones />} />
          <Route path="site" element={<Site />} />
          <Route path="qr" element={<QrCodes />} />
          <Route path="reports" element={<Reports />} />
          <Route path="workers" element={<Workers />} />
        </Route>
        <Route path="dashboard" element={<LegacyPlantRedirect />} />
        <Route path="zones" element={<LegacyPlantRedirect />} />
        <Route path="site" element={<LegacyPlantRedirect />} />
        <Route path="qr" element={<LegacyPlantRedirect />} />
        <Route path="reports" element={<LegacyPlantRedirect />} />
        <Route path="workers" element={<LegacyPlantRedirect />} />
        <Route path="*" element={<AppNotFound />} />
      </Route>
      <Route path="*" element={<Navigate to={UNKNOWN_ROUTE} replace />} />
    </Routes>
  );
}

function AppNotFound() {
  return (
    <section className="card empty-state" role="status">
      <h1>Page not found</h1>
      <p>That HeatPulse page does not exist.</p>
      <Link to="/app/home">Return to your plants</Link>
    </section>
  );
}

function LegacyPlantRedirect() {
  const location = useLocation();
  const { selectedPlantId, status } = usePlants();
  const page = location.pathname.split('/').filter(Boolean).pop();
  if (status === 'loading') return <div className="route-loading" role="status">Loading your plants…</div>;
  return <Navigate to={selectedPlantId ? `/app/plants/${selectedPlantId}/${page}` : '/app/home'} replace />;
}

function PlantRequired() {
  const location = useLocation();
  const navigate = useNavigate();
  const { plantId } = useParams();
  const { setSelectedPlantId } = usePlants();
  const [status, setStatus] = useState('loading');
  const [loadedPlantId, setLoadedPlantId] = useState('');
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    loadPlant();
    return () => {
      active = false;
    };

    async function loadPlant() {
      try {
        const site = await getPlant(plantId);
        if (!active) return;
        if (!site) {
          navigate('/app/home', { replace: true });
          return;
        }
        setSelectedPlantId(plantId);
        setLoadedPlantId(plantId);
        setError('');
        setStatus('ready');
      } catch (requestError) {
        if (!active) return;
        setError(requestError.message || 'Unable to load your plant. Please try again.');
        setStatus('error');
      }
    }
  }, [location.pathname, navigate, plantId, retryCount, setSelectedPlantId]);

  if (status === 'loading' || loadedPlantId !== plantId && status !== 'error') return <div className="route-loading" role="status">Loading plant…</div>;
  if (status === 'error') return (
    <div className="route-loading">
      <p role="alert">Unable to load this plant: {error}</p>
      <button type="button" className="secondary-button" onClick={() => setRetryCount((count) => count + 1)}>Retry</button>
    </div>
  );
  return loadedPlantId === plantId ? <Outlet /> : <div className="route-loading" role="status">Loading plant…</div>;
}

export default function App() {
  const missingConfiguration = getAppConfigurationProblem();
  if (missingConfiguration.length) {
    return <ConfigurationProblem missing={missingConfiguration} />;
  }
  return (
    <Router>
      <ManagerRoutes />
    </Router>
  );
}
