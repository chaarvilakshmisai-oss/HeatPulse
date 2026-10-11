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
  if (String(site.lat ?? '').trim() !== ''
    && String(site.lon ?? '').trim() !== ''
    && latitude === 0
    && longitude === 0) {
    errors.lat = 'Plant coordinates cannot be 0, 0.';
    errors.lon = 'Plant coordinates cannot be 0, 0.';
  }
  if (!Number.isInteger(Number(site.radiusM)) || site.radiusM < 50 || site.radiusM > 2000) {
    errors.radiusM = 'Allowed radius must be from 50 to 2000 metres.';
  }
  if (!site.timeZone) {
    errors.timeZone = 'Enter the plant time zone, such as Asia/Kolkata.';
  } else {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: site.timeZone }).format();
    } catch {
      errors.timeZone = 'Enter a valid IANA time zone, such as Asia/Kolkata.';
    }
  }
  return errors;
}

export function validateWorker(worker) {
  const errors = {};
  if (!worker.name?.trim() || worker.name.trim().length > 80) errors.name = 'Enter a worker name (up to 80 characters).';
  if (!worker.zoneId) errors.zoneId = 'Choose a work area.';
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(worker.shiftStart || '')) errors.shiftStart = 'Enter a valid shift start time.';
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(worker.shiftEnd || '')) errors.shiftEnd = 'Enter a valid shift end time.';
  if (worker.shiftStart && worker.shiftStart === worker.shiftEnd) errors.shiftEnd = 'Shift start and end must differ.';
  return errors;
}
