import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getIdToken: vi.fn(),
  isDemoMode: vi.fn(() => false),
  isManagerLoginFlowActive: vi.fn(() => false),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('./auth.js', () => auth);
vi.mock('./config.js', () => ({
  API_BASE_URL: 'https://api.example.test',
  buildApiUrl: (path) => `https://api.example.test${path}`,
}));

import {
  ApiError,
  getHealth,
  getPublicSite,
  getReports,
  getSite,
  getPlants,
  getPlant,
  invalidateSiteCache,
  getBreakSummary,
  getWorkerPlan,
  getWorkerPlanById,
  getWorkers,
  getZones,
  deactivateWorker,
  deletePlant,
  recordWorkerBreak,
  saveSite,
  savePlant,
  saveWorker,
  sendReport,
} from './api.js';
import { completeManagerSignIn } from '../pages/Login.jsx';

const API_BASE = 'https://api.example.test';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastRequest() {
  const [url, options] = fetch.mock.calls.at(-1);
  return { url, options, headers: new Headers(options.headers) };
}

function expectManagerRequest({ url, method = 'GET', body }) {
  const request = lastRequest();
  expect(request.url).toBe(`${API_BASE}${url}`);
  expect(request.options.method).toBe(method);
  expect(request.headers.get('Authorization')).toBe('manager-id-token');
  if (body === undefined) {
    expect(request.headers.has('Content-Type')).toBe(false);
  } else {
    expect(request.headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(request.options.body)).toEqual(body);
  }
  expect(request.options.signal).toBeInstanceOf(AbortSignal);
}

function expectPublicRequest({ url, method = 'GET', body }) {
  const request = lastRequest();
  expect(request.url).toBe(`${API_BASE}${url}`);
  expect(request.options.method).toBe(method);
  expect(request.headers.has('Authorization')).toBe(false);
  if (body === undefined) {
    expect(request.headers.has('Content-Type')).toBe(false);
  } else {
    expect(request.headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(request.options.body)).toEqual(body);
  }
  expect(request.options.signal).toBeInstanceOf(AbortSignal);
}

