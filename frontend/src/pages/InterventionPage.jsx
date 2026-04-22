import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchLiveData, simulateIntervention } from "../services/api.js";

const INTERVENTION_OPTIONS = [
  { key: "industrialScrubbers", label: "Industrial Scrubbers" },
  { key: "roadsidePurifiers", label: "Roadside Purifiers" },
  { key: "biofilters", label: "Biofilters" },
  { key: "verticalGardens", label: "Vertical Gardens" },
];

function num(value) {
  return value == null ? "-" : Number(value).toFixed(2);
}

function Card({ children, style }) {
  return (
    <div
      style={{
        background: "#10263f",
        border: "1px solid #204a72",
        borderRadius: 14,
        padding: "16px",
        boxShadow: "0 14px 28px rgba(2, 8, 20, 0.35)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function InterventionPage() {
  const [areas, setAreas] = useState([]);
  const [stationName, setStationName] = useState("");
  const [selectedInterventions, setSelectedInterventions] = useState([]);
  const [result, setResult] = useState(null);
  const [loadingStations, setLoadingStations] = useState(true);
  const [loadingSimulate, setLoadingSimulate] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        setLoadingStations(true);
        setError(null);
        const liveRows = await fetchLiveData(false);
        const areasData = (Array.isArray(liveRows) ? liveRows : []).map((row) => ({
          name: row.area,
          city: row.city || "Hyderabad",
        }));
        if (!mounted) return;
        setAreas(areasData);
        if (areasData.length > 0) {
          setStationName(areasData[0].name);
        }
      } catch (e) {
        if (mounted) setError(e.message || "Failed to load simulation data");
      } finally {
        if (mounted) setLoadingStations(false);
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, []);

  const onToggleIntervention = (key) => {
    setSelectedInterventions((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
    );
  };

  const onSimulate = async () => {
    if (!stationName) return;
    try {
      setLoadingSimulate(true);
      setError(null);
      const data = await simulateIntervention(stationName, selectedInterventions);
      setResult(data);
    } catch (e) {
      setError(e.message || "Simulation failed");
    } finally {
      setLoadingSimulate(false);
    }
  };

  const aqiBarData = useMemo(
    () => [
      { name: "Before", value: Number(result?.current_aqi || 0) },
      { name: "After", value: Number(result?.predicted_aqi || 0) },
    ],
    [result]
  );

  return (
    <section style={{ display: "grid", gap: "14px" }}>
      <Card>
        <div style={{ display: "grid", gap: "10px" }}>
          <h2 style={{ margin: 0, color: "#f5fbff", fontSize: "1.15rem" }}>
            Live Area AQI Simulation Lab
          </h2>
          <p style={{ margin: 0, color: "#a9c6e3", fontSize: "0.9rem" }}>
            Select one live area, choose multiple interventions, and run simulation from latest live AQI.
          </p>
        </div>
      </Card>

      {loadingStations && <div style={{ color: "#b9d2ea" }}>Loading live areas...</div>}
      {error && <div style={{ color: "#ff9e9e" }}>{error}</div>}

      <Card>
        <div style={{ display: "grid", gap: "12px" }}>
          <div style={{ display: "grid", gap: "6px" }}>
            <label style={{ color: "#d9ebff", fontWeight: 600 }}>Live Area</label>
            <select
              value={stationName}
              onChange={(e) => setStationName(e.target.value)}
              disabled={loadingStations || areas.length === 0}
              style={{
                background: "#0b1d31",
                color: "#f4faff",
                border: "1px solid #2f5c84",
                borderRadius: 10,
                padding: "10px",
                maxWidth: 320,
              }}
            >
              {areas.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}{s.city ? ` (${s.city})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ color: "#d9ebff", fontWeight: 600 }}>Interventions (multi-select)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "8px" }}>
              {INTERVENTION_OPTIONS.map((item) => {
                const active = selectedInterventions.includes(item.key);
                return (
                  <label
                    key={item.key}
                    style={{
                      border: active ? "1px solid #3ddc97" : "1px solid #2f5c84",
                      borderRadius: 12,
                      padding: "10px 12px",
                      background: active ? "#123a34" : "#0b1d31",
                      color: active ? "#eafff6" : "#d3e6f9",
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => onToggleIntervention(item.key)}
                    />
                    <span>{item.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={onSimulate}
            disabled={loadingStations || loadingSimulate || !stationName}
            style={{
              border: "none",
              borderRadius: 12,
              padding: "12px 16px",
              background: "linear-gradient(90deg, #2fd27f, #1eb3ff)",
              color: "#062034",
              fontWeight: 800,
              width: "fit-content",
              cursor: "pointer",
            }}
          >
            {loadingSimulate ? "Running Simulation..." : "Run Simulation"}
          </button>
        </div>
      </Card>

      {result && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
            <Card>
              <div style={{ color: "#a6c4e2", fontSize: "0.82rem" }}>Area</div>
              <div style={{ color: "#f5fbff", fontSize: "1.1rem", fontWeight: 700 }}>{result.station_name}</div>
            </Card>
            <Card>
              <div style={{ color: "#a6c4e2", fontSize: "0.82rem" }}>City / Zone</div>
              <div style={{ color: "#f5fbff", fontSize: "1.1rem", fontWeight: 700 }}>{result.zone || "N/A"}</div>
            </Card>
            <Card>
              <div style={{ color: "#a6c4e2", fontSize: "0.82rem" }}>Current AQI</div>
              <div style={{ color: "#ffcf66", fontSize: "1.2rem", fontWeight: 800 }}>{num(result.current_aqi)}</div>
            </Card>
            <Card>
              <div style={{ color: "#a6c4e2", fontSize: "0.82rem" }}>Predicted AQI</div>
              <div style={{ color: "#56f0a5", fontSize: "1.2rem", fontWeight: 800 }}>{num(result.predicted_aqi)}</div>
            </Card>
            <Card>
              <div style={{ color: "#a6c4e2", fontSize: "0.82rem" }}>Improvement</div>
              <div style={{ color: "#49e48f", fontSize: "1.2rem", fontWeight: 800 }}>{num(result.improvement)}%</div>
            </Card>
          </div>

          <Card>
            <h3 style={{ margin: "0 0 10px", color: "#f3f9ff", fontSize: "1rem" }}>Applied Interventions</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {(result.applied_interventions || []).map((name) => (
                <span
                  key={name}
                  style={{
                    background: "#14395c",
                    border: "1px solid #2d5f8a",
                    borderRadius: 999,
                    padding: "5px 10px",
                    color: "#d9edff",
                    fontSize: "0.85rem",
                  }}
                >
                  {name}
                </span>
              ))}
            </div>
          </Card>

          <Card>
            <h3 style={{ margin: "0 0 10px", color: "#f3f9ff", fontSize: "1rem" }}>Smart Recommendations</h3>
            <div style={{ display: "grid", gap: "8px" }}>
              {(result.recommended || []).length === 0 && (
                <div style={{ color: "#b6c9df", fontSize: "0.9rem" }}>
                  No recommendations available.
                </div>
              )}
              {(result.recommended || []).map((rec, idx) => {
                const rank = idx === 0 ? "Best Intervention" : idx === 1 ? "Second Best" : "Third Best";
                return (
                  <div
                    key={`${rec.name}-${idx}`}
                    style={{
                      border: "1px solid #2f5d84",
                      borderRadius: 10,
                      padding: "10px 12px",
                      background: "#0f2942",
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div style={{ color: "#9ec5e8", fontSize: "0.8rem", fontWeight: 700 }}>{rank}</div>
                    <div style={{ color: "#f5fbff", fontSize: "0.95rem", fontWeight: 700 }}>{rec.name}</div>
                    <div style={{ color: "#9fd7ff", fontSize: "0.88rem" }}>
                      AQI: {num(rec.predicted_aqi)}
                      {rec.improvement != null ? ` | Improvement: ${num(rec.improvement)}%` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "12px" }}>
            <Card>
              <h3 style={{ margin: "0 0 12px", color: "#f3f9ff", fontSize: "1rem" }}>AQI Comparison</h3>
              <div style={{ width: "100%", height: 250 }}>
                <ResponsiveContainer>
                  <BarChart data={aqiBarData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f4261" />
                    <XAxis dataKey="name" stroke="#b8d1e8" />
                    <YAxis stroke="#b8d1e8" />
                    <Tooltip />
                    <Bar dataKey="value" fill="#45c4ff" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card>
            <h3 style={{ margin: "0 0 12px", color: "#f3f9ff", fontSize: "1rem" }}>Pollutant Impact Table</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", color: "#d8ebff" }}>
                <thead>
                  <tr style={{ background: "#0d2036" }}>
                    <th style={thStyle}>Pollutant</th>
                    <th style={thStyle}>Before</th>
                    <th style={thStyle}>After</th>
                    <th style={thStyle}>Reduction %</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.pollutant_changes || []).map((row) => (
                    <tr key={row.pollutant} style={{ borderTop: "1px solid #244c6f" }}>
                      <td style={tdStyle}>{row.pollutant}</td>
                      <td style={tdStyle}>{num(row.before)}</td>
                      <td style={tdStyle}>{num(row.after)}</td>
                      <td style={{ ...tdStyle, color: "#49e48f", fontWeight: 700 }}>{num(row.reduction)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}


    </section>
  );
}

const thStyle = {
  textAlign: "left",
  padding: "10px",
  borderBottom: "1px solid #244c6f",
  fontSize: "0.82rem",
  color: "#a8c7e4",
};

const tdStyle = {
  padding: "10px",
  fontSize: "0.9rem",
};
