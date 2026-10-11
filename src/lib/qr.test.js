import { describe, expect, it } from 'vitest';
import { buildQrUrl } from './qr.js';

describe('worker QR URL builder', () => {
  it('builds a tap link for the current origin and encodes both identifiers', () => {
    expect(buildQrUrl('https://plant.example', 'site 1', 'zone/a')).toBe(
      'https://plant.example/tap?plantId=site+1&zoneId=zone%2Fa'
    );
  });

  it('requires both the saved site and zone identifiers', () => {
    expect(() => buildQrUrl('https://plant.example', '', 'zone-a')).toThrow('saved plant and work area');
  });
});
