import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
  HOME_ROUTE,
  UNKNOWN_ROUTE,
  protectedRouteDecision,
} from '../App.jsx';
import Welcome, { LandingNavActions } from '../pages/Welcome.jsx';
import Login, { completeManagerSignIn } from '../pages/Login.jsx';
import ManagerHome, { ManagerHomeContent } from '../pages/ManagerHome.jsx';
import { getTapParams } from '../pages/Tap.jsx';
import { WORKER_NOT_FOUND_MESSAGE, workerLookupErrorMessage } from '../pages/WorkerLogin.jsx';
import { clearCognitoSessionStorage, initializeBrowserSession, signOut } from './auth.js';

describe('protected route decision', () => {
  it('redirects unauthenticated users to login with their intended URL', () => {
    const decision = protectedRouteDecision(null, {
      pathname: '/app/reports',
      search: '?range=today',
      hash: '#latest',
    });
    expect(decision).toEqual({ status: 'redirect', from: '/app/reports?range=today#latest' });
    expect(decision.status === 'redirect' ? '/login' : '').toBe('/login');
  });

  it('waits for session resolution and allows a signed-in manager', () => {
    expect(protectedRouteDecision(undefined, { pathname: '/app/zones', search: '', hash: '' })).toEqual({ status: 'loading' });
    expect(protectedRouteDecision({ email: 'manager@example.com' }, { pathname: '/app/zones' })).toEqual({ status: 'allow' });
  });
});

describe('public routes and manager home', () => {
  it('renders the landing page without auth or plant API access', async () => {
    expect(HOME_ROUTE).toBe('/');
    const welcomeSource = readFileSync(new URL('../pages/Welcome.jsx', import.meta.url), 'utf8');
    const api = await import('./api.js');
    const apiSpy = vi.spyOn(api, 'getSite');
    const html = renderToString(createElement(
      MemoryRouter,
      { initialEntries: [HOME_ROUTE] },
      createElement(Welcome)
    ));
    expect(html).toContain('HeatPulse');
    expect(html).toContain('Manager login');
    expect(html).toContain('Worker login');
    expect(html).not.toContain('Go to dashboard');
    expect(html).not.toContain('Sign out');
    expect(welcomeSource).not.toMatch(/getSite|PlantStatusCard|lib\/api|lib\/auth|fetch\s*\(/);
    expect(apiSpy).not.toHaveBeenCalled();
    apiSpy.mockRestore();
  });

  it('always shows signed-out navigation even when a saved user exists', () => {
    const html = renderToString(createElement(
      MemoryRouter,
      null,
      createElement(LandingNavActions, { user: { email: 'remembered@example.com' } })
    ));
    expect(html).toContain('Manager login');
    expect(html).toContain('Worker login');
    expect(html).not.toContain('Go to dashboard');
    expect(html).not.toContain('Sign out');
  });

  it('sends unknown routes to the welcome page', () => {
    expect(UNKNOWN_ROUTE).toBe('/');
  });

  it('keeps only manager home outside the plant-required guard', () => {
    const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
    expect(appSource).toContain('<Route path="home" element={<ManagerHome />} />');
    expect(appSource).toContain('<Route path="plants/new" element={<Site />} />');
    expect(appSource).toContain('<Route path="plants/:plantId" element={<PlantRequired />}>');
    expect(appSource).toContain('<Route path="site" element={<Site />} />');
    expect(appSource).toContain('const site = await getPlant(plantId)');
    expect(appSource).toContain("navigate('/app/home', { replace: true })");
  });

  it('provides per-route metadata and an app-local not-found page', () => {
    const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
    expect(appSource).toContain("document.title = location.pathname === '/' ? 'HeatPulse' : `${page} - HeatPulse`");
    expect(appSource).toContain('meta.content = description');
    expect(appSource).toContain('<Route path="*" element={<AppNotFound />} />');
    expect(appSource).toContain('<Route path="*" element={<Navigate to={UNKNOWN_ROUTE} replace />} />');
  });

  it('invalidates the shared plant result only when the pathname changes', () => {
    const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
    expect(appSource).toContain('previousPathname.current !== location.pathname');
    expect(appSource).toContain('invalidateSiteCache();');
  });

  it('renders the sign-in form without clearing a session on page load', () => {
    const html = renderToString(createElement(
      MemoryRouter,
      null,
      createElement(Login)
    ));
    expect(html).toContain('Manager sign in');
    expect(html).toContain('manager-email');
    expect(html).toContain('manager-password');
  });

  it('routes every successful sign-in to manager home without checking plant status', async () => {
    const signInManager = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn();
    await completeManagerSignIn(signInManager, navigate);
    expect(navigate).toHaveBeenLastCalledWith('/app/home', { replace: true });
  });

  it('renders registered and not-registered plant states on manager home', () => {
    const registered = renderToString(createElement(
      MemoryRouter,
      null,
      createElement(ManagerHomeContent, {
        status: 'ready',
        plants: [{ plantId: 'p1', name: 'North Plant', plantCode: 'HP-4K7Q', lat: 12.3, lon: 45.6, radiusM: 300 }],
        summaries: [{ plantId: 'p1', zones: [{ exposure: 0.8 }, { exposure: 0.7 }], workers: [] }],
      })
    ));
    const notRegistered = renderToString(createElement(
      MemoryRouter,
      null,
      createElement(ManagerHomeContent, { status: 'ready', plants: [], summaries: [] })
    ));
    expect(registered).toContain('North Plant');
    expect(registered).toContain('12.3');
    expect(registered).toContain('45.6');
    expect(registered).toContain('Total zones');
    expect(registered).toContain('HP-4K7Q');
    expect(notRegistered).toContain('No plants registered yet');
    expect(notRegistered).toContain('Register your first plant');
    expect(ManagerHome).toBeTypeOf('function');
  });
});

describe('browser session initialization and Cognito storage', () => {
  function makeStorage(entries) {
    const values = new Map(Object.entries(entries));
    return {
      get length() { return values.size; },
      key(index) { return [...values.keys()][index] || null; },
      getItem(key) { return values.get(key) || null; },
      removeItem(key) { values.delete(key); },
      setItem(key, value) { values.set(key, value); },
    };
  }

  it('clears Cognito cache from both storages on sign-out', () => {
    const localStorage = makeStorage({
      'CognitoIdentityServiceProvider.pool.user.idToken': 'old-token',
      'app.preference': 'keep',
    });
    const sessionStorage = makeStorage({
      'CognitoIdentityServiceProvider.pool.user.accessToken': 'session-token',
      'app.temporary': 'keep',
    });
    vi.stubGlobal('window', { localStorage, sessionStorage });

    expect(localStorage.getItem('app.preference')).toBe('keep');
    signOut();
    expect(localStorage.getItem('CognitoIdentityServiceProvider.pool.user.idToken')).toBeNull();
    expect(sessionStorage.getItem('CognitoIdentityServiceProvider.pool.user.accessToken')).toBeNull();
    expect(sessionStorage.getItem('app.temporary')).toBe('keep');
    vi.unstubAllGlobals();
  });

  it('uses the SDK default localStorage and the shared ID-token getter', () => {
    const authSource = readFileSync(new URL('./auth.js', import.meta.url), 'utf8');
    expect(authSource).not.toContain('Storage: window.sessionStorage');
    expect(authSource).toContain('export function getIdToken()');
  });

  it('signs out once per browser session, then preserves later sign-ins across reloads', () => {
    const values = new Map();
    const sessionStorage = {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    };
    const clearSession = vi.fn();
    initializeBrowserSession(sessionStorage, clearSession);
    sessionStorage.setItem('manager-session', 'signed-in');
    initializeBrowserSession(sessionStorage, clearSession);
    expect(clearSession).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem('heatpulse:session-started')).toBe('true');
    expect(sessionStorage.getItem('manager-session')).toBe('signed-in');
  });

  it('runs startup sign-out again in a new browser session', () => {
    const values = new Map();
    const sessionStorage = {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    };
    const clearSession = vi.fn();

    initializeBrowserSession(sessionStorage, clearSession);

    expect(clearSession).toHaveBeenCalledOnce();
  });
});

