import { describe, expect, it } from 'vitest';
import { buildSitePayload } from './sitePayload.js';

describe('manager site payload', () => {
  it('includes all plant fields, preserves saved zone ids, and omits dashboard-only fields', () => {
    const payload = buildSitePayload({
      name: ' Plant ',
      lat: '12.3',
      lon: '45.6',
      radiusM: '300',
      requireLocation: true,
    }, [{
      id: 'server-zone-id',
      name: ' Furnace ',
      kind: 'process',
      roof: 'metal',
      ventilation: 'poor',
      headcount: '32',
      exposure: 0.9,
      tapsToday: 12,
    }], { lat: 12.31, lon: 45.61, accuracy: 7 });

    expect(payload).toEqual({
      name: 'Plant',
      lat: 12.3,
      lon: 45.6,
      radiusM: 300,
      requireLocation: true,
      zones: [{
        id: 'server-zone-id',
        name: 'Furnace',
        kind: 'process',
        roof: 'metal',
        ventilation: 'poor',
        headcount: 32,
      }],
      deviceLocation: { lat: 12.31, lon: 45.61, accuracy: 7 },
    });
  });

  it('leaves unsaved zone ids out so the server can assign stable ids', () => {
    const payload = buildSitePayload({
      name: 'Plant',
      lat: 12,
      lon: 45,
      radiusM: 300,
      requireLocation: false,
    }, [{
      name: 'New zone',
      kind: 'indoor',
      roof: 'concrete',
      ventilation: 'average',
      headcount: 10,
    }]);

    expect(payload.zones[0]).not.toHaveProperty('id');
  });

  it('keeps ids returned by the server when the reloaded site is used for editing', () => {
    const persistedSite = {
      name: 'Plant',
      lat: 12,
      lon: 45,
      radiusM: 300,
      requireLocation: false,
      zones: [{
        id: 'assigned-server-id',
        name: 'New zone',
        kind: 'indoor',
        roof: 'concrete',
        ventilation: 'average',
        headcount: 10,
      }],
    };

    expect(buildSitePayload(persistedSite).zones[0].id).toBe('assigned-server-id');
  });
});
