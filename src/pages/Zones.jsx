import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getSite, saveSite } from '../lib/api.js';
import { estimateExposure } from '../lib/exposure.js';
import { validateZone } from '../lib/validation.js';

const SAMPLE_ZONES = [
  ['Furnace bay', 'process', 'metal', 'poor', 40],
  ['Forging', 'process', 'metal', 'average', 35],
  ['Welding', 'process', 'metal', 'poor', 25],
  ['Paint booth', 'indoor', 'concrete', 'poor', 20],
  ['Press shop', 'process', 'metal', 'average', 50],
  ['Assembly A', 'indoor', 'metal', 'good', 90],
  ['Assembly B', 'indoor', 'concrete', 'good', 75],
  ['Packing', 'indoor', 'metal', 'average', 35],
  ['Loading dock', 'outdoor', 'open', 'good', 20],
  ['Warehouse', 'indoor', 'metal', 'poor', 45],
  ['Canteen', 'cooled', 'concrete', 'good', 30],
  ['Office', 'cooled', 'concrete', 'good', 18],
];

const EMPTY_ZONE = { name: '', kind: 'indoor', roof: 'metal', ventilation: 'average', headcount: 0 };

function localKey() {
  return globalThis.crypto?.randomUUID?.() || `zone-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function prepareZones(zones) {
  return zones.map((zone, index) => ({
    ...zone,
    headcount: Number(zone.headcount) || 0,
    localKey: zone.localKey || zone.id || `loaded-${index}`,
  }));
}

function ZoneFields({ zone, errors, onChange }) {
  const exposure = estimateExposure(zone);
  return (
    <>
      <div className="form-grid">
        <label>
          Zone name
          <input maxLength={40} value={zone.name} onChange={(event) => onChange('name', event.target.value)} />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </label>
        <label>
          Type
          <select value={zone.kind} onChange={(event) => onChange('kind', event.target.value)}>
            <option value="process">Process heat</option>
            <option value="indoor">Indoor</option>
            <option value="outdoor">Outdoor</option>
            <option value="cooled">Air-conditioned</option>
          </select>
          {errors.kind && <span className="field-error">{errors.kind}</span>}
        </label>
        <label>
          Roof
          <select value={zone.roof} onChange={(event) => onChange('roof', event.target.value)}>
            <option value="metal">Metal</option>
            <option value="concrete">Concrete</option>
            <option value="open">Open</option>
          </select>
          {errors.roof && <span className="field-error">{errors.roof}</span>}
        </label>
        <label>
          Ventilation
          <select value={zone.ventilation} onChange={(event) => onChange('ventilation', event.target.value)}>
            <option value="poor">Poor</option>
            <option value="average">Average</option>
            <option value="good">Good</option>
          </select>
          {errors.ventilation && <span className="field-error">{errors.ventilation}</span>}
        </label>
        <label>
          Workers
          <input type="number" min="0" max="5000" step="1" value={zone.headcount} onChange={(event) => onChange('headcount', event.target.value)} />
          {errors.headcount && <span className="field-error">{errors.headcount}</span>}
        </label>
      </div>
      <p className="exposure-note">Estimated heat exposure: {(exposure * 100).toFixed(0)} / 100 · placeholder estimate</p>
    </>
  );
}

export default function Zones() {
  const [site, setSite] = useState(null);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dirty, setDirty] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [validation, setValidation] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    getSite()
      .then((result) => {
        if (!active) return;
        setSite(result);
        setZones(prepareZones(result?.zones || []));
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Unable to load zones.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    function warnBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = '';
    }
    function guardNavigation(event) {
      const target = event.target;
      const link = target instanceof Element ? target.closest('a[href]') : null;
      if (!link || link.origin !== window.location.origin || link.pathname === window.location.pathname) return;
      if (!window.confirm('You have unsaved zone changes. Leave without saving?')) {
        event.preventDefault();
        event.stopPropagation();
      } else {
        setDirty(false);
      }
    }
    window.addEventListener('beforeunload', warnBeforeUnload);
    document.addEventListener('click', guardNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload);
      document.removeEventListener('click', guardNavigation, true);
    };
  }, [dirty]);

  function updateZone(localId, field, value) {
    setZones((current) => current.map((zone) => zone.localKey === localId ? { ...zone, [field]: value } : zone));
    setDirty(true);
    setSuccess('');
    setValidation((current) => ({ ...current, [localId]: {} }));
  }

  function addZone() {
    const zone = { ...EMPTY_ZONE, localKey: localKey() };
    setZones((current) => [...current, zone]);
    setEditingKey(zone.localKey);
    setDirty(true);
    setSuccess('');
  }

  function removeZone(localId) {
    setZones((current) => current.filter((zone) => zone.localKey !== localId));
    setDirty(true);
    setSuccess('');
  }

  function validateAll() {
    const nextErrors = {};
    zones.forEach((zone) => {
      const errors = validateZone(zone);
      if (Object.keys(errors).length) nextErrors[zone.localKey] = errors;
    });
    setValidation(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function saveChanges() {
    setError('');
    setSuccess('');
    if (!validateAll()) {
      setError('Fix the highlighted zone fields before saving.');
      return;
    }
    if (!site) {
      setError('Save your plant details before saving zones.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: site.name,
        lat: Number(site.lat),
        lon: Number(site.lon),
        radiusM: Number(site.radiusM),
        requireLocation: site.requireLocation,
        zones: zones.map(({ localKey: key, ...zone }) => ({
          ...zone,
          headcount: Number(zone.headcount),
          exposure: estimateExposure(zone),
        })),
      };
      const result = await saveSite(payload);
      const savedSite = result.site || { ...site, zones: payload.zones };
      setSite(savedSite);
      const savedZones = prepareZones(savedSite.zones || payload.zones);
      setZones(savedZones);
      setEditingKey(null);
      setDirty(false);
      setSuccess('Zone changes saved.');
      if (window.history.state?.usr?.setupRequired) navigate('/app/zones', { replace: true, state: null });
    } catch (saveError) {
      setError(saveError.message || 'Unable to save zone changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function loadSamplePlant() {
    const timestamp = Date.now();
    setZones(SAMPLE_ZONES.map(([name, kind, roof, ventilation, headcount], index) => ({
      ...EMPTY_ZONE,
      name,
      kind,
      roof,
      ventilation,
      headcount,
      localKey: `sample-${timestamp}-${index}`,
    })));
    setEditingKey(null);
    setDirty(true);
    setValidation({});
    setSuccess('');
    setError('');
  }

  if (loading) return <div className="card page-state" role="status">Loading zones…</div>;
  if (error && !site && !zones.length) {
    return <section className="card page-state"><p role="alert">{error}</p><Link to="/app/site">Set up your plant</Link></section>;
  }

  return (
    <div className="manager-page">
      <header className="page-heading">
        <div>
          <h1>Zones</h1>
          <p>Describe the conditions in each work area.</p>
        </div>
        <button type="button" className="primary-button" onClick={addZone}>Add zone</button>
      </header>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="success-message" role="status">{success}</p>}
      <section className="zone-editor-list" aria-label="Plant zones">
        {zones.map((zone) => {
          const isEditing = editingKey === zone.localKey;
          const zoneErrors = validation[zone.localKey] || {};
          return (
            <article className="card zone-editor-card" key={zone.localKey}>
              <div className="zone-editor-heading">
                <div>
                  <h2>{zone.name || 'New zone'}</h2>
                  <p>{zone.kind} · Estimated heat exposure: {(estimateExposure(zone) * 100).toFixed(0)} / 100</p>
                </div>
                <div className="button-row">
                  <button type="button" className="secondary-button" onClick={() => setEditingKey(isEditing ? null : zone.localKey)}>
                    {isEditing ? 'Close editor' : 'Edit'}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => removeZone(zone.localKey)}>Delete</button>
                </div>
              </div>
              {isEditing && (
                <ZoneFields
                  zone={zone}
                  errors={zoneErrors}
                  onChange={(field, value) => updateZone(zone.localKey, field, value)}
                />
              )}
            </article>
          );
        })}
      </section>
      {!zones.length && <div className="card empty-state">No zones yet. Add a zone or load the sample plant.</div>}
      <div className="page-actions">
        <button type="button" className="secondary-button" onClick={loadSamplePlant}>Load sample plant</button>
        <button type="button" className="primary-button" onClick={saveChanges} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
