import { describe, expect, it } from 'vitest';
import { getMissingConfiguration, normalizeApiBase } from './config.js';

describe('frontend environment configuration', () => {
  it('removes all trailing slashes from the API base exactly once', () => {
    expect(normalizeApiBase('https://api.example.test///')).toBe('https://api.example.test');
    expect(normalizeApiBase('')).toBe('');
  });

  it('allows demo mode without manager/API variables', () => {
    expect(getMissingConfiguration({ userPoolId: '', userPoolClientId: '', apiBaseUrl: '' })).toEqual([]);
  });

  it('lists every required missing non-demo variable', () => {
    expect(getMissingConfiguration({ userPoolId: 'pool-id', userPoolClientId: '', apiBaseUrl: '' })).toEqual([
      'VITE_API_URL',
      'VITE_USER_POOL_CLIENT_ID',
    ]);
  });

  it('accepts complete non-demo configuration', () => {
    expect(getMissingConfiguration({
      userPoolId: 'pool-id',
      userPoolClientId: 'client-id',
      apiBaseUrl: 'https://api.example.test',
    })).toEqual([]);
  });
});
