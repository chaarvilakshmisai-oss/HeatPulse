import { describe, expect, it } from 'vitest';
import { validateSite, validateWorker, validateZone } from './validation.js';

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
    expect(validateSite({
      name: 'Plant 1',
      lat: '37.7',
      lon: '-122.4',
      radiusM: 300,
      timeZone: 'Asia/Kolkata',
    })).toEqual({});
  });

  it('rejects empty coordinates and the default 0,0 coordinates', () => {
    const requiredErrors = validateSite({
      name: 'Plant 1',
      lat: '',
      lon: '',
      radiusM: 300,
      timeZone: 'Asia/Kolkata',
    });
    expect(requiredErrors).toMatchObject({
      lat: 'Enter a latitude from -90 to 90.',
      lon: 'Enter a longitude from -180 to 180.',
    });

    expect(validateSite({
      name: 'Plant 1',
      lat: '0',
      lon: '0',
      radiusM: 300,
      timeZone: 'Asia/Kolkata',
    })).toMatchObject({
      lat: 'Plant coordinates cannot be 0, 0.',
      lon: 'Plant coordinates cannot be 0, 0.',
    });
  });

  it('validates worker details while allowing an optional zone', () => {
    expect(validateWorker({ name: '', zoneId: '', shiftStart: '25:00', shiftEnd: '08:30' })).toMatchObject({
      name: expect.any(String),
      shiftStart: expect.any(String),
    });
    expect(validateWorker({ name: 'Unassigned worker', shiftStart: '07:00', shiftEnd: '15:00' })).toEqual({});
    expect(validateWorker({
      name: 'Worker One',
      zoneId: 'zone-1',
      shiftStart: '22:00',
      shiftEnd: '06:00',
    })).toEqual({});
  });

  it('requires an international phone number only when SMS consent is checked', () => {
    const worker = { name: 'Worker One', shiftStart: '07:00', shiftEnd: '15:00', phone: '+14155552671' };
    expect(validateWorker({ ...worker, smsConsent: false })).toEqual({});
    expect(validateWorker({ ...worker, phone: '', smsConsent: true })).toHaveProperty('phone');
    expect(validateWorker({ ...worker, smsConsent: true })).toEqual({});
  });

  it('rejects an invalid plant IANA timezone when supplied', () => {
    expect(validateSite({
      name: 'Plant 1',
      lat: '37.7',
      lon: '-122.4',
      radiusM: 300,
      timeZone: 'Not/A_Real_Zone',
    })).toHaveProperty('timeZone');
  });
});
