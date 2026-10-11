import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
  HOME_ROUTE,
  MANAGER_IDLE_TIMEOUT_MS,
  UNKNOWN_ROUTE,
  expireManagerSession,
  protectedRouteDecision,
  startManagerIdleTimeout,
} from '../App.jsx';
import Welcome, { LandingNavActions } from '../pages/Welcome.jsx';
import Login, { prepareLoginSession } from '../pages/Login.jsx';
import ManagerHome, { ManagerHomeContent } from '../pages/ManagerHome.jsx';
import { WORKER_NOT_FOUND_MESSAGE, workerLookupErrorMessage } from '../pages/WorkerLogin.jsx';
import { clearLegacyCognitoSession, signOut } from './auth.js';

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
    expect(html).toContain('HEATPULSE');
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

  it('renders the sign-in form and clears an existing session before showing it', async () => {
    const html = renderToString(createElement(
      MemoryRouter,
      null,
      createElement(Login)
    ));
    expect(html).toContain('Manager sign in');
    expect(html).toContain('manager-email');
    expect(html).toContain('manager-password');

    const readCurrentUser = vi.fn().mockResolvedValue({ email: 'remembered@example.com' });
    const clearSession = vi.fn();
    await prepareLoginSession(readCurrentUser, clearSession);
    expect(readCurrentUser).toHaveBeenCalledOnce();
    expect(clearSession).toHaveBeenCalledOnce();
  });

  it('renders registered and not-registered plant states on manager home', () => {
    const registered = renderToString(createElement(
      MemoryRouter,
      null,
      createElement(ManagerHomeContent, {
        status: 'ready',
        site: { name: 'North Plant', lat: 12.3, lon: 45.6, radiusM: 300, zones: [{ id: 'z1' }, { id: 'z2' }] },
      })
    ));
    const notRegistered = renderToString(createElement(
      MemoryRouter,
      null,
      createElement(ManagerHomeContent, { status: 'ready', site: null })
    ));
    expect(registered).toContain('North Plant');
    expect(registered).toContain('12.3');
    expect(registered).toContain('45.6');
    expect(registered).toContain('2');
    expect(registered).toContain('zones');
    expect(notRegistered).toContain('No plant registered yet');
    expect(notRegistered).toContain('Register your plant');
    expect(ManagerHome).toBeTypeOf('function');
  });
});

describe('manager idle timeout', () => {
  it('signs out and redirects after the configured idle duration', () => {
    vi.useFakeTimers();
    const events = new Map();
    const target = {
      addEventListener: vi.fn((name, callback) => events.set(name, callback)),
      removeEventListener: vi.fn((name) => events.delete(name)),
    };
    const clearSession = vi.fn();
    const redirect = vi.fn();
    const cleanup = startManagerIdleTimeout(
      () => expireManagerSession(clearSession, redirect),
      MANAGER_IDLE_TIMEOUT_MS,
      target
    );

    vi.advanceTimersByTime(MANAGER_IDLE_TIMEOUT_MS - 1);
    expect(clearSession).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(clearSession).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledOnce();
    expect(MANAGER_IDLE_TIMEOUT_MS).toBe(30 * 60 * 1000);
    cleanup();
    expect(events.size).toBe(0);
    vi.useRealTimers();
  });
});

describe('Cognito session storage', () => {
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

  it('clears legacy Cognito localStorage and Cognito cache from both storages', () => {
    const localStorage = makeStorage({
      'CognitoIdentityServiceProvider.pool.user.idToken': 'old-token',
      'app.preference': 'keep',
    });
    const sessionStorage = makeStorage({
      'CognitoIdentityServiceProvider.pool.user.accessToken': 'session-token',
      'app.temporary': 'keep',
    });
    vi.stubGlobal('window', { localStorage, sessionStorage });

    clearLegacyCognitoSession();
    expect(localStorage.getItem('CognitoIdentityServiceProvider.pool.user.idToken')).toBeNull();
    expect(localStorage.getItem('app.preference')).toBe('keep');
    localStorage.setItem('CognitoIdentityServiceProvider.pool.user.refreshToken', 'token');
    signOut();
    expect(localStorage.getItem('CognitoIdentityServiceProvider.pool.user.refreshToken')).toBeNull();
    expect(sessionStorage.getItem('CognitoIdentityServiceProvider.pool.user.accessToken')).toBeNull();
    expect(sessionStorage.getItem('app.temporary')).toBe('keep');
    vi.unstubAllGlobals();
  });

  it('configures Cognito tokens to use sessionStorage', () => {
    const authSource = readFileSync(new URL('./auth.js', import.meta.url), 'utf8');
    expect(authSource).toContain('Storage: window.sessionStorage');
  });

  it('clears any saved Cognito state on login even when the session is invalid', async () => {
    const readCurrentUser = vi.fn().mockResolvedValue(null);
    const clearSession = vi.fn();
    await prepareLoginSession(readCurrentUser, clearSession);
    expect(readCurrentUser).toHaveBeenCalledOnce();
    expect(clearSession).toHaveBeenCalledOnce();
  });
});

describe('worker login errors', () => {
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
