import { describe, expect, it } from 'vitest';
import { validateSite, validateZone } from './validation.js';

describe('manager form validation', () => {
  it('validates required zone values and limits', () => {
    expect(validateZone({ name: '   ', kind: 'invalid', roof: '', ventilation: '', headcount: 5001 })).toMatchObject({
      name: expect.any(String),
      kind: expect.any(String),
      roof: expect.any(String),
      ventilation: expect.any(String),
      headcount: expect.any(String),
    });
    expect(validateZone({
      name: 'Furnace bay',
      kind: 'process',
      roof: 'metal',
      ventilation: 'poor',
      headcount: 42,
    })).toEqual({});
  });

  it('validates plant coordinates and allowed radius', () => {
    expect(validateSite({ name: '', lat: 91, lon: -181, radiusM: 49 })).toMatchObject({
      name: expect.any(String),
      lat: expect.any(String),
      lon: expect.any(String),
      radiusM: expect.any(String),
    });
    expect(validateSite({ name: 'Plant 1', lat: '37.7', lon: '-122.4', radiusM: 300 })).toEqual({});
  });
});
