import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  getAlertSettings,
  getPlantAlerts,
  getZones,
  saveAlertSettings,
  sendTestAlert,
} from '../lib/api.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function deliverySummary(alert) {
  if (!alert.deliveries?.length) return 'No deliveries recorded';
  return alert.deliveries.map((delivery) => `${delivery.channel}: ${delivery.status}`).join(', ');
}

export default function Alerts() {
  const { plantId } = useParams();
  const [settings, setSettings] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [emailInput, setEmailInput] = useState('');
  const [emailError, setEmailError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testLevel, setTestLevel] = useState('high');
  const [testZoneId, setTestZoneId] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    Promise.all([
      getAlertSettings(plantId),
      getPlantAlerts(plantId),
      getZones(plantId),
    ]).then(([settingsResult, alertResult, zoneResult]) => {
      if (!active) return;
      setSettings(settingsResult);
      setAlerts(alertResult);
      setZones(zoneResult);
      setTestZoneId((current) => current || zoneResult[0]?.id || '');
    }).catch((requestError) => {
      if (active) setLoadError(requestError.message || 'Unable to load alert settings.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [loadAttempt, plantId]);

  function updateSetting(field, value) {
    setSettings((current) => ({ ...current, [field]: value }));
    setError('');
    setSuccess('');
  }

  function addRecipient(event) {
    event.preventDefault();
    const email = emailInput.trim().toLowerCase();
    if (!EMAIL.test(email)) {
      setEmailError('Enter a valid email address.');
      return;
    }
    if (settings.managerRecipients.includes(email)) {
      setEmailError('That email address is already on the list.');
      return;
    }
    updateSetting('managerRecipients', [...settings.managerRecipients, email]);
    setEmailInput('');
    setEmailError('');
  }

  function removeRecipient(email) {
    updateSetting('managerRecipients', settings.managerRecipients.filter((recipient) => recipient !== email));
  }

  async function save(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const next = { ...settings };
      const start = settings.quietHours?.start || '';
      const end = settings.quietHours?.end || '';
      if (start || end) {
        if (!start || !end || start === end) {
          setError('Choose different start and end times for quiet hours, or leave both empty.');
          return;
        }
        next.quietHours = { start, end };
      } else {
        delete next.quietHours;
      }
      const result = await saveAlertSettings(plantId, next);
      setSettings(result);
      setSuccess('Alert settings saved.');
    } catch (saveError) {
      setError(saveError.message || 'Unable to save alert settings.');
    } finally {
      setSaving(false);
    }
  }

  async function testAlert() {
    setError('');
    setSuccess('');
    setTesting(true);
    try {
      const result = await sendTestAlert(plantId, testLevel, testZoneId);
      setAlerts((current) => [result.alert, ...current]);
      const failed = result.deliveries.filter((delivery) => delivery.status === 'failed');
      if (failed.length) {
        setError(`Test alert was created, but ${failed.length} delivery${failed.length === 1 ? '' : 'ies'} failed. Check the provider configuration.`);
      } else if (result.mocked) {
        setSuccess('Demo preview saved. No notification was sent.');
      } else {
        setSuccess('Test alert sent. Check the configured delivery channel.');
      }
    } catch (testError) {
      setError(testError.message || 'Unable to send a test alert.');
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <div className="card page-state" role="status">Loading alert settings…</div>;
  if (loadError) {
    return (
      <section className="card page-state">
        <p role="alert">{loadError}</p>
        <button type="button" className="secondary-button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Retry</button>
      </section>
    );
  }

  return (
    <section className="manager-page alerts-page">
      <header className="page-heading">
        <div>
          <h1>Automatic heat alerts</h1>
          <p>Configure notifications and review this plant’s alert history.</p>
        </div>
      </header>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="success-message" role="status">{success}</p>}

      <form className="card form-card" onSubmit={save}>
        <h2>Alert settings</h2>
        <label className="toggle-row">
          <input type="checkbox" checked={settings.enabled} onChange={(event) => updateSetting('enabled', event.target.checked)} />
          <span><strong>Enable automatic alerts</strong><small>Heat scores are guidance, not medical advice.</small></span>
        </label>
        <fieldset className="alert-fieldset">
          <legend>Score thresholds</legend>
          <p className="exposure-note">Placeholder thresholds; set these with an occupational health professional.</p>
          <div className="form-grid">
            {['watch', 'high', 'critical'].map((level) => (
              <label key={level}>
                {level[0].toUpperCase() + level.slice(1)} at
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={settings.thresholds[level]}
                  onChange={(event) => updateSetting('thresholds', {
                    ...settings.thresholds,
                    [level]: Number(event.target.value),
                  })}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <div className="form-grid">
          <label>
            Cooldown (minutes)
            <input
              type="number"
              min="1"
              max="1440"
              value={settings.cooldownMinutes}
              onChange={(event) => updateSetting('cooldownMinutes', Number(event.target.value))}
            />
          </label>
          <label>
            Escalate after (minutes)
            <input
              type="number"
              min="1"
              max="1440"
              value={settings.escalateAfterMinutes}
              onChange={(event) => updateSetting('escalateAfterMinutes', Number(event.target.value))}
            />
          </label>
          <label>
            Quiet hours start (optional)
            <input
              type="time"
              value={settings.quietHours?.start || ''}
              onChange={(event) => updateSetting('quietHours', {
                ...settings.quietHours,
                start: event.target.value,
                end: settings.quietHours?.end || '',
              })}
            />
          </label>
          <label>
            Quiet hours end (optional)
            <input
              type="time"
              value={settings.quietHours?.end || ''}
              onChange={(event) => updateSetting('quietHours', {
                ...settings.quietHours,
                start: settings.quietHours?.start || '',
                end: event.target.value,
              })}
            />
          </label>
        </div>

        <fieldset className="alert-fieldset">
          <legend>Manager email recipients</legend>
          <div className="button-row">
            <label className="recipient-input">
              Add email
              <input
                type="email"
                value={emailInput}
                onChange={(event) => {
                  setEmailInput(event.target.value);
                  setEmailError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addRecipient(event);
                }}
                aria-describedby={emailError ? 'alert-email-error' : undefined}
              />
            </label>
            <button type="button" className="secondary-button" onClick={addRecipient}>Add recipient</button>
          </div>
          {emailError && <p id="alert-email-error" className="field-error" role="alert">{emailError}</p>}
          {settings.managerRecipients.length ? (
            <ul className="recipient-list">
              {settings.managerRecipients.map((email) => (
                <li key={email}>
                  <span>{email}</span>
                  <button type="button" className="secondary-button" aria-label={`Remove ${email}`} onClick={() => removeRecipient(email)}>Remove</button>
                </li>
              ))}
            </ul>
          ) : <p className="exposure-note">Add at least one recipient to receive manager alerts.</p>}
        </fieldset>

        <label className="toggle-row">
          <input type="checkbox" checked={settings.workerAlertsEnabled} onChange={(event) => updateSetting('workerAlertsEnabled', event.target.checked)} />
          <span><strong>Show in-app worker alerts</strong><small>Workers see high and critical alerts on their shift page, refreshed every 60 seconds.</small></span>
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={settings.smsEnabled} onChange={(event) => updateSetting('smsEnabled', event.target.checked)} />
          <span><strong>Enable worker SMS alerts</strong><small>SMS is sent only when in-app worker alerts are enabled and the worker has explicitly consented. SMS defaults off.</small></span>
        </label>
        <div className="page-actions">
          <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save alert settings'}</button>
        </div>
      </form>

      <section className="card form-card">
        <h2>Send test alert</h2>
        <p className="exposure-note">A test email checks your selected delivery provider without changing the active zone risk.</p>
        <div className="form-grid">
          <label>
            Alert level
            <select value={testLevel} onChange={(event) => setTestLevel(event.target.value)}>
              <option value="watch">Watch</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label>
            Zone
            <select value={testZoneId} onChange={(event) => setTestZoneId(event.target.value)}>
              {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
            </select>
          </label>
        </div>
        <div className="page-actions">
          <button type="button" className="secondary-button" onClick={testAlert} disabled={testing || !zones.length}>
            {testing ? 'Sending…' : 'Send test alert'}
          </button>
        </div>
      </section>

      <section className="card alert-history">
        <h2>Alert history</h2>
        {!alerts.length ? (
          <div className="empty-state">No alerts have been recorded yet.</div>
        ) : (
          <div className="table-wrapper">
            <table className="reports-table alerts-table">
              <caption className="visually-hidden">Heat alert delivery and acknowledgement history</caption>
              <thead>
                <tr><th>Time</th><th>Zone</th><th>Level</th><th>Score</th><th>Delivery status</th><th>Acknowledged by</th></tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.alertId}>
                    <td>{new Date(alert.createdAt).toLocaleString()}</td>
                    <td>{zones.find((zone) => zone.id === alert.zoneId)?.name || alert.zoneName || alert.zoneId}{alert.test && <small className="alert-test-label"> · test</small>}</td>
                    <td><span className={`alert-level level-${alert.level}`}>{alert.level}</span></td>
                    <td>{alert.score}</td>
                    <td>{deliverySummary(alert)}</td>
                    <td>{alert.acknowledgedBy || (alert.acknowledgedAt ? 'Acknowledged' : 'Not acknowledged')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
