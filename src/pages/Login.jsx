import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getCurrentUser, isDemoMode, signIn, signOut } from '../lib/auth.js';
import { getSite } from '../lib/api.js';
import Sky from '../components/Sky.jsx';

export async function prepareLoginSession(readCurrentUser = getCurrentUser, clearSession = signOut) {
  await readCurrentUser();
  clearSession();
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(true);
  const [error, setError] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const demoMode = isDemoMode();

  async function continueToManagerApp() {
    try {
      const site = await getSite();
      navigate(site ? '/app/dashboard' : '/app/site', {
        replace: true,
        ...(site ? {} : { state: { setupRequired: true } }),
      });
    } catch (siteError) {
      setError(`Signed in, but plant status could not be loaded: ${siteError.message || 'Please retry.'}`);
    }
  }

  useEffect(() => {
    let active = true;
    prepareLoginSession()
      .catch((sessionError) => {
        if (active) setError(sessionError.message || 'Unable to clear the saved session. Please try again.');
      })
      .finally(() => {
        if (active) setPreparing(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading || preparing) return;
    setLoading(true);
    setError('');
    try {
      await signIn(email.trim(), password);
      await continueToManagerApp();
    } catch (signInError) {
      setError(signInError.name === 'NotAuthorizedException' || signInError.code === 'NotAuthorizedException'
        ? 'Incorrect email or password'
        : signInError.message || 'Unable to sign in. Please try again.');
    } finally {
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
          {error.startsWith('Signed in, but plant status') && (
            <button className="secondary-button" type="button" onClick={continueToManagerApp}>Retry plant check</button>
          )}
          {preparing && <p role="status">Preparing sign in…</p>}
          <form onSubmit={handleSubmit}>
            <label htmlFor="manager-email">Email</label>
            <input id="manager-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required={!demoMode} />
            <label htmlFor="manager-password">Password</label>
            <input id="manager-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required={!demoMode} />
            <label className="show-password">
              <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
              Show password
            </label>
            <button className="primary-button login-submit" type="submit" disabled={loading || preparing}>
              {preparing ? 'Preparing…' : loading ? 'Signing in…' : demoMode ? 'Continue in demo mode' : 'Sign in'}
            </button>
          </form>
          <p className="login-footer">Accounts are created by your plant admin.</p>
          <Link className="login-worker-link" to="/tap?site=sample-site&zone=furnace">Worker tap</Link>
        </section>
      </main>
    </div>
  );
}
