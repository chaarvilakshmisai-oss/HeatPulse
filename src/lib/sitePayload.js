export function buildSitePayload(site, zones = site.zones || [], deviceLocation) {
  const timeZone = site.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  return {
    name: site.name.trim(),
    lat: Number(site.lat),
    lon: Number(site.lon),
    radiusM: Number(site.radiusM),
    requireLocation: Boolean(site.requireLocation),
    timeZone,
    zones: zones.map((zone) => ({
      ...(zone.id ? { id: zone.id } : {}),
      name: zone.name.trim(),
      kind: zone.kind,
      roof: zone.roof,
      ventilation: zone.ventilation,
      headcount: Number(zone.headcount),
    })),
    ...(deviceLocation ? { deviceLocation } : {}),
  };
}
