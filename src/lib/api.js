import { MOCK_ZONES } from '../data/mock.js';
import { getIdToken, isDemoMode, signOut } from './auth.js';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
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
    kind: 'indoor',
    roof: 'metal',
    ventilation: 'average',
    headcount: 25,
    exposure: zone.exposure,
    tapsToday: zone.baseTaps,
    recentTooHotTaps: 0,
  })),
};
const demoReports = [];

function distanceBetween(lat1, lon1, lat2, lon2) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const deltaLat = radians(lat2 - lat1);
  const deltaLon = radians(lon2 - lon1);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function apiUrl(path) {
  if (!API_BASE) throw new Error('VITE_API_URL is not configured.');
  return `${API_BASE}${path}`;
}

async function request(path, options = {}, manager = false) {
  const headers = new Headers(options.headers || {});
  if (options.body) headers.set('Content-Type', 'application/json');
  if (manager && !isDemoMode()) headers.set('Authorization', await getIdToken());

  const response = await fetch(apiUrl(path), { ...options, headers });
  if (manager && response.status === 401) {
    signOut();
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('heatpulse:unauthorized'));
  }
  if (!response.ok) {
    let message = `Request failed (${response.status}). Please try again.`;
    try {
      const payload = await response.json();
      if (payload.message) message = payload.message;
      else if (payload.error) message = payload.error;
    } catch {
      // Use the status-based message when the response has no JSON body.
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return null;
  return response.json();
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

export async function sendReport(report, legacyLevel) {
  const payload = typeof report === 'string'
    ? { siteId: DEMO_SITE_ID, zoneId: report, level: legacyLevel }
    : report;
  if (isDemoMode()) {
    const entry = {
      ...payload,
      createdAt: new Date().toISOString(),
      locationVerified: Number.isFinite(payload.lat) && Number.isFinite(payload.lon),
    };
    demoReports.unshift(entry);
    const zone = demoSite.zones.find((item) => item.id === payload.zoneId);
    if (zone) {
      zone.tapsToday += 1;
      if (payload.level === 3) zone.recentTooHotTaps += 1;
    }
    return { success: true, mocked: true };
  }
  return request('/report', { method: 'POST', body: JSON.stringify(payload) });
}

export async function getSite() {
  if (isDemoMode()) return structuredClone(demoSite);
  try {
    return await request('/site', {}, true);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

export async function saveSite(payload) {
  if (isDemoMode()) {
    const distanceM = payload.deviceLocation
      ? distanceBetween(payload.lat, payload.lon, payload.deviceLocation.lat, payload.deviceLocation.lon)
      : null;
    const verified = distanceM !== null && distanceM <= payload.radiusM;
    const locationCheck = payload.deviceLocation
      ? verified
        ? { status: 'verified', verifiedAt: new Date().toISOString() }
        : { status: 'outside', distanceM }
      : { status: 'missing' };
    const { deviceLocation, ...site } = payload;
    const movedPlant = payload.lat !== demoSite.lat || payload.lon !== demoSite.lon;
    Object.assign(demoSite, site, { siteId: DEMO_SITE_ID });
    if (locationCheck.status === 'verified') demoSite.locationVerifiedAt = locationCheck.verifiedAt;
    else if (movedPlant || locationCheck.status === 'missing') demoSite.locationVerifiedAt = null;
    return { site: structuredClone(demoSite), locationCheck };
  }
  return request('/site', { method: 'PUT', body: JSON.stringify(payload) }, true);
}

export async function getZones() {
  if (isDemoMode()) return structuredClone(demoSite.zones);
  return request('/zones', {}, true);
}

export async function getReports(limit = 50) {
  if (isDemoMode()) return structuredClone(demoReports.slice(0, limit));
  return request(`/reports?limit=${encodeURIComponent(limit)}`, {}, true);
}

export function isDemoSite() {
  return isDemoMode();
}
