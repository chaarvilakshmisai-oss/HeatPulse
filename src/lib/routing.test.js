import { describe, expect, it } from 'vitest';
import { protectedRouteDecision } from '../App.jsx';

describe('protected route decision', () => {
  it('redirects unauthenticated users to login with their intended URL', () => {
    expect(protectedRouteDecision(null, {
      pathname: '/app/reports',
      search: '?range=today',
      hash: '#latest',
    })).toEqual({ status: 'redirect', from: '/app/reports?range=today#latest' });
  });

  it('waits for session resolution and allows a signed-in manager', () => {
    expect(protectedRouteDecision(undefined, { pathname: '/app/zones', search: '', hash: '' })).toEqual({ status: 'loading' });
    expect(protectedRouteDecision({ email: 'manager@example.com' }, { pathname: '/app/zones' })).toEqual({ status: 'allow' });
  });
});
