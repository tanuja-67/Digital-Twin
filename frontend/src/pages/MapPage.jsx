import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { fetchLiveData, simulateIntervention } from "../services/api.js";

const INTERVENTIONS = [
  { key: "industrialScrubbers", label: "Industrial Scrubbers" },
  { key: "roadsidePurifiers", label: "Roadside Purifiers" },
  { key: "biofilters", label: "Biofilters" },
  { key: "verticalGardens", label: "Vertical Gardens" },
];

function getAqiColor(aqi) {
  const n = Number(aqi ?? 0);
  if (n <= 50) return "#2E7D32";
  if (n <= 100) return "#EF6C00";
  return "#C62828";
}

function getAqiLabel(aqi) {
  const n = Number(aqi ?? 0);
  if (n <= 50) return "Good";
  if (n <= 100) return "Poor";
  return "Bad";
}

function formatNum(v) {
  return v == null ? "N/A" : Number(v).toFixed(1);
}

function StatCard({ label, value, sub, color }) {
  return (
    <div
      style={{
        background: "#DCCCAC",
        border: "1px solid rgba(84,107,65,0.3)",
        borderRadius: 12,
        padding: 14,
        boxShadow: "0 8px 20px rgba(84,107,65,0.18)",
      }}
    >
      <div style={{ color: "#2F3E24", fontSize: "0.78rem" }}>{label}</div>
      <div style={{ color, fontWeight: 800, fontSize: "1.35rem" }}>{value}</div>
      {sub && <div style={{ color: "#2F3E24", fontSize: "0.8rem" }}>{sub}</div>}
    </div>
  );
}

function LegendItem({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 11, height: 11, borderRadius: 999, background: color, display: "inline-block" }} />
      <span>{label}</span>
    </div>
  );
}

