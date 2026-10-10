export function buildQrUrl(origin, siteId, zoneId) {
  if (!siteId || !zoneId) throw new Error('A saved plant and work area are required to build a QR code.');
  const url = new URL('/tap', origin);
  url.searchParams.set('site', siteId);
  url.searchParams.set('zone', zoneId);
  return url.toString();
}
