const apiUrl = process.env.API_URL?.replace(/\/+$/, '');
const siteId = process.env.SITE_ID;
const zoneId = process.env.ZONE_ID;
const count = Number(process.env.COUNT || 5);

if (!apiUrl || !siteId || !zoneId) {
  console.error('Set API_URL, SITE_ID, and ZONE_ID before seeding sample taps.');
  process.exit(2);
}

if (!Number.isInteger(count) || count < 1 || count > 100) {
  console.error('COUNT must be a whole number from 1 to 100.');
  process.exit(2);
}

const location = ['LAT', 'LON', 'ACCURACY'].every((key) => process.env[key] !== undefined)
  ? {
    lat: Number(process.env.LAT),
    lon: Number(process.env.LON),
    accuracy: Number(process.env.ACCURACY),
  }
  : {};

if (Object.values(location).some((value) => !Number.isFinite(value))) {
  console.error('LAT, LON, and ACCURACY must all be finite numbers when provided.');
  process.exit(2);
}

for (let index = 0; index < count; index += 1) {
  const level = Math.floor(Math.random() * 3) + 1;
  let response;
  try {
    response = await fetch(`${apiUrl}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, zoneId, level, ...location }),
    });
  } catch {
    console.error("Can't reach the server. Check your connection and try again.");
    process.exit(1);
  }

  if (!response.ok) {
    let message = `The API rejected a sample tap (${response.status}).`;
    try {
      const payload = await response.json();
      if (payload.error) message = payload.error;
    } catch {
      // Keep the status message when the error response is not JSON.
    }
    console.error(message);
    process.exit(1);
  }
}

console.log(`Submitted ${count} sample taps for zone ${zoneId}.`);
