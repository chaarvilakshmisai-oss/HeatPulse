const env = import.meta.env;

export function normalizeApiBase(value) {
  return (value || '').replace(/\/+$/, '');
}

export function getMissingConfiguration(config) {
  if (!config.userPoolId) return [];
  const missing = [];
  if (!config.apiBaseUrl) missing.push('VITE_API_URL');
  if (!config.userPoolClientId) missing.push('VITE_USER_POOL_CLIENT_ID');
  return missing;
}

export const USER_POOL_ID = env.VITE_USER_POOL_ID || '';
export const USER_POOL_CLIENT_ID = env.VITE_USER_POOL_CLIENT_ID || '';
export const IS_DEMO_MODE = !USER_POOL_ID;
export const API_BASE_URL = normalizeApiBase(env.VITE_API_URL);

export function getAppConfigurationProblem() {
  return getMissingConfiguration({
    userPoolId: USER_POOL_ID,
    userPoolClientId: USER_POOL_CLIENT_ID,
    apiBaseUrl: API_BASE_URL,
  });
}

export function buildApiUrl(path) {
  if (!API_BASE_URL) throw new Error('VITE_API_URL is not configured.');
  return `${API_BASE_URL}${path}`;
}
