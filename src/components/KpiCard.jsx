export default function KpiCard({ label, value }) {
  return (
    <section className="card kpi-card">
      <h2 className="eyebrow">{label}</h2>
      <p className="kpi-value">{value}</p>
    </section>
  );
}
