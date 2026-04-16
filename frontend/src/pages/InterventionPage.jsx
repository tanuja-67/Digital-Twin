import { useEffect, useState } from "react";
import { fetchStations, simulateIntervention } from "../services/api.js";

const interventions = ["green_wall", "green_belt", "scrubbers"];

export function InterventionPage() {
  const [stations, setStations] = useState([]);
  const [stationName, setStationName] = useState("");
  const [intervention, setIntervention] = useState(interventions[0]);
  const [result, setResult] = useState(null);
  const [loadingStations, setLoadingStations] = useState(true);
  const [loadingSimulate, setLoadingSimulate] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadStations() {
      try {
        setLoadingStations(true);
        setError(null);
        const data = await fetchStations();
        if (!mounted) return;
        setStations(data);
        if (data.length > 0) {
          setStationName(data[0].name);
        }
      } catch (e) {
        if (mounted) setError(e.message || "Failed to load stations");
      } finally {
        if (mounted) setLoadingStations(false);
      }
    }

    loadStations();
    return () => {
      mounted = false;
    };
  }, []);

  const onSimulate = async () => {
    if (!stationName) return;
    try {
      setLoadingSimulate(true);
      setError(null);
      const data = await simulateIntervention(stationName, intervention);
      setResult(data);
    } catch (e) {
      setError(e.message || "Simulation failed");
    } finally {
      setLoadingSimulate(false);
    }
  };

  return (
    <section style={{ display: "grid", gap: "1rem" }}>
      <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Intervention Simulation</h2>

      {loadingStations && <p style={{ margin: 0, color: "#475569" }}>Loading stations...</p>}
      {error && <p style={{ margin: 0, color: "#b91c1c" }}>{error}</p>}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "end",
          padding: "1rem",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          background: "#fff",
        }}
      >
        <label style={{ display: "grid", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.9rem", color: "#334155" }}>Station</span>
          <select
            value={stationName}
            onChange={(e) => setStationName(e.target.value)}
            disabled={loadingStations || stations.length === 0}
            style={{ minWidth: 240, padding: "0.45rem 0.5rem" }}
          >
            {stations.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.9rem", color: "#334155" }}>Intervention</span>
          <select
            value={intervention}
            onChange={(e) => setIntervention(e.target.value)}
            style={{ minWidth: 180, padding: "0.45rem 0.5rem" }}
          >
            {interventions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={onSimulate}
          disabled={loadingStations || loadingSimulate || !stationName}
          style={{ padding: "0.5rem 0.9rem" }}
        >
          {loadingSimulate ? "Simulating..." : "Simulate"}
        </button>
      </div>

      {result && (
        <div
          style={{
            padding: "1rem",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            background: "#fff",
            display: "grid",
            gap: "0.35rem",
            fontSize: "0.95rem",
          }}
        >
          <div>
            <strong>Station:</strong> {result.station_name}
          </div>
          <div>
            <strong>Intervention:</strong> {result.intervention}
          </div>
          <div>
            <strong>Current AQI:</strong> {result.current_aqi}
          </div>
          <div>
            <strong>Predicted AQI:</strong> {result.predicted_aqi}
          </div>
          <div>
            <strong>Improvement %:</strong> {result.improvement}
          </div>
        </div>
      )}
    </section>
  );
}
