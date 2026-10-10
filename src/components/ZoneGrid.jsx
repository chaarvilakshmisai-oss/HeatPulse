import ZoneTile from './ZoneTile.jsx';

export default function ZoneGrid({ zones, hourIndex }) {
  return (
    <div className="zone-grid">
      {zones.map((zone) => (
        <ZoneTile key={zone.id} zone={zone} hourIndex={hourIndex} />
      ))}
    </div>
  );
}
