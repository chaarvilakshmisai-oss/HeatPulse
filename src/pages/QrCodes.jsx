import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Link, useParams } from 'react-router-dom';
import { getSite, getZones } from '../lib/api.js';
import { buildQrUrl } from '../lib/qr.js';

export default function QrCodes() {
  const { plantId } = useParams();
  const [site, setSite] = useState(null);
  const [zones, setZones] = useState([]);
  const [codes, setCodes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    async function load() {
      try {
        const [siteResult, zoneResult] = await Promise.all([getSite(plantId), getZones(plantId)]);
        if (!active) return;
        setSite(siteResult);
        setZones(zoneResult);
        if (!siteResult?.plantId) return;
        const entries = await Promise.all(zoneResult.map(async (zone) => {
          const url = buildQrUrl(window.location.origin, siteResult.plantId, zone.id);
          const dataUrl = await QRCode.toDataURL(url, {
            width: 240,
            margin: 2,
            color: { dark: '#0B0F14', light: '#FFFFFF' },
          });
          return [zone.id, { url, dataUrl }];
        }));
        if (active) setCodes(Object.fromEntries(entries));
      } catch (loadError) {
        if (active) setError(loadError.message || 'Unable to create QR codes. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [retryCount, plantId]);

  if (loading) return <div className="card page-state" role="status">Loading QR codes…</div>;
  if (error) {
    return (
      <div className="card page-state">
        <p role="alert">{error}</p>
        <button type="button" className="secondary-button" onClick={() => setRetryCount((count) => count + 1)}>Retry</button>
      </div>
    );
  }
  if (!site?.plantId) {
    return (
      <section className="card page-state">
        <p role="alert">Save your site before creating worker QR codes.</p>
        <Link to={`/app/plants/${plantId}/site`}>Set up your plant</Link>
      </section>
    );
  }

  function download(zone) {
    const code = codes[zone.id];
    if (!code) return;
    const link = document.createElement('a');
    link.href = code.dataUrl;
    link.download = `HeatPulse-${zone.id}.png`;
    link.click();
  }

  return (
    <section className="manager-page qr-page">
      <header className="page-heading qr-tools">
        <div>
          <h1>QR codes</h1>
          <p>Each code opens the anonymous worker tap page for its zone.</p>
        </div>
        <button type="button" className="primary-button" onClick={() => window.print()} disabled={!zones.length}>Print all</button>
      </header>
      {!zones.length ? (
        <div className="card empty-state">There are no zones to make QR codes for. <Link to="/app/zones">Add zones</Link></div>
      ) : (
        <div className="qr-print-area">
          <div className="qr-print-grid">
            {zones.map((zone) => (
              <article className="card qr-card" key={zone.id}>
                <h2>{zone.name}</h2>
                {codes[zone.id] ? (
                  <>
                    <img src={codes[zone.id].dataUrl} alt={`QR code for ${zone.name}`} />
                    <button type="button" className="secondary-button qr-download" onClick={() => download(zone)}>Download PNG</button>
                  </>
                ) : <p role="alert">QR code could not be generated for this zone.</p>}
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
