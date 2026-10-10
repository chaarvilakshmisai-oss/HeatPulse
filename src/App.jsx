import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { getCurrentUser, isDemoMode, signOut } from './lib/auth.js';
import { getSite } from './lib/api.js';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
import Tap from './pages/Tap.jsx';
import Zones from './pages/Zones.jsx';
import Site from './pages/Site.jsx';
import QrCodes from './pages/QrCodes.jsx';
import Reports from './pages/Reports.jsx';
import { AppShell } from './components/AppShell.jsx';
import SimplePage from './pages/SimplePage.jsx';

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
  return <AppShell user={user}><Outlet /></AppShell>;
}

function ManagerRoutes() {
  const navigate = useNavigate();

  useEffect(() => {
    function handleUnauthorized() {
      signOut();
      navigate('/login', { replace: true, state: { message: 'Your session has expired. Please sign in again.' } });
    }
    window.addEventListener('heatpulse:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('heatpulse:unauthorized', handleUnauthorized);
  }, [navigate]);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/tap" element={<Tap />} />
      <Route path="/app" element={<ProtectedRoute />}>
        <Route element={<SiteRequired />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="zones" element={<Zones />} />
          <Route path="site" element={<Site />} />
          <Route path="qr" element={<QrCodes />} />
          <Route path="reports" element={<Reports />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
    </Routes>
  );
}

function SiteRequired() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setStatus('loading');
    getSite()
      .then((site) => {
        if (!active) return;
        if (!site && location.pathname !== '/app/site') {
          navigate('/app/site', { replace: true, state: { setupRequired: true } });
          return;
        }
        setStatus('ready');
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError.message || 'Unable to load your plant. Please try again.');
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [location.pathname, navigate]);

  if (status === 'loading') return <div className="route-loading" role="status">Loading your plant…</div>;
  if (status === 'error') return <div className="route-loading" role="alert">{error}</div>;
  return <Outlet />;
}

export default function App() {
  return (
    <Router>
      <ManagerRoutes />
    </Router>
  );
}
