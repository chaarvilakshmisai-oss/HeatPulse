import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  isDemoMode,
  setManagerLoginFlowActive,
  signIn,
} from '../lib/auth.js';
import Sky from '../components/Sky.jsx';

export function routeManagerByPlant(navigate) {
  navigate('/app/home', { replace: true });
}

export async function completeManagerSignIn(signInManager, navigate) {
  await signInManager();
  routeManagerByPlant(navigate);
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const demoMode = isDemoMode();

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    setManagerLoginFlowActive(true);
    try {
      await completeManagerSignIn(
        () => signIn(email.trim(), password),
        navigate,
      );
    } catch (signInError) {
      setError(signInError.name === 'NotAuthorizedException' || signInError.code === 'NotAuthorizedException'
        ? 'Incorrect email or password'
        : signInError.message || 'Unable to sign in. Please try again.');
    } finally {
      setManagerLoginFlowActive(false);
      setLoading(false);
    }
  }

  return (
    <div className="sky-shell">
      <Sky />
      <main className="login-wrap">
        <section className="login-card card">
          <div className="login-brand">
            <span className="logo-mark" aria-hidden="true">H</span>
            <span>HeatPulse</span>
          </div>
          <h1>Manager sign in</h1>
          {demoMode && <p className="demo-banner" role="status">Demo mode: sample data, no real sign-in</p>}
          {location.state?.message && <p className="form-error" role="alert">{location.state.message}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <form onSubmit={handleSubmit}>
            <label htmlFor="manager-email">Email</label>
            <input id="manager-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required={!demoMode} />
            <label htmlFor="manager-password">Password</label>
            <input id="manager-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required={!demoMode} />
            <label className="show-password">
              <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
              Show password
            </label>
            <button className="primary-button login-submit" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : demoMode ? 'Continue in demo mode' : 'Sign in'}
            </button>
          </form>
          <p className="login-footer">Accounts are created by your plant admin.</p>
          <Link className="login-worker-link" to="/worker-login">Worker login</Link>
        </section>
      </main>
    </div>
  );
}
