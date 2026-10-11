import { MOCK_ZONES } from '../data/mock.js';
import { estimateExposure } from './exposure.js';
import {
  getCurrentUser,
  getIdToken,
  isDemoMode,
  isManagerLoginFlowActive,
  signOut,
} from './auth.js';
import { API_BASE_URL, buildApiUrl } from './config.js';

const DEMO_SITE_ID = 'sample-site';
const demoSite = {
  siteId: DEMO_SITE_ID,
  name: 'Sample Plant',
  lat: 37.7749,
  lon: -122.4194,
  radiusM: 300,
  requireLocation: false,
  locationVerifiedAt: null,
  zones: MOCK_ZONES.map((zone) => ({
    id: zone.id,
    name: zone.name,
    kind: zone.id === 'dock' ? 'outdoor' : ['furnace', 'forging', 'welding', 'press'].includes(zone.id)
      ? 'process'
      : ['can', 'off'].includes(zone.id) ? 'cooled' : 'indoor',
    roof: zone.id === 'dock' ? 'open' : ['can', 'off'].includes(zone.id) ? 'concrete' : 'metal',
    ventilation: ['furnace', 'welding', 'paint', 'wh'].includes(zone.id) ? 'poor' : 'average',
    headcount: 25,
    exposure: zone.exposure,
    tapsToday: zone.baseTaps,
    recentTooHotTaps: 0,
  })),
};
const demoReports = [];
const REQUEST_TIMEOUT_MS = 15_000;
const NETWORK_ERROR_MESSAGE = "Can't reach the server. Check your connection and try again.";
const SESSION_EXPIRED_MESSAGE = 'Your session expired. Please sign in again.';
let siteCache;
let siteCachePromise;
let hasSiteCache = false;

export function invalidateSiteCache() {
  siteCache = undefined;
  siteCachePromise = undefined;
  hasSiteCache = false;
}

function distanceBetween(lat1, lon1, lat2, lon2) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const deltaLat = radians(lat2 - lat1);
  const deltaLon = radians(lon2 - lon1);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
}

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    if (status !== undefined) this.status = status;
    if (code !== undefined) this.code = code;
  }
}

function friendlyNetworkError() {
  return new ApiError(NETWORK_ERROR_MESSAGE);
}

function errorCode(payload) {
  return payload?.code || (typeof payload?.error === 'string' ? payload.error : undefined);
}

async function parseJson(response) {
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

async function request(path, options = {}, manager = false) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');

  let response;
  let payload;
  if (manager && !isDemoMode()) headers.set('Authorization', await getIdToken());
  for (let attempt = 0; attempt < (method === 'GET' ? 2 : 1); attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      response = await fetch(buildApiUrl(path), {
        ...options,
        method,
        headers,
        signal: controller.signal,
      });
      payload = await parseJson(response);
      break;
    } catch {
      if (attempt === (method === 'GET' ? 1 : 0)) throw friendlyNetworkError();
    } finally {
      clearTimeout(timeout);
    }
  }

  if (!response.ok) {
    if (manager && response.status === 401) {
      const loginFlow = isManagerLoginFlowActive();
      if (loginFlow) {
        throw new ApiError(
          `Server rejected your token (${response.status})`,
          response.status,
          errorCode(payload),
        );
      }
      const activeUser = await getCurrentUser();
      if (activeUser) {
        signOut();
        invalidateSiteCache();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('heatpulse:unauthorized'));
        }
        throw new ApiError(SESSION_EXPIRED_MESSAGE, response.status, errorCode(payload));
      }
    }
    throw new ApiError(
      payload?.error || payload?.message || `Request failed (${response.status}). Please try again.`,
      response.status,
      errorCode(payload),
    );
  }
  return payload;
}

export async function getPublicSite(siteId) {
  if (isDemoMode()) {
    if (siteId !== DEMO_SITE_ID) throw new ApiError('This plant could not be found.', 404);
    return {
      name: demoSite.name,
      requireLocation: demoSite.requireLocation,
      zones: demoSite.zones.map(({ id, name }) => ({ id, name })),
    };
  }
  return request(`/public/sites/${encodeURIComponent(siteId)}`);
}

export async function sendReport(report) {
  if (isDemoMode()) {
    if (report.siteId !== DEMO_SITE_ID) throw new ApiError('This plant could not be found.', 404);
    const zone = demoSite.zones.find((item) => item.id === report.zoneId);
    if (!zone) throw new ApiError('This work area could not be found.', 404);
    if (demoSite.requireLocation) {
      if (!Number.isFinite(report.lat) || !Number.isFinite(report.lon)) {
        throw new ApiError('Workers must allow location access on their phones.', 403, 'location_required');
      }
      const distanceM = distanceBetween(demoSite.lat, demoSite.lon, report.lat, report.lon);
      if (distanceM > demoSite.radiusM) {
        throw new ApiError('You appear to be outside the plant area.', 403, 'outside_area');
      }
    }
    const verified = Number.isFinite(report.lat) && Number.isFinite(report.lon);
    demoReports.unshift({ ...report, ts: new Date().toISOString(), verified });
    zone.tapsToday += 1;
    if (report.level === 3) zone.recentTooHotTaps += 1;
    return { ok: true, verified };
  }
  return request('/report', { method: 'POST', body: JSON.stringify(report) });
}

