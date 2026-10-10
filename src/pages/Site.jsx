import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSite, saveSite } from '../lib/api.js';
import { validateSite } from '../lib/validation.js';

const INITIAL_SITE = { name: '', lat: '', lon: '', radiusM: 300, requireLocation: false, zones: [] };

function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not available in this browser. Allow location access or enter the plant coordinates.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, () => {
      reject(new Error('Location could not be read. Allow location access in your browser and try again.'));
    }, { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 });
  });
}

function displayTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function Site() {
  const [site, setSite] = useState(INITIAL_SITE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [accuracy, setAccuracy] = useState(null);
  const [locationCheck, setLocationCheck] = useState(null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;
    getSite()
      .then((result) => {
        if (active && result) setSite({ ...INITIAL_SITE, ...result });
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Unable to load plant details.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function update(field, value) {
    setSite((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setError('');
    setSuccess('');
    if (field === 'lat' || field === 'lon') {
      setLocationCheck(null);
      setSite((current) => ({ ...current, [field]: value, locationVerifiedAt: null }));
    }
  }

  function payload() {
    return {
      name: site.name.trim(),
      lat: Number(site.lat),
      lon: Number(site.lon),
      radiusM: Number(site.radiusM),
      requireLocation: site.requireLocation,
      zones: site.zones || [],
    };
  }

  function validSite() {
    const nextErrors = validateSite(site);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError('Fix the highlighted plant details before saving.');
      return false;
    }
    return true;
  }

  async function readPosition() {
    setGettingLocation(true);
    setError('');
    try {
      const position = await currentPosition();
      setAccuracy(Math.round(position.coords.accuracy));
      return {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
    } catch (locationError) {
      setError(locationError.message);
      setLocationCheck({ status: 'denied' });
      throw locationError;
    } finally {
      setGettingLocation(false);
    }
  }

  async function useMyLocation() {
    try {
      const position = await readPosition();
      setSite((current) => ({
        ...current,
        lat: String(position.lat),
        lon: String(position.lon),
        locationVerifiedAt: null,
      }));
      setLocationCheck(null);
      setSuccess('');
    } catch {
      // The location error is already shown inline.
    }
  }

  async function persist(deviceLocation) {
    const result = await saveSite({ ...payload(), ...(deviceLocation ? { deviceLocation } : {}) });
    const savedSite = result.site || { ...site };
    setSite((current) => ({ ...current, ...savedSite }));
    setLocationCheck(deviceLocation ? result.locationCheck || null : null);
    setSuccess(deviceLocation ? 'Plant location check completed.' : 'Plant details saved.');
  }

  async function saveDetails() {
    if (!validSite()) return;
    setSaving(true);
    setError('');
    try {
      await persist(null);
    } catch (saveError) {
      setError(saveError.message || 'Unable to save plant details.');
    } finally {
      setSaving(false);
    }
  }

  async function verifyLocation() {
    if (!validSite()) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const deviceLocation = await readPosition();
      const result = await saveSite({ ...payload(), deviceLocation });
      setSite((current) => ({ ...current, ...(result.site || {}), locationVerifiedAt: result.site?.locationVerifiedAt || null }));
      setLocationCheck(result.locationCheck || null);
      setSuccess(result.locationCheck?.status === 'verified' ? 'Location verified.' : '');
    } catch (verifyError) {
      if (verifyError.message) setError(verifyError.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="card page-state" role="status">Loading plant details…</div>;

  const lat = Number(site.lat);
  const lon = Number(site.lon);
  const canOpenMap = site.lat !== '' && site.lon !== '' && Number.isFinite(lat) && Number.isFinite(lon);
  const verifiedAt = site.locationVerifiedAt;

  return (
    <section className="manager-page">
      <header className="page-heading">
        <div>
          <h1>Site &amp; location</h1>
          <p>Set the plant boundary used for worker tap checks.</p>
        </div>
      </header>
      <p className="soft-check-note">Location comes from the browser and is a soft check; browser-reported coordinates can be inaccurate or faked.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="success-message" role="status">{success}</p>}
      <div className="card form-card">
        <div className="form-grid">
          <label className="full-width">
            Plant name
            <input value={site.name} maxLength={80} onChange={(event) => update('name', event.target.value)} />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </label>
          <label>
            Latitude
            <input type="number" min="-90" max="90" step="any" value={site.lat} onChange={(event) => update('lat', event.target.value)} />
            {errors.lat && <span className="field-error">{errors.lat}</span>}
          </label>
          <label>
            Longitude
            <input type="number" min="-180" max="180" step="any" value={site.lon} onChange={(event) => update('lon', event.target.value)} />
            {errors.lon && <span className="field-error">{errors.lon}</span>}
          </label>
        </div>
        <div className="button-row site-location-actions">
          <button type="button" className="secondary-button" disabled={gettingLocation} onClick={useMyLocation}>
            {gettingLocation ? 'Getting location…' : 'Use my current location'}
          </button>
          {canOpenMap && (
            <a href={`https://www.google.com/maps?q=${lat},${lon}`} target="_blank" rel="noopener noreferrer">Open in Maps</a>
          )}
          {accuracy !== null && <span role="status">Accuracy ±{accuracy} m</span>}
        </div>
        <label className="radius-control">
          Allowed radius: <strong>{site.radiusM} m</strong>
          <input type="range" min="50" max="2000" step="10" value={site.radiusM} onChange={(event) => update('radiusM', Number(event.target.value))} />
          {errors.radiusM && <span className="field-error">{errors.radiusM}</span>}
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={Boolean(site.requireLocation)} onChange={(event) => update('requireLocation', event.target.checked)} />
          <span>
            <strong>Only accept taps from workers inside this area</strong>
            <small>Workers must allow location access on their phones. Turn this off to test from elsewhere.</small>
          </span>
        </label>
        <div className="location-status" aria-live="polite">
          <p><strong>Stored verification:</strong> {verifiedAt ? `Location verified · ${displayTime(verifiedAt)}` : 'Not verified yet'}</p>
          {locationCheck?.status === 'verified' && <p className="status-good">Location verified · {displayTime(locationCheck.verifiedAt || new Date().toISOString())}</p>}
          {locationCheck?.status === 'outside' && <p role="status">You are about {locationCheck.distanceM} m from the saved location.</p>}
          {locationCheck?.status === 'missing' && <p role="status">Allow location access in your browser to verify you are at the plant.</p>}
          {locationCheck?.status === 'denied' && <p role="status">Allow location access in your browser settings, then try again.</p>}
        </div>
        <div className="page-actions">
          <button type="button" className="secondary-button" disabled={saving} onClick={saveDetails}>
            Save plant details
          </button>
          <button type="button" className="primary-button" disabled={saving} onClick={verifyLocation}>
            {saving ? 'Checking…' : "Verify I'm at the plant"}
          </button>
        </div>
      </div>
      <p className="next-step"><Link to="/app/zones">Next: set up your zones →</Link></p>
    </section>
  );
}