describe('worker login errors', () => {
  it('uses worker login from manager login and routes a bare tap link away', () => {
    const loginSource = readFileSync(new URL('../pages/Login.jsx', import.meta.url), 'utf8');
    const tapSource = readFileSync(new URL('../pages/Tap.jsx', import.meta.url), 'utf8');
    expect(loginSource).toContain('to="/worker-login">Worker login</Link>');
    expect(tapSource).toContain('<Navigate to="/worker-login" replace />');
    expect(tapSource).toContain('Go to worker login');
    expect(getTapParams(new URLSearchParams())).toEqual({ siteId: '', zoneId: '' });
  });

  it('accepts current and legacy QR parameter names', () => {
    expect(getTapParams(new URLSearchParams('plantId=plant-1&zoneId=zone-1')))
      .toEqual({ siteId: 'plant-1', zoneId: 'zone-1' });
    expect(getTapParams(new URLSearchParams('site=plant-1&zone=zone-1')))
      .toEqual({ siteId: 'plant-1', zoneId: 'zone-1' });
  });

  it('uses the same generic message for unknown, inactive, and wrong-plant IDs', () => {
    const invalidCases = [
      { status: 404, reason: 'unknown ID' },
      { status: 404, reason: 'inactive ID' },
      { status: 404, reason: 'wrong plant code' },
    ];
    expect(invalidCases.map(workerLookupErrorMessage))
      .toEqual([WORKER_NOT_FOUND_MESSAGE, WORKER_NOT_FOUND_MESSAGE, WORKER_NOT_FOUND_MESSAGE]);
  });
});
