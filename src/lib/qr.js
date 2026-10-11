export function buildQrUrl(origin, plantId, zoneId) {
  if (!plantId || !zoneId) throw new Error('A saved plant and work area are required to build a QR code.');
  const url = new URL('/tap', origin);
  url.searchParams.set('plantId', plantId);
  url.searchParams.set('zoneId', zoneId);
  return url.toString();
}
