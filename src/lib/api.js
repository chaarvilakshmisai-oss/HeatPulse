import { MOCK_ROOMS } from '../data/mock.js';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Fetch zones from API or fall back to sample MOCK_ROOMS.
 * Returns { rooms, isUsingSampleData }
 */
export async function getZones() {
  if (!API_BASE) {
    return {
      rooms: MOCK_ROOMS,
      isUsingSampleData: true,
      reason: "VITE_API_URL environment variable is not set."
    };
  }

  try {
    const res = await fetch(`${API_BASE}/zones`);
    if (!res.ok) {
      throw new Error(`Server returned HTTP status ${res.status}`);
    }
    const data = await res.json();
    return {
      rooms: data,
      isUsingSampleData: false
    };
  } catch (err) {
    console.warn("API getZones request failed, falling back to sample data.", err);
    return {
      rooms: MOCK_ROOMS,
      isUsingSampleData: true,
      reason: err.message || "Network request failed."
    };
  }
}

/**
 * Send a resident heat tap report for a zone/room.
 * POST {base}/report with JSON { zoneId, level }
 * @param {string|number} zoneId
 * @param {number} level - 1: fine, 2: warm, 3: too hot
 */
export async function sendReport(zoneId, level) {
  if (!API_BASE) {
    // Fallback: resolve after a short artificial delay (250ms)
    await new Promise((resolve) => setTimeout(resolve, 250));
    return { success: true, mocked: true, zoneId, level };
  }

  try {
    const res = await fetch(`${API_BASE}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zoneId: Number(zoneId), level: Number(level) })
    });
    if (!res.ok) {
      throw new Error(`Server returned HTTP status ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.warn("API sendReport request failed, falling back to mock response.", err);
    return { success: true, mocked: true, zoneId, level };
  }
}