export function MapPage() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState("");
  const [activeTab, setActiveTab] = useState("info");
  const [selectedInterventions, setSelectedInterventions] = useState({});
  const [simulationResults, setSimulationResults] = useState({});
  const [simulationLoading, setSimulationLoading] = useState({});

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const rows = await fetchLiveData(false);
        const parsed = (Array.isArray(rows) ? rows : []).map((row) => ({
          name: row.area,
          city: row.city || "Hyderabad",
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
          aqi: Number(row.aqi ?? 0),
        }));
        if (!active) return;
        setStations(parsed);
        if (parsed.length > 0) setSelected(parsed[0].name);
      } catch (e) {
        if (active) setError(e.message || "Failed to load map data");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  const center = useMemo(() => [17.385, 78.4867], []);

  const stats = useMemo(() => {
    if (!stations.length) {
      return { avg: null, high: null, low: null, good: 0, poor: 0, bad: 0 };
    }
    const sorted = [...stations].sort((a, b) => b.aqi - a.aqi);
    const avg = stations.reduce((sum, s) => sum + s.aqi, 0) / stations.length;
    const good = stations.filter((s) => s.aqi <= 50).length;
    const poor = stations.filter((s) => s.aqi > 50 && s.aqi <= 100).length;
    const bad = stations.length - good - poor;
    return { avg, high: sorted[0], low: sorted[sorted.length - 1], good, poor, bad };
  }, [stations]);

  const selectedStation = stations.find((s) => s.name === selected) || stations[0] || null;

  const getInterventionsFor = (stationName) => selectedInterventions[stationName] || [];

  const toggleIntervention = (stationName, interventionKey) => {
    setSelectedInterventions((prev) => {
      const current = prev[stationName] || [];
      const next = current.includes(interventionKey)
        ? current.filter((x) => x !== interventionKey)
        : [...current, interventionKey];
      return { ...prev, [stationName]: next };
    });
  };

  const runSimulation = async (stationName) => {
    const interventions = getInterventionsFor(stationName);
    setSimulationLoading((prev) => ({ ...prev, [stationName]: true }));
    try {
      const result = await simulateIntervention(stationName, interventions);
      setSimulationResults((prev) => ({ ...prev, [stationName]: result }));
    } catch (e) {
      setSimulationResults((prev) => ({
        ...prev,
        [stationName]: { error: e.message || "Simulation failed" },
      }));
    } finally {
      setSimulationLoading((prev) => ({ ...prev, [stationName]: false }));
    }
  };

  useEffect(() => {
    if (!selected) return;
    if (simulationResults[selected]) return;
    if (simulationLoading[selected]) return;
    runSimulation(selected);
  }, [selected, simulationResults, simulationLoading]);

  const panelResult = selectedStation ? simulationResults[selectedStation.name] : null;
  const panelLoading = selectedStation ? simulationLoading[selectedStation.name] : false;

  return (
    <section style={{ display: "grid", gap: 12, minHeight: "100vh" }}>
      <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#1F2A17" }}>AQI Analytics Dashboard</h2>

      {loading && <div style={{ color: "#2F3E24" }}>Loading live AQI telemetry...</div>}
      {error && <div style={{ color: "#1F2A17" }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10 }}>
        <StatCard label="Average AQI" value={formatNum(stats.avg)} sub={getAqiLabel(stats.avg)} color={getAqiColor(stats.avg)} />
        <StatCard label="Highest AQI" value={formatNum(stats.high?.aqi)} sub={stats.high?.name || "N/A"} color="#C62828" />
        <StatCard label="Lowest AQI" value={formatNum(stats.low?.aqi)} sub={stats.low?.name || "N/A"} color="#2E7D32" />
        <StatCard label="Good" value={String(stats.good)} sub="AQI <= 50" color="#2E7D32" />
        <StatCard label="Poor" value={String(stats.poor)} sub="AQI 51-100" color="#EF6C00" />
        <StatCard label="Bad" value={String(stats.bad)} sub="AQI 101+" color="#C62828" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 12, minHeight: 560 }}>
        <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(84,107,65,0.3)", position: "relative" }}>
          <MapContainer center={center} zoom={10} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {stations.map((s) => (
              <CircleMarker
                key={s.name}
                center={[s.latitude, s.longitude]}
                radius={selected === s.name ? 14 : 11}
                pathOptions={{
                  color: getAqiColor(s.aqi),
                  fillColor: getAqiColor(s.aqi),
                  fillOpacity: 0.9,
                  weight: selected === s.name ? 4 : 2,
                }}
                eventHandlers={{ click: () => setSelected(s.name) }}
              >
                <Popup>
                  <div style={{ minWidth: 200, color: "#1F2A17", display: "grid", gap: 6 }}>
                    <div style={{ fontWeight: 700 }}>{s.name}</div>
                    <div>City: {s.city}</div>
                    <div style={{ color: getAqiColor(s.aqi), fontWeight: 800 }}>
                      AQI {formatNum(s.aqi)} ({getAqiLabel(s.aqi)})
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>

          <div
            style={{
              position: "absolute",
              right: 12,
              bottom: 12,
              background: "#FFF8EC",
              color: "#1F2A17",
              border: "1px solid rgba(84,107,65,0.3)",
              borderRadius: 10,
              padding: "8px 10px",
              fontSize: "0.82rem",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>AQI Legend</div>
            <div style={{ display: "grid", gap: 4 }}>
              <LegendItem color="#2E7D32" label="Good (0-50)" />
              <LegendItem color="#EF6C00" label="Poor (51-100)" />
              <LegendItem color="#C62828" label="Bad (101+)" />
            </div>
          </div>
        </div>

        <div style={{ background: "#DCCCAC", border: "1px solid rgba(84,107,65,0.3)", borderRadius: 12, padding: 14, color: "#1F2A17", display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>
          <h3 style={{ margin: 0, fontSize: "1rem", color: "#1F2A17" }}>Simulation Area</h3>

          <div style={{ display: "flex", gap: 6, position: "sticky", top: 14, zIndex: 10, background: "#DCCCAC", paddingBottom: 6 }}>
            {[
              { key: "info", label: "Info" },
              { key: "simulation", label: "Simulation" },
              { key: "charts", label: "Charts" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  border: activeTab === tab.key ? "1px solid #1F2A17" : "1px solid rgba(84,107,65,0.3)",
                  background: activeTab === tab.key ? "#99AD7A" : "#FFF8EC",
                  color: "#1F2A17",
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ overflowY: "auto", flex: 1, display: "grid", gap: 10 }}>
            {!selectedStation && <div style={{ color: "#2F3E24" }}>No station selected.</div>}

            {selectedStation && activeTab === "info" && (
              <div style={{ display: "grid", gap: 6, color: "#1F2A17" }}>
              <div style={{ fontWeight: 700 }}>{selectedStation.name}</div>
              <div>City: {selectedStation.city}</div>
              <div style={{ color: getAqiColor(selectedStation.aqi), fontWeight: 800 }}>
                AQI {formatNum(selectedStation.aqi)} ({getAqiLabel(selectedStation.aqi)})
              </div>

              <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 700, fontSize: "0.86rem" }}>Suggested Recommendations</div>

                {panelLoading && (
                  <div style={{ color: "#2F3E24", fontSize: "0.82rem" }}>
                    Loading suggested recommendations...
                  </div>
                )}

                {!panelLoading && (panelResult?.recommended || []).length === 0 && (
                  <div style={{ color: "#2F3E24", fontSize: "0.82rem" }}>
                    No recommendations available.
                  </div>
                )}

                {!panelLoading && (panelResult?.recommended || []).slice(0, 3).map((rec, idx) => (
                  <div
                    key={`${rec.name}-${idx}`}
                    style={{
                      background: "#FFF8EC",
                      border: "1px solid rgba(84,107,65,0.3)",
                      borderRadius: 8,
                      padding: "8px",
                      color: "#1F2A17",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{rec.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

            {selectedStation && activeTab === "simulation" && (
              <>
                <div style={{ display: "grid", gap: 8 }}>
                {INTERVENTIONS.map((option) => {
                  const active = getInterventionsFor(selectedStation.name).includes(option.key);
                  return (
                    <label
                      key={option.key}
                      style={{
                        border: active ? "1px solid #1F2A17" : "1px solid rgba(84,107,65,0.3)",
                        borderRadius: 10,
                        padding: "8px 10px",
                        background: active ? "#99AD7A" : "#FFF8EC",
                        color: "#1F2A17",
                        cursor: "pointer",
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleIntervention(selectedStation.name, option.key)}
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => runSimulation(selectedStation.name)}
                disabled={panelLoading}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: 10,
                  border: "1px solid #1F2A17",
                  background: "#1F2A17",
                  color: "#FFF8EC",
                  fontWeight: 800,
                  cursor: panelLoading ? "not-allowed" : "pointer",
                  opacity: panelLoading ? 0.8 : 1,
                }}
              >
                {panelLoading ? "Simulating..." : "Run Simulation"}
              </button>

              {panelResult?.error && <div style={{ color: "#1F2A17" }}>{panelResult.error}</div>}

              {panelResult && !panelResult.error && (
                <div style={{ display: "grid", gap: 6, color: "#1F2A17" }}>
                  <div>
                    AQI {formatNum(panelResult.current_aqi)} to {formatNum(panelResult.predicted_aqi)}
                  </div>
                  <div style={{ color: "#2F3E24", fontSize: "0.82rem" }}>
                    Dominant: {String(panelResult.dominant_pollutant || "N/A").toUpperCase()}
                  </div>
                </div>
              )}
                </>
            )}

            {selectedStation && activeTab === "charts" && (
              <div style={{ display: "grid", gap: 8 }}>
              {panelResult?.error && <div style={{ color: "#1F2A17" }}>{panelResult.error}</div>}

              {!panelResult && <div style={{ color: "#2F3E24" }}>Run simulation to view charts data.</div>}

              {panelResult && !panelResult.error && (
                <>
                  <div style={{ fontWeight: 700 }}>Suggested Recommendations</div>
                  {(panelResult.recommended || []).length === 0 && (
                    <div style={{ color: "#2F3E24", fontSize: "0.85rem" }}>No recommendations available.</div>
                  )}
                  {(panelResult.recommended || []).slice(0, 3).map((rec, idx) => (
                    <div
                      key={`${rec.name}-${idx}`}
                      style={{
                        background: "#FFF8EC",
                        border: "1px solid rgba(84,107,65,0.3)",
                        borderRadius: 8,
                        padding: "8px",
                        color: "#1F2A17",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{rec.name}</div>
                    </div>
                  ))}

                  {(panelResult.pollutant_changes || []).length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>Pollutant Impact</div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", color: "#1F2A17", fontSize: "0.8rem" }}>
                          <thead>
                            <tr style={{ background: "#FFF8EC" }}>
                              <th style={thStyle}>Pollutant</th>
                              <th style={thStyle}>Before</th>
                              <th style={thStyle}>After</th>
                              <th style={thStyle}>Reduction %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {panelResult.pollutant_changes.map((row) => (
                              <tr key={row.pollutant} style={{ borderTop: "1px solid rgba(84,107,65,0.24)" }}>
                                <td style={tdStyle}>{row.pollutant}</td>
                                <td style={tdStyle}>{formatNum(row.before)}</td>
                                <td style={tdStyle}>{formatNum(row.after)}</td>
                                <td style={{ ...tdStyle, color: "#2F3E24", fontWeight: 700 }}>{formatNum(row.reduction)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const thStyle = {
  textAlign: "left",
  padding: "6px",
  borderBottom: "1px solid rgba(84,107,65,0.24)",
  color: "#2F3E24",
};

const tdStyle = {
  padding: "6px",
};
