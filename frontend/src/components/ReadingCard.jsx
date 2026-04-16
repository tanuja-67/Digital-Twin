export function ReadingCard({ reading }) {
  if (!reading) return null;
  const station = reading.station;
  return (
    <article
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        padding: "1rem",
        background: "#fff",
      }}
    >
      <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>
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
        <dt style={{ color: "#64748b" }}>PM2.5</dt>
        <dd style={{ margin: 0 }}>{reading.pm25}</dd>
        <dt style={{ color: "#64748b" }}>PM10</dt>
        <dd style={{ margin: 0 }}>{reading.pm10}</dd>
        <dt style={{ color: "#64748b" }}>AQI</dt>
        <dd style={{ margin: 0 }}>{reading.final_aqi}</dd>
        <dt style={{ color: "#64748b" }}>Date</dt>
        <dd style={{ margin: 0 }}>{reading.date}</dd>
      </dl>
    </article>
  );
}
