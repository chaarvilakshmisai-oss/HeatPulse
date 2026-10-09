import { MOCK_ROOMS } from '../data/mock.js';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Fetch zones from API or fallback to MOCK_ROOMS.
 */
export async function getZones() {
  if (!API_BASE) {
    return MOCK_ROOMS;
  }
  try {
    const res = await fetch(`${API_BASE}/zones`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn("API getZones failed, falling back to sample data.", err);
    return MOCK_ROOMS;
  }
}

/**
 * Send a heat report for a zone/room.
 * @param {string|number} zoneId
 * @param {number} level - 1: Fine, 2: Warm, 3: Too hot
 */
export async function sendReport(zoneId, level) {
  if (!API_BASE) {
    // Fallback: resolve after a short delay (300ms)
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { success: true, mocked: true, zoneId, level };
  }
  try {
    const res = await fetch(`${API_BASE}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zoneId, level })
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("API sendReport failed, falling back to mock behavior.", err);
    // Return mock success even on network failure so user interaction succeeds cleanly
    return { success: true, mocked: true, zoneId, level };
  }
}
