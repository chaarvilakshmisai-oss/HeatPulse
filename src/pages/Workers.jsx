import { useEffect, useState } from 'react';
import { getSite, getWorkers, getZones, saveWorker, deactivateWorker } from '../lib/api.js';
import { validateWorker } from '../lib/validation.js';

const EMPTY_WORKER = { name: '', zoneId: '', shiftStart: '07:00', shiftEnd: '15:00', active: true };

export default function Workers() {
  const [site, setSite] = useState(null);
  const [zones, setZones] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [form, setForm] = useState(EMPTY_WORKER);
  const [editingId, setEditingId] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);

  async function refresh() {
    const [siteResult, zoneResult, workerResult] = await Promise.all([getSite(), getZones(), getWorkers()]);
    setSite(siteResult);
    setZones(zoneResult);
    setWorkers(workerResult);
    if (!editingId && !form.zoneId && zoneResult.length) {
      setForm((current) => ({ ...current, zoneId: zoneResult[0].id }));
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    Promise.all([getSite(), getZones(), getWorkers()])
      .then(([siteResult, zoneResult, workerResult]) => {
        if (!active) return;
        setSite(siteResult);
        setZones(zoneResult);
        setWorkers(workerResult);
        if (zoneResult.length) setForm((current) => ({ ...current, zoneId: zoneResult[0].id }));
      })
      .catch((requestError) => {
        if (active) {
          setLoadError(requestError.message || 'Unable to load workers.');
          setError(requestError.message || 'Unable to load workers.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  function edit(worker) {
    setEditingId(worker.workerId);
    setForm({
      name: worker.name,
      zoneId: worker.zoneId,
      shiftStart: worker.shiftStart,
      shiftEnd: worker.shiftEnd,
      active: worker.active,
    });
    setErrors({});
    setError('');
    setSuccess('');
  }

  function reset() {
    setEditingId('');
    setForm({ ...EMPTY_WORKER, zoneId: zones[0]?.id || '' });
    setErrors({});
  }

  async function submit(event) {
    event.preventDefault();
    const nextErrors = validateWorker(form);
    setErrors(nextErrors);
    setError('');
    setSuccess('');
    if (Object.keys(nextErrors).length) {
      setError('Fix the highlighted worker details before saving.');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveWorker({ ...form, ...(editingId ? { workerId: editingId } : {}) });
      await refresh();
      setSuccess(editingId ? 'Worker details updated.' : `Worker added. ID: ${saved.workerId}`);
      reset();
    } catch (saveError) {
      setError(saveError.message || 'Unable to save this worker.');
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(worker) {
    if (!window.confirm(`Deactivate ${worker.name}? Their ID will no longer work on the QR page.`)) return;
    setError('');
    setSuccess('');
    try {
      await deactivateWorker(worker.workerId);
      await refresh();
      if (editingId === worker.workerId) reset();
      setSuccess(`${worker.name} was deactivated.`);
    } catch (requestError) {
      setError(requestError.message || 'Unable to deactivate this worker.');
    }
  }

  async function copyId(workerId) {
    try {
      await navigator.clipboard.writeText(workerId);
      setSuccess(`Copied ${workerId}.`);
      setError('');
    } catch (copyError) {
      setError(copyError.message || 'Unable to copy the worker ID. Select and copy it manually.');
    }
  }

  if (loading) return <div className="card page-state" role="status">Loading workers…</div>;

  return (
    <section className="manager-page">
      <header className="page-heading">
        <div>
          <h1>Workers</h1>
          <p>Assign each worker a zone and recurring shift in {site?.timeZone || 'the plant time zone'}.</p>
        </div>
      </header>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loadError && <button type="button" className="secondary-button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Retry loading workers</button>}
      {success && <p className="success-message" role="status">{success}</p>}
      <form className="card form-card" onSubmit={submit}>
        <h2>{editingId ? `Edit ${editingId}` : 'Add worker'}</h2>
        <div className="form-grid">
          <label>
            Worker name
            <input maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </label>
          <label>
            Zone
            <select value={form.zoneId} onChange={(event) => setForm({ ...form, zoneId: event.target.value })}>
              <option value="">Choose a zone</option>
              {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
            </select>
            {errors.zoneId && <span className="field-error">{errors.zoneId}</span>}
          </label>
          <label>
            Shift starts
            <input type="time" value={form.shiftStart} onChange={(event) => setForm({ ...form, shiftStart: event.target.value })} />
            {errors.shiftStart && <span className="field-error">{errors.shiftStart}</span>}
          </label>
          <label>
            Shift ends
            <input type="time" value={form.shiftEnd} onChange={(event) => setForm({ ...form, shiftEnd: event.target.value })} />
            {errors.shiftEnd && <span className="field-error">{errors.shiftEnd}</span>}
          </label>
        </div>
        {editingId && (
          <label className="toggle-row">
            <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
            <span><strong>Worker is active</strong><small>Inactive workers cannot access the QR timetable.</small></span>
          </label>
        )}
        <div className="page-actions">
          {editingId && <button type="button" className="secondary-button" onClick={reset}>Cancel</button>}
          <button type="submit" className="primary-button" disabled={saving || !zones.length}>
            {saving ? 'Saving…' : editingId ? 'Save worker' : 'Add worker'}
          </button>
        </div>
      </form>
      {!zones.length ? (
        <div className="card empty-state">Add and save at least one zone before creating workers.</div>
      ) : !workers.length ? (
        <div className="card empty-state">No workers have been added yet.</div>
      ) : (
        <div className="card table-wrapper">
          <table className="reports-table workers-table">
            <caption className="visually-hidden">Plant workers and shift assignments</caption>
            <thead>
              <tr><th>Name</th><th>Worker ID</th><th>Zone</th><th>Shift</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {workers.map((worker) => (
                <tr key={worker.workerId}>
                  <td>{worker.name}</td>
                  <td><code>{worker.workerId}</code></td>
                  <td>{zones.find((zone) => zone.id === worker.zoneId)?.name || worker.zoneId}</td>
                  <td>{worker.shiftStart}–{worker.shiftEnd}</td>
                  <td>{worker.active ? 'Active' : 'Inactive'}</td>
                  <td>
                    <div className="button-row">
                      <button type="button" className="secondary-button" onClick={() => copyId(worker.workerId)}>Copy ID</button>
                      <button type="button" className="secondary-button" onClick={() => edit(worker)}>Edit</button>
                      {worker.active && <button type="button" className="secondary-button" onClick={() => deactivate(worker)}>Deactivate</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