export async function getSite() {
  if (isDemoMode()) return structuredClone(demoSite);
  if (hasSiteCache) return siteCache;
  if (siteCachePromise) return siteCachePromise;

  const pending = request('/site', {}, true)
    .catch((error) => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    })
    .then((site) => {
      if (siteCachePromise === pending) {
        siteCache = site;
        hasSiteCache = true;
        siteCachePromise = undefined;
      }
      return site;
    }, (error) => {
      if (siteCachePromise === pending) siteCachePromise = undefined;
      throw error;
    });
  siteCachePromise = pending;
  return pending;
}

export async function saveSite(site) {
  if (isDemoMode()) {
    const distanceM = site.deviceLocation
      ? distanceBetween(site.lat, site.lon, site.deviceLocation.lat, site.deviceLocation.lon)
      : null;
    const verified = distanceM !== null && distanceM <= site.radiusM;
    const locationCheck = site.deviceLocation
      ? verified
        ? { status: 'verified' }
        : { status: 'outside', distanceM }
      : { status: 'missing' };
    const { deviceLocation, ...savedSite } = site;
    const movedPlant = site.lat !== demoSite.lat || site.lon !== demoSite.lon;
    const existingZones = new Map(demoSite.zones.map((zone) => [zone.id, zone]));
    const zones = (site.zones || demoSite.zones).map((zone, index) => {
      const existing = existingZones.get(zone.id);
      return {
        ...zone,
        id: zone.id || `demo-zone-${Date.now()}-${index}`,
        exposure: Number.isFinite(zone.exposure) ? zone.exposure : estimateExposure(zone),
        tapsToday: existing?.tapsToday ?? zone.tapsToday ?? 0,
        recentTooHotTaps: existing?.recentTooHotTaps ?? zone.recentTooHotTaps ?? 0,
      };
    });
    Object.assign(demoSite, savedSite, { zones, siteId: DEMO_SITE_ID });
    if (verified) demoSite.locationVerifiedAt = new Date().toISOString();
    else if (movedPlant) demoSite.locationVerifiedAt = null;
    invalidateSiteCache();
    return { site: structuredClone(demoSite), locationCheck };
  }
  const result = await request('/site', { method: 'PUT', body: JSON.stringify(site) }, true);
  invalidateSiteCache();
  return result;
}

export async function getZones() {
  if (isDemoMode()) return structuredClone(demoSite.zones);
  return request('/zones', {}, true);
}

export async function getReports(limit = 50) {
  if (isDemoMode()) return structuredClone(demoReports.slice(0, limit));
  return request(`/reports?limit=${encodeURIComponent(limit)}`, {}, true);
}

export async function getWorkers() {
  if (isDemoMode()) return [];
  return request('/workers', {}, true);
}

export async function saveWorker(worker) {
  const { workerId, ...body } = worker;
  if (isDemoMode()) throw new ApiError('Worker management requires the configured API.', 501);
  return request(workerId
    ? `/workers/${encodeURIComponent(workerId)}`
    : '/workers', {
    method: workerId ? 'PUT' : 'POST',
    body: JSON.stringify(body),
  }, true);
}

export async function deactivateWorker(workerId) {
  if (isDemoMode()) throw new ApiError('Worker management requires the configured API.', 501);
  return request(`/workers/${encodeURIComponent(workerId)}`, { method: 'DELETE' }, true);
}

export async function getWorkerPlan(siteId, zoneId, workerId) {
  const path = `/public/workers/${encodeURIComponent(siteId)}/${encodeURIComponent(zoneId)}/${encodeURIComponent(workerId)}`;
  return request(path);
}

export async function getWorkerPlanById(siteId, workerId) {
  const path = `/public/workers/${encodeURIComponent(siteId)}/${encodeURIComponent(workerId)}`;
  return request(path);
}

export async function recordWorkerBreak(siteId, zoneId, workerId, breakEvent) {
  const path = `/public/workers/${encodeURIComponent(siteId)}/${encodeURIComponent(zoneId)}/${encodeURIComponent(workerId)}/breaks`;
  return request(path, { method: 'POST', body: JSON.stringify(breakEvent) });
}

export async function getBreakSummary() {
  if (isDemoMode()) return { date: new Date().toISOString().slice(0, 10), workers: [], zones: [] };
  return request('/breaks', {}, true);
}

export async function getHealth() {
  if (isDemoMode() && !API_BASE_URL) return { ok: false, demo: true };
  return request('/health');
}

export function isDemoSite() {
  return isDemoMode();
}
