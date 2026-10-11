import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  getIdToken: vi.fn(),
  isDemoMode: vi.fn(() => false),
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
  getBreakSummary,
  getWorkerPlan,
  getWorkerPlanById,
  getWorkers,
  getZones,
  deactivateWorker,
  recordWorkerBreak,
  saveSite,
  saveWorker,
  sendReport,
} from './api.js';

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
  vi.stubGlobal('fetch', vi.fn());
  auth.getIdToken.mockResolvedValue('manager-id-token');
  auth.isDemoMode.mockReturnValue(false);
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
    expectManagerRequest({ url: '/site' });
  });

  it('maps the manager site 404 (No site yet) to null', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ error: 'No site yet' }, 404));
    await expect(getSite()).resolves.toBeNull();
    expectManagerRequest({ url: '/site' });
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
    fetch.mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401));

    await expect(getZones()).rejects.toMatchObject({
      message: 'Your session expired. Please sign in again.',
      status: 401,
    });
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0].type).toBe('heatpulse:unauthorized');
    expectManagerRequest({ url: '/zones' });
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
