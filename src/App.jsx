import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { getCurrentUser, isDemoMode, signOut } from './lib/auth.js';
import { getSite } from './lib/api.js';
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
export const MANAGER_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export function startManagerIdleTimeout(onTimeout, timeoutMs = MANAGER_IDLE_TIMEOUT_MS, target = window) {
  let timeout;
  const reset = () => {
    clearTimeout(timeout);
    timeout = setTimeout(onTimeout, timeoutMs);
  };
  const events = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
  events.forEach((eventName) => target.addEventListener(eventName, reset, { passive: true }));
  reset();
  return () => {
    clearTimeout(timeout);
    events.forEach((eventName) => target.removeEventListener(eventName, reset));
  };
}

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

export function expireManagerSession(clearSession, redirect) {
  clearSession();
  redirect();
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
  useEffect(() => {
    if (decision.status !== 'allow' || !user) return undefined;
    return startManagerIdleTimeout(() => expireManagerSession(signOut, () => navigate('/login', {
      replace: true,
      state: { message: 'You were signed out after a period of inactivity.' },
    })));
  }, [decision.status, user, navigate]);
  if (decision.status === 'loading') return <div className="route-loading" role="status">Checking your session…</div>;
  if (decision.status === 'redirect') {
    return <Navigate to="/login" replace state={{ from: decision.from }} />;
  }
  return <AppShell user={user}><Outlet /></AppShell>;
}

function ManagerRoutes() {
  const navigate = useNavigate();

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
        <Route element={<SiteRequired />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="zones" element={<Zones />} />
          <Route path="site" element={<Site />} />
          <Route path="qr" element={<QrCodes />} />
          <Route path="reports" element={<Reports />} />
          <Route path="workers" element={<Workers />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={UNKNOWN_ROUTE} replace />} />
    </Routes>
  );
}

function SiteRequired() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
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
        const site = await getSite();
        if (!active) return;
        if (!site && location.pathname !== '/app/site') {
          navigate('/app/site', { replace: true, state: { setupRequired: true } });
          return;
        }
        setError('');
        setStatus('ready');
      } catch (requestError) {
        if (!active) return;
        setError(requestError.message || 'Unable to load your plant. Please try again.');
        setStatus('error');
      }
    }
  }, [location.pathname, navigate, retryCount]);

  if (status === 'loading') return <div className="route-loading" role="status">Loading your plant…</div>;
  if (status === 'error') return (
    <div className="route-loading">
      <p role="alert">{error}</p>
      <button type="button" className="secondary-button" onClick={() => setRetryCount((count) => count + 1)}>Retry</button>
    </div>
  );
  return <Outlet />;
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
