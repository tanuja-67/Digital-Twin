import { useEffect, useState } from "react";
import { ReadingCard } from "../components/ReadingCard.jsx";
import { fetchHealth, fetchReadings, fetchTwinProjection } from "../services/api.js";

export function Dashboard() {
  const [stationName, setStationName] = useState("ECIL");
  const [readings, setReadings] = useState([]);
  const [projection, setProjection] = useState(null);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const load = () => {
    setError(null);
    Promise.all([
      fetchReadings(stationName),
      fetchTwinProjection(stationName, 60),
    ])
      .then(([r, t]) => {
        setReadings(r);
        setProjection(t);
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <section
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          Station name
          <input
            value={stationName}
            onChange={(e) => setStationName(e.target.value)}
            style={{ padding: "0.35rem 0.5rem" }}
          />
        </label>
        <button type="button" onClick={load} style={{ padding: "0.4rem 0.85rem" }}>
          Refresh
        </button>
        {health && (
          <span style={{ fontSize: "0.85rem", color: "#15803d" }}>API: {health.status}</span>
        )}
      </section>

      {error && (
        <p style={{ color: "#b91c1c", margin: 0 }}>
          {error} — is the Flask server running on port 5000?
        </p>
      )}

      <section>
        <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.75rem" }}>Latest readings</h2>
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {readings.length === 0 && !error && (
            <p style={{ color: "#64748b", margin: 0 }}>No readings yet for this station.</p>
          )}
          {readings.slice(0, 5).map((r, idx) => (
            <ReadingCard key={`${r.date}-${idx}`} reading={r} />
          ))}
        </div>
      </section>

      {projection && (
        <section>
          <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.75rem" }}>Latest AQI snapshot</h2>
          <pre
            style={{
              margin: 0,
              padding: "1rem",
              background: "#fff",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              overflow: "auto",
              fontSize: "0.85rem",
            }}
          >
            {JSON.stringify(projection, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
