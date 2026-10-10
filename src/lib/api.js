import { MOCK_ZONES } from '../data/mock.js';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export async function getZones() {
  if (!API_BASE) {
    return { zones: MOCK_ZONES, isUsingSampleData: true };
  }

  try {
    const response = await fetch(`${API_BASE}/zones`);
    if (!response.ok) throw new Error(`Zones request failed (${response.status})`);
    const zones = await response.json();
    if (!Array.isArray(zones)) throw new Error('Zones response must be an array.');
    return { zones, isUsingSampleData: false };
  } catch (error) {
    console.warn('Unable to load zones; using sample data.', error);
    return { zones: MOCK_ZONES, isUsingSampleData: true };
  }
}

export async function sendReport(zoneId, level) {
  if (!API_BASE) return { success: true, mocked: true };

  try {
    const response = await fetch(`${API_BASE}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zoneId, level }),
    });
    if (!response.ok) throw new Error(`Report request failed (${response.status})`);
    if (response.status === 204) return { success: true };
    return await response.json();
  } catch (error) {
    console.warn('Unable to send report; recording it locally for this demo.', error);
    return { success: true, mocked: true };
  }
}
