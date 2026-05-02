export function ReadingCard({ reading }) {
  if (!reading) return null;
  const station = reading.station;
  return (
    <article
      className="theme-card floating-lift fade-up"
      style={{ padding: "1rem" }}
    >
      <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem", color: "var(--ink)" }}>
        {station ? station.name : `Station #${reading.station_id}`}
      </h3>
      <dl
        style={{
          margin: 0,
          display: "grid",
          gap: "0.25rem 1rem",
          fontSize: "0.9rem",
          gridTemplateColumns: "auto 1fr",
        }}
      >
        <dt style={{ color: "var(--ink-soft)" }}>PM2.5</dt>
        <dd style={{ margin: 0 }}>{reading.pm25}</dd>
        <dt style={{ color: "var(--ink-soft)" }}>PM10</dt>
        <dd style={{ margin: 0 }}>{reading.pm10}</dd>
        <dt style={{ color: "var(--ink-soft)" }}>AQI</dt>
        <dd style={{ margin: 0 }}>{reading.final_aqi}</dd>
        <dt style={{ color: "var(--ink-soft)" }}>Date</dt>
        <dd style={{ margin: 0 }}>{reading.date}</dd>
      </dl>
    </article>
  );
}
