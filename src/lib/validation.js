const ZONE_KINDS = ['process', 'indoor', 'outdoor', 'cooled'];
const ROOF_TYPES = ['metal', 'concrete', 'open'];
const VENTILATION_TYPES = ['poor', 'average', 'good'];

export function validateZone(zone) {
  const errors = {};
  const name = typeof zone.name === 'string' ? zone.name.trim() : '';
  if (!name || name.length > 40) errors.name = 'Enter a zone name between 1 and 40 characters.';
  if (!ZONE_KINDS.includes(zone.kind)) errors.kind = 'Choose a zone type.';
  if (!ROOF_TYPES.includes(zone.roof)) errors.roof = 'Choose a roof type.';
  if (!VENTILATION_TYPES.includes(zone.ventilation)) errors.ventilation = 'Choose a ventilation level.';
  if (String(zone.headcount ?? '').trim() === ''
    || !Number.isInteger(Number(zone.headcount))
    || Number(zone.headcount) < 0
    || Number(zone.headcount) > 5000) {
    errors.headcount = 'Workers must be a whole number from 0 to 5000.';
  }
  return errors;
}

export function validateSite(site) {
  const errors = {};
  if (!site.name?.trim()) errors.name = 'Enter a plant name.';
  const latitude = Number(site.lat);
  const longitude = Number(site.lon);
  if (String(site.lat ?? '').trim() === '' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    errors.lat = 'Enter a latitude from -90 to 90.';
  }
  if (String(site.lon ?? '').trim() === '' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    errors.lon = 'Enter a longitude from -180 to 180.';
  }
  if (!Number.isInteger(Number(site.radiusM)) || site.radiusM < 50 || site.radiusM > 2000) {
    errors.radiusM = 'Allowed radius must be from 50 to 2000 metres.';
  }
  return errors;
}
