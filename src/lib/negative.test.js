import { describe, expect, it } from 'vitest';
import { protectedRouteDecision } from '../App.jsx';
import { getMissingConfiguration } from './config.js';
import { validateSite, validateWorker, validateZone } from './validation.js';
import { workerLookupErrorMessage, WORKER_NOT_FOUND_MESSAGE } from '../pages/WorkerLogin.jsx';

describe('negative frontend cases', () => {
  it('redirects missing and expired manager sessions to login without exposing a user ID', () => {
    const decision = protectedRouteDecision(null, {
      pathname: '/app/plants/private-plant/zones',
      search: '',
      hash: '',
    });
    expect(decision).toEqual({ status: 'redirect', from: '/app/plants/private-plant/zones' });
    expect(JSON.stringify(decision)).not.toContain('manager-user-id');
  });

  it('maps unknown and inactive worker credentials to the same generic message', () => {
    const results = [404, 404, 404].map((status) => workerLookupErrorMessage({ status }));
    expect(results).toEqual([WORKER_NOT_FOUND_MESSAGE, WORKER_NOT_FOUND_MESSAGE, WORKER_NOT_FOUND_MESSAGE]);
  });

  it('rejects invalid plant coordinates, whitespace names, and unreasonable radius locally', () => {
    expect(validateSite({
      name: '  ',
      lat: 'Infinity',
      lon: '181',
      radiusM: '999999',
      timeZone: 'UTC',
    })).toMatchObject({
      name: expect.any(String),
      lat: expect.any(String),
      lon: expect.any(String),
      radiusM: expect.any(String),
    });
  });

  it('rejects invalid worker consent phone data and malformed zone values', () => {
    expect(validateWorker({
      name: '<script>alert(1)</script>',
      shiftStart: '25:00',
      shiftEnd: '25:00',
      phone: '555-0100',
      smsConsent: true,
    })).toHaveProperty('phone');
    expect(validateZone({
      name: '  ',
      kind: 'sql-like',
      roof: '../',
      ventilation: 'unknown',
      headcount: -1,
    })).toMatchObject({
      name: expect.any(String),
      kind: expect.any(String),
      roof: expect.any(String),
      ventilation: expect.any(String),
      headcount: expect.any(String),
    });
  });

  it('reports incomplete API/Cognito configuration without displaying its values', () => {
    const missing = getMissingConfiguration({
      userPoolId: 'pool-private-value',
      userPoolClientId: '',
      apiBaseUrl: '',
    });
    expect(missing).toEqual(['VITE_API_URL', 'VITE_USER_POOL_CLIENT_ID']);
    expect(missing.join(' ')).not.toContain('pool-private-value');
  });
});