beforeEach(() => {
  invalidateSiteCache();
  vi.stubGlobal('fetch', vi.fn());
  auth.getIdToken.mockClear();
  auth.getIdToken.mockResolvedValue('manager-id-token');
  auth.getCurrentUser.mockClear();
  auth.getCurrentUser.mockResolvedValue(null);
  auth.isDemoMode.mockReturnValue(false);
  auth.isManagerLoginFlowActive.mockClear();
  auth.isManagerLoginFlowActive.mockReturnValue(false);
  auth.signOut.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('frontend API contract', () => {
  it('gets a public site without a token', async () => {
    const site = { name: 'Plant', requireLocation: true, zones: [{ id: 'z1', name: 'Zone 1' }] };
    fetch.mockResolvedValueOnce(jsonResponse(site));
    await expect(getPublicSite('site/one')).resolves.toEqual(site);
    expectPublicRequest({ url: '/public/sites/site%2Fone' });
  });

  it('sends a public report payload without a token', async () => {
    const report = {
      siteId: 'site-1',
      zoneId: 'zone-1',
      level: 2,
      lat: 12.3,
      lon: 45.6,
      accuracy: 8,
    };
    fetch.mockResolvedValueOnce(jsonResponse({ ok: true, verified: true }, 201));
    await expect(sendReport(report)).resolves.toEqual({ ok: true, verified: true });
    expectPublicRequest({ url: '/report', method: 'POST', body: report });
  });

  it('returns the plain local manager site object with its ID token', async () => {
    const site = { siteId: 'local-manager', name: 'Plant', zones: [] };
    fetch.mockResolvedValueOnce(jsonResponse(site));
    await expect(getSite()).resolves.toEqual(site);
    expect(auth.getIdToken).toHaveBeenCalledOnce();
    expectManagerRequest({ url: '/site' });
  });

  it('shares one site request per navigation and invalidates after a save', async () => {
    const site = { siteId: 'local-manager', name: 'INDUSTRY1', zones: [] };
    fetch
      .mockResolvedValueOnce(jsonResponse(site))
      .mockResolvedValueOnce(jsonResponse(site))
      .mockResolvedValueOnce(jsonResponse({ site, locationCheck: null }))
      .mockResolvedValueOnce(jsonResponse({ ...site, name: 'Updated plant' }));

    const [fromGuard, fromShell] = await Promise.all([getSite(), getSite()]);
    expect(fromGuard).toEqual(site);
    expect(fromShell).toEqual(site);
    expect(fetch).toHaveBeenCalledOnce();
    await expect(getSite()).resolves.toEqual(site);
    expect(fetch).toHaveBeenCalledOnce();

    invalidateSiteCache();
    await expect(getSite()).resolves.toEqual(site);
    expect(fetch).toHaveBeenCalledTimes(2);

    await saveSite(site);
    await expect(getSite()).resolves.toEqual({ ...site, name: 'Updated plant' });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('routes successful login to home without loading a plant first', async () => {
    auth.signIn.mockResolvedValue({ email: 'manager@example.com' });
    const navigate = vi.fn();
    await completeManagerSignIn(
      () => auth.signIn('manager@example.com', 'password'),
      navigate,
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/app/home', { replace: true });
  });

  it('lists plants and caches a plant lookup for a navigation', async () => {
    const plants = [{ plantId: 'plant-1', plantCode: 'HP-4K7Q', name: 'Plant One' }];
    fetch.mockResolvedValueOnce(jsonResponse(plants));
    await expect(getPlants()).resolves.toEqual(plants);
    expectManagerRequest({ url: '/plants' });

    fetch.mockResolvedValueOnce(jsonResponse(plants[0]));
    await expect(getPlant('plant-1')).resolves.toEqual(plants[0]);
    await expect(getPlant('plant-1')).resolves.toEqual(plants[0]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expectManagerRequest({ url: '/plants/plant-1' });
  });

  it('maps only an unknown plant lookup to null and allows retry after errors', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ error: 'Plant not found' }, 404))
      .mockResolvedValueOnce(jsonResponse({ error: 'Service unavailable' }, 503))
      .mockResolvedValueOnce(jsonResponse({ plantId: 'plant-1', name: 'Plant One' }));
    await expect(getPlant('plant-404')).resolves.toBeNull();
    await expect(getPlant('plant-503')).rejects.toMatchObject({ status: 503 });
    await expect(getPlant('plant-503')).resolves.toMatchObject({ plantId: 'plant-1' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('loads zones, reports, workers and breaks scoped to a plant', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ workers: [], zones: [] }));
    await expect(getZones('plant-1')).resolves.toEqual([]);
    expectManagerRequest({ url: '/plants/plant-1/zones' });
    await expect(getReports(10, 'plant-1')).resolves.toEqual([]);
    expectManagerRequest({ url: '/plants/plant-1/reports?limit=10' });
    await expect(getWorkers('plant-1')).resolves.toEqual([]);
    expectManagerRequest({ url: '/plants/plant-1/workers' });
    await expect(getBreakSummary('plant-1')).resolves.toEqual({ workers: [], zones: [] });
    expectManagerRequest({ url: '/plants/plant-1/breaks' });
  });

  it('saves and deletes plants through owner-scoped routes', async () => {
    const input = { name: 'Plant Two', lat: 12, lon: 34, radiusM: 300, requireLocation: false, zones: [] };
    const created = { ...input, plantId: 'plant-2', plantCode: 'HP-9XYZ' };
    fetch.mockResolvedValueOnce(jsonResponse(created, 201));
    await expect(savePlant(input)).resolves.toEqual(created);
    expectManagerRequest({ url: '/plants', method: 'POST', body: input });

    fetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await expect(deletePlant('plant-2')).resolves.toEqual({ ok: true });
    expectManagerRequest({ url: '/plants/plant-2', method: 'DELETE' });
  });

  it('keeps login navigation independent of whether a manager has plants', async () => {
    const navigate = vi.fn();
    await completeManagerSignIn(() => auth.signIn('manager@example.com', 'password'), navigate);
    expect(navigate).toHaveBeenCalledWith('/app/home', { replace: true });
  });

  it('shows the actual 401 during login without dispatching an expired-session event', async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    auth.isManagerLoginFlowActive.mockReturnValue(true);
    fetch.mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401));

    await expect(getSite()).rejects.toMatchObject({
      message: 'Server rejected your token (401)',
      status: 401,
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('maps the manager site 404 (No site yet) to null', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ error: 'No site yet' }, 404));
    await expect(getSite()).resolves.toBeNull();
    expectManagerRequest({ url: '/site' });
  });

  it('does not map non-404 site errors to a missing plant and permits retry', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ error: 'Backend unavailable' }, 503))
      .mockResolvedValueOnce(jsonResponse({ error: 'No site yet' }, 404));

    await expect(getSite()).rejects.toMatchObject({
      status: 503,
      message: 'Backend unavailable',
    });
    await expect(getSite()).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('saves the complete manager site payload with PUT', async () => {
    const payload = {
      name: 'Plant',
      lat: 12.3,
      lon: 45.6,
      radiusM: 300,
      requireLocation: true,
      zones: [{
        id: 'stable-zone-id',
        name: 'Furnace',
        kind: 'process',
        roof: 'metal',
        ventilation: 'poor',
        headcount: 32,
      }],
      deviceLocation: { lat: 12.31, lon: 45.61, accuracy: 7 },
    };
    const result = { site: { ...payload, siteId: 'site-1' }, locationCheck: { status: 'verified' } };
    fetch.mockResolvedValueOnce(jsonResponse(result));
    await expect(saveSite(payload)).resolves.toEqual(result);
    expectManagerRequest({ url: '/site', method: 'PUT', body: payload });
  });

  it('gets zones with a manager token', async () => {
    const zones = [{
      id: 'zone-1',
      name: 'Furnace',
      kind: 'process',
      roof: 'metal',
      ventilation: 'poor',
      headcount: 32,
      exposure: 0.9,
      tapsToday: 4,
      recentTooHotTaps: 2,
    }];
    fetch.mockResolvedValueOnce(jsonResponse(zones));
    await expect(getZones()).resolves.toEqual(zones);
    expectManagerRequest({ url: '/zones' });
  });

  it('gets the requested report limit with a manager token', async () => {
    const reports = [{ zoneId: 'zone-1', zoneName: 'Furnace', level: 3, ts: '2026-10-10T08:00:00Z', verified: true }];
    fetch.mockResolvedValueOnce(jsonResponse(reports));
    await expect(getReports(17)).resolves.toEqual(reports);
    expectManagerRequest({ url: '/reports?limit=17' });
  });

  it('lists workers with a manager token', async () => {
    const workers = [{ workerId: 'W-4K7Q', name: 'Worker One', zoneId: 'zone-1', active: true }];
    fetch.mockResolvedValueOnce(jsonResponse(workers));
    await expect(getWorkers()).resolves.toEqual(workers);
    expectManagerRequest({ url: '/workers' });
  });

  it('creates and updates workers with manager requests', async () => {
    const worker = { workerId: 'W-4K7Q', name: 'Worker One', zoneId: 'zone-1', shiftStart: '07:00', shiftEnd: '15:00', active: true };
    fetch.mockResolvedValueOnce(jsonResponse(worker, 201));
    const { workerId, ...newWorker } = worker;
    await expect(saveWorker(newWorker)).resolves.toEqual(worker);
    expectManagerRequest({
      url: '/workers',
      method: 'POST',
      body: newWorker,
    });

    fetch.mockResolvedValueOnce(jsonResponse(worker));
    await expect(saveWorker(worker)).resolves.toEqual(worker);
    expectManagerRequest({
      url: '/workers/W-4K7Q',
      method: 'PUT',
      body: { name: worker.name, zoneId: worker.zoneId, shiftStart: worker.shiftStart, shiftEnd: worker.shiftEnd, active: true },
    });
  });

  it('deactivates workers and loads manager break summaries', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ workerId: 'W-4K7Q', active: false }));
    await expect(deactivateWorker('W-4K7Q')).resolves.toEqual({ workerId: 'W-4K7Q', active: false });
    expectManagerRequest({ url: '/workers/W-4K7Q', method: 'DELETE' });

    const summary = { date: '2026-10-11', workers: [], zones: [] };
    fetch.mockResolvedValueOnce(jsonResponse(summary));
    await expect(getBreakSummary()).resolves.toEqual(summary);
    expectManagerRequest({ url: '/breaks' });
  });

  it('looks up a worker plan and records break events without manager credentials', async () => {
    const plan = { shift: { start: '2026-10-11T01:30:00.000Z', end: '2026-10-11T09:30:00.000Z', timeZone: 'Asia/Kolkata' }, nextBreak: null, breakStatus: 'done' };
    fetch.mockResolvedValueOnce(jsonResponse(plan));
    await expect(getWorkerPlan('site 1', 'zone/a', 'W-4K7Q')).resolves.toEqual(plan);
    expectPublicRequest({ url: '/public/workers/site%201/zone%2Fa/W-4K7Q' });

    const breakEvent = { type: 'start', scheduledAt: plan.shift.start, lat: 12.3, lon: 45.6 };
    const result = { ok: true, breakEvent: { type: 'start', timestamp: plan.shift.start, withinRadius: null } };
    fetch.mockResolvedValueOnce(jsonResponse(result, 201));
    await expect(recordWorkerBreak('site 1', 'zone/a', 'W-4K7Q', breakEvent)).resolves.toEqual(result);
    expectPublicRequest({
      url: '/public/workers/site%201/zone%2Fa/W-4K7Q/breaks',
      method: 'POST',
      body: breakEvent,
    });
  });

  it('looks up a worker by plant code and worker ID without a token', async () => {
    const plan = { shift: { start: '2026-10-11T01:30:00.000Z', end: '2026-10-11T09:30:00.000Z', timeZone: 'Asia/Kolkata' }, nextBreak: null, breakStatus: 'done' };
    fetch.mockResolvedValueOnce(jsonResponse(plan));
    await expect(getWorkerPlanById('plant 1', 'W-4K7Q')).resolves.toEqual(plan);
    expectPublicRequest({ url: '/public/workers/plant%201/W-4K7Q' });
  });

  it('checks API health without a token', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await expect(getHealth()).resolves.toEqual({ ok: true });
    expectPublicRequest({ url: '/health' });
  });

  it.each([
    [403, { error: 'You appear to be outside the plant area.', code: 'outside_area' }, 'outside_area'],
    [403, { error: 'Location required.', code: 'location_required' }, 'location_required'],
  ])('surfaces the %s report error and code', async (status, payload, code) => {
    fetch.mockResolvedValueOnce(jsonResponse(payload, status));
    await expect(sendReport({ siteId: 'site-1', zoneId: 'zone-1', level: 3 })).rejects.toMatchObject({
      message: payload.error,
      status,
      code,
    });
    expectPublicRequest({
      url: '/report',
      method: 'POST',
      body: { siteId: 'site-1', zoneId: 'zone-1', level: 3 },
    });
  });

  it('surfaces an unknown public site 404', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ error: 'Site not found' }, 404));
    await expect(getPublicSite('missing')).rejects.toMatchObject({
      message: 'Site not found',
      status: 404,
    });
  });

  it('surfaces server validation errors and statuses', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ error: 'radiusM must be from 50 to 2000' }, 400));
    await expect(saveSite({ name: 'Plant' })).rejects.toMatchObject({
      message: 'radiusM must be from 50 to 2000',
      status: 400,
    });
    expectManagerRequest({ url: '/site', method: 'PUT', body: { name: 'Plant' } });
  });

  it('signs out and dispatches a login redirect on manager 401', async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    auth.getCurrentUser.mockResolvedValue({ email: 'manager@example.com' });
    fetch.mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401));

    await expect(getZones()).rejects.toMatchObject({
      message: 'Your session expired. Please sign in again.',
      status: 401,
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0].type).toBe('heatpulse:unauthorized');
    expectManagerRequest({ url: '/zones' });
  });

  it('does not dispatch unauthorized for a manager 401 without an active session', async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    fetch
      .mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401));

    await expect(getZones()).rejects.toMatchObject({ status: 401 });
    expect(auth.getCurrentUser).toHaveBeenCalledOnce();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('retries a failed GET once after a network error', async () => {
    fetch
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(jsonResponse([{ id: 'zone-1' }]));

    await expect(getZones()).resolves.toEqual([{ id: 'zone-1' }]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expectManagerRequest({ url: '/zones' });
  });

  it('maps a final network error to the friendly message', async () => {
    fetch.mockRejectedValue(new TypeError('network down'));
    await expect(getHealth()).rejects.toBeInstanceOf(ApiError);
    await expect(getHealth()).rejects.toMatchObject({
      message: "Can't reach the server. Check your connection and try again.",
    });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('aborts requests after the 15-second timeout and retries GET once', async () => {
    vi.useFakeTimers();
    fetch.mockImplementation((_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));

    const request = getHealth().then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(15_000);
    const result = await request;
    expect(result.error).toMatchObject({
      message: "Can't reach the server. Check your connection and try again.",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
