import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { fetchLatestAqi, fetchStations, simulateIntervention } from "../services/api.js";

const INTERVENTIONS = [
  { key: "industrialScrubbers", label: "Industrial Scrubbers" },
  { key: "roadsidePurifiers", label: "Roadside Purifiers" },
  { key: "biofilters", label: "Biofilters" },
  { key: "verticalGardens", label: "Vertical Gardens" },
];

function getAqiColor(aqi) {
  if (aqi == null) return "#94a3b8";
  if (aqi <= 50) return "#00e676";
  if (aqi <= 100) return "#ffea00";
  if (aqi <= 200) return "#ff9100";
  return "#ff1744";
}

function getAqiCategory(aqi) {
  if (aqi == null) return "No Data";
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 200) return "Poor";
  return "Very Poor";
}

function formatNum(value) {
  return value == null ? "N/A" : Number(value).toFixed(1);
}

function normalizeStationName(name) {
  const raw = String(name || "").trim().toLowerCase();
  if (raw === "ecil" || raw === "ecil kapra") {
    return "ECIL Kapra";
  }
  return String(name || "").trim();
}

function getDateKey(isoDate) {
  if (!isoDate) return null;
  const text = String(isoDate);
  return text.length >= 10 ? text.slice(0, 10) : null;
}

export function MapPage() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStationName, setSelectedStationName] = useState("");
  const [hoveredStationName, setHoveredStationName] = useState("");
  const [selectedInterventions, setSelectedInterventions] = useState({});
  const [simulationResults, setSimulationResults] = useState({});
  const [simulationLoading, setSimulationLoading] = useState({});
  const [mapDate, setMapDate] = useState(null);
  const [activePanelTab, setActivePanelTab] = useState("info");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const stationRows = await fetchStations();
        const withAqiRaw = await Promise.all(
          stationRows.map(async (station) => {
            try {
              const latest = await fetchLatestAqi(station.name);
              return { ...station, latest, final_aqi: latest?.final_aqi ?? null };
            } catch {
              return { ...station, latest: null, final_aqi: null };
            }
          })
        );

        const known = withAqiRaw.filter((s) => s.latest && s.latest.final_aqi != null);
        const zoneAgg = known.reduce((acc, s) => {
          const zone = String(s.zone || "Unknown");
          if (!acc[zone]) acc[zone] = { sum: 0, count: 0 };
          acc[zone].sum += Number(s.latest.final_aqi || 0);
          acc[zone].count += 1;
          return acc;
        }, {});
        const globalAverage = known.length > 0
          ? known.reduce((sum, s) => sum + Number(s.latest.final_aqi || 0), 0) / known.length
          : null;
        const mostRecentKnownDate = known
          .map((s) => s.latest?.date)
          .filter(Boolean)
          .sort()
          .at(-1) || null;

        const withAqi = withAqiRaw.map((station) => {
          if (station.latest && station.latest.final_aqi != null) {
            return station;
          }

          const zone = String(station.zone || "Unknown");
          const zoneAverage = zoneAgg[zone] && zoneAgg[zone].count > 0
            ? zoneAgg[zone].sum / zoneAgg[zone].count
            : null;
          const estimatedAqi = zoneAverage ?? globalAverage;

          if (estimatedAqi == null) {
            return station;
          }

          return {
            ...station,
            latest: {
              date: mostRecentKnownDate,
              final_aqi: Number(estimatedAqi.toFixed(2)),
              pm25: null,
              pm10: null,
              no2: null,
              so2: null,
              co: null,
              o3: null,
            },
            final_aqi: Number(estimatedAqi.toFixed(2)),
            isEstimated: true,
          };
        });

        if (!mounted) return;
        setStations(withAqi);
        const dateFrequency = withAqi.reduce((acc, station) => {
          const dateKey = getDateKey(station.latest?.date);
          if (!dateKey) return acc;
          acc[dateKey] = (acc[dateKey] || 0) + 1;
          return acc;
        }, {});
        const rankedDates = Object.entries(dateFrequency).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        setMapDate(rankedDates.length > 0 ? rankedDates[0][0] : null);
        if (withAqi.length > 0) setSelectedStationName(withAqi[0].name);
      } catch (e) {
        if (mounted) setError(e.message || "Failed to load map data");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const center = useMemo(() => [17.385, 78.4867], []);
  const selectedStation =
    stations.find((station) => station.name === selectedStationName) || stations[0] || null;
  const getInterventions = (stationName) => selectedInterventions[stationName] || [];

  const stats = useMemo(() => {
    const valid = stations.filter((s) => {
      if (!s.latest || s.latest.final_aqi == null) return false;
      if (!mapDate) return true;
      return getDateKey(s.latest.date) === mapDate;
    });
    if (valid.length === 0) {
      return {
        avgAqi: null,
        high: null,
        low: null,
        avgPm25: null,
        avgPm10: null,
        goodCount: 0,
        poorCount: 0,
      };
    }

    const grouped = valid.reduce((acc, station) => {
      const key = normalizeStationName(station.name);
      if (!acc[key]) {
        acc[key] = {
          name: key,
          finalAqiValues: [],
          pm25Values: [],
          pm10Values: [],
        };
      }
      acc[key].finalAqiValues.push(Number(station.latest?.final_aqi || 0));
      acc[key].pm25Values.push(Number(station.latest?.pm25 || 0));
      acc[key].pm10Values.push(Number(station.latest?.pm10 || 0));
      return acc;
    }, {});

    const normalizedStations = Object.values(grouped).map((g) => ({
      name: g.name,
      latest: {
        final_aqi: g.finalAqiValues.reduce((a, b) => a + b, 0) / g.finalAqiValues.length,
        pm25: g.pm25Values.reduce((a, b) => a + b, 0) / g.pm25Values.length,
        pm10: g.pm10Values.reduce((a, b) => a + b, 0) / g.pm10Values.length,
      },
    }));

    const sum = (arr, pick) => arr.reduce((acc, x) => acc + Number(pick(x) || 0), 0);
    const avgAqi = sum(normalizedStations, (s) => s.latest.final_aqi) / normalizedStations.length;
    const avgPm25 = sum(normalizedStations, (s) => s.latest.pm25) / normalizedStations.length;
    const avgPm10 = sum(normalizedStations, (s) => s.latest.pm10) / normalizedStations.length;

    const sorted = [...normalizedStations].sort((a, b) => Number(b.latest.final_aqi) - Number(a.latest.final_aqi));
    const high = sorted[0];
    const low = sorted[sorted.length - 1];
    const goodCount = normalizedStations.filter((s) => Number(s.latest.final_aqi) <= 100).length;
    const poorCount = normalizedStations.length - goodCount;

    return { avgAqi, high, low, avgPm25, avgPm10, goodCount, poorCount };
  }, [stations, mapDate]);

  const onSimulate = async (stationName) => {
    const interventions = getInterventions(stationName);
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

  const panelResult = selectedStation ? simulationResults[selectedStation.name] : null;
  const panelLoading = selectedStation ? simulationLoading[selectedStation.name] : false;

  const toggleIntervention = (stationName, interventionKey) => {
    setSelectedInterventions((prev) => {
      const current = prev[stationName] || [];
      const next = current.includes(interventionKey)
        ? current.filter((x) => x !== interventionKey)
        : [...current, interventionKey];
      return { ...prev, [stationName]: next };
    });
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "12px", height: "100vh", minHeight: 0 }}>
      <h2 style={{ fontSize: "1.1rem", margin: 0, color: "#ffffff" }}>AQI Analytics Dashboard</h2>
      {loading && (
        <Panel>
          <div style={{ color: "#c4d5e8" }}>Loading station telemetry...</div>
        </Panel>
      )}
      {error && (
        <Panel>
          <div style={{ color: "#ff8a80" }}>{error}</div>
        </Panel>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: "10px" }}>
        <StatCard
          label="Average AQI"
          value={formatNum(stats.avgAqi)}
          category={getAqiCategory(stats.avgAqi)}
          color={getAqiColor(stats.avgAqi)}
        />
        <StatCard
          label="Highest AQI Area"
          value={stats.high ? formatNum(stats.high.latest?.final_aqi) : "N/A"}
          sub={stats.high?.name}
          category={stats.high ? getAqiCategory(stats.high.latest?.final_aqi) : "No Data"}
          color={stats.high ? getAqiColor(stats.high.latest?.final_aqi) : "#94a3b8"}
        />
        <StatCard
          label="Lowest AQI Area"
          value={stats.low ? formatNum(stats.low.latest?.final_aqi) : "N/A"}
          sub={stats.low?.name}
          category={stats.low ? getAqiCategory(stats.low.latest?.final_aqi) : "No Data"}
          color={stats.low ? getAqiColor(stats.low.latest?.final_aqi) : "#94a3b8"}
        />
        <StatCard
          label="Avg PM2.5"
          value={formatNum(stats.avgPm25)}
          category={getAqiCategory(stats.avgAqi)}
          color="#00e676"
        />
        <StatCard
          label="Avg PM10"
          value={formatNum(stats.avgPm10)}
          category={getAqiCategory(stats.avgAqi)}
          color="#ffea00"
        />
        <StatCard
          label="Station Status"
          value={`${stats.goodCount} / ${stats.poorCount}`}
          sub="Good / Poor"
          category={stats.poorCount > stats.goodCount ? "Poor" : "Good"}
          color={stats.poorCount > stats.goodCount ? "#ff1744" : "#00e676"}
        />
      </div>

      <div style={{ display: "flex", gap: "12px", flex: 1, minHeight: 0, alignItems: "stretch" }}>
        <Panel style={{ padding: 0, overflow: "hidden", position: "relative", flex: 3, minHeight: 0, display: "block" }}>
          <MapContainer center={center} zoom={10} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {stations.map((station) => {
              const isHovered = hoveredStationName === station.name;
              const isSelected = selectedStationName === station.name;
              return (
                <>
                  <CircleMarker
                    key={station.name}
                    center={[station.latitude, station.longitude]}
                    radius={isHovered || isSelected ? 15 : 12}
                    pathOptions={{
                      color: getAqiColor(station.final_aqi),
                      fillColor: getAqiColor(station.final_aqi),
                      fillOpacity: 0.95,
                      weight: isSelected ? 4 : 2,
                    }}
                    eventHandlers={{
                      mouseover: () => setHoveredStationName(station.name),
                      mouseout: () => setHoveredStationName(""),
                      click: () => setSelectedStationName(station.name),
                    }}
                  >
                    <Popup>
                      <div style={{ minWidth: 235, color: "#0f172a", display: "grid", gap: "8px" }}>
                        <div style={{ fontSize: "1rem", fontWeight: 700 }}>{station.name}</div>
                        <div style={{ fontSize: "0.86rem" }}>Zone: {station.zone || "N/A"}</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 800, color: getAqiColor(station.final_aqi) }}>
                          AQI {formatNum(station.final_aqi)}
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "4px",
                            fontSize: "0.82rem",
                          }}
                        >
                          <span>PM2.5: {formatNum(station.latest?.pm25)}</span>
                          <span>PM10: {formatNum(station.latest?.pm10)}</span>
                          <span>NO2: {formatNum(station.latest?.no2)}</span>
                          <span>SO2: {formatNum(station.latest?.so2)}</span>
                          <span>CO: {formatNum(station.latest?.co)}</span>
                          <span>O3: {formatNum(station.latest?.o3)}</span>
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                </>
              );
            })}
          </MapContainer>

          <div
            style={{
              position: "absolute",
              right: 14,
              bottom: 14,
              zIndex: 1000,
              background: "rgba(11, 28, 44, 0.95)",
              border: "1px solid #2f5d84",
              borderRadius: 12,
              padding: "10px 12px",
              fontSize: "0.82rem",
              color: "#e6efff",
              boxShadow: "0 2px 10px rgba(15, 23, 42, 0.3)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: "6px" }}>AQI Legend</div>
            <div style={{ display: "grid", gap: "4px" }}>
              <LegendItem color="#00e676" label="Good (0-50)" />
              <LegendItem color="#ffea00" label="Moderate (51-100)" />
              <LegendItem color="#ff9100" label="Poor (101-200)" />
              <LegendItem color="#ff1744" label="Very Poor (200+)" />
            </div>
          </div>
        </Panel>

        <Panel style={{ flex: 1, minHeight: 0, overflowY: "auto", alignContent: "start" }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem", color: "#ffffff" }}>Smart Station Panel</h3>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { key: "info", label: "Info" },
              { key: "simulation", label: "Simulation" },
              { key: "charts", label: "Charts" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActivePanelTab(tab.key)}
                style={{
                  border: activePanelTab === tab.key ? "1px solid #00e676" : "1px solid #2f5d84",
                  background: activePanelTab === tab.key ? "rgba(0, 230, 118, 0.22)" : "#0f2942",
                  color: "#e8f3ff",
                  borderRadius: 999,
                  padding: "6px 12px",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {!selectedStation && <div style={{ color: "#c4d5e8" }}>No station selected.</div>}
          {selectedStation && (
            <>
              {activePanelTab === "info" && (
                <>
                  <div style={{ display: "grid", gap: "8px" }}>
                    <div style={{ fontSize: "1rem", fontWeight: 700 }}>{selectedStation.name}</div>
                    <div style={{ color: "#b6c9df", fontSize: "0.9rem" }}>
                      Zone: {selectedStation.zone || "N/A"}
                    </div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: getAqiColor(selectedStation.final_aqi) }}>
                      {formatNum(selectedStation.final_aqi)} AQI
                    </div>
                  </div>

                  <SubPanel title="Recommended Actions">
                    <ul style={{ margin: 0, paddingLeft: "16px", display: "grid", gap: "6px", color: "#d9e8f8" }}>
                      {(panelResult?.recommended || []).length > 0 ? (
                        (panelResult.recommended || []).map((item, idx) => (
                          <li key={`${item.name}-${idx}`} style={{ fontSize: "0.88rem" }}>
                            {item.name} (AQI: {formatNum(item.predicted_aqi)})
                          </li>
                        ))
                      ) : (
                        <li style={{ fontSize: "0.88rem" }}>
                          Run simulation to get smart intervention suggestions.
                        </li>
                      )}
                    </ul>
                  </SubPanel>
                </>
              )}

              {activePanelTab === "simulation" && (
                <>
                  <SubPanel title="Intervention Options">
                    <div style={{ display: "grid", gap: "8px" }}>
                      {INTERVENTIONS.map((option) => {
                        const active = getInterventions(selectedStation.name).includes(option.key);
                        return (
                          <label
                            key={option.key}
                            style={{
                              border: active ? "1px solid #00e676" : "1px solid #2f5d84",
                              borderRadius: 10,
                              padding: "10px 12px",
                              background: active ? "rgba(0, 230, 118, 0.2)" : "#132f4c",
                              color: "#ecf6ff",
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
                  </SubPanel>

                  <button
                    type="button"
                    onClick={() => onSimulate(selectedStation.name)}
                    disabled={panelLoading}
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: 12,
                      border: "none",
                      background: "linear-gradient(90deg, #00e676, #00b0ff)",
                      color: "#07213a",
                      fontWeight: 800,
                      cursor: panelLoading ? "not-allowed" : "pointer",
                      opacity: panelLoading ? 0.8 : 1,
                      transition: "all 0.2s ease",
                    }}
                  >
                    {panelLoading ? "Simulating..." : "Run Simulation"}
                  </button>

                  {panelResult?.error && <div style={{ color: "#ff8a80", fontSize: "0.9rem" }}>{panelResult.error}</div>}
                  {panelResult && !panelResult.error && (
                    <SubPanel title="Simulation Result">
                      <div style={{ display: "grid", gap: "8px" }}>
                        <div style={{ fontSize: "0.95rem", color: "#d9e8f8" }}>
                          AQI: <strong>{formatNum(panelResult.current_aqi)}</strong> -&gt;{" "}
                          <strong>{formatNum(panelResult.predicted_aqi)}</strong>
                        </div>
                        <ImprovementBadge value={panelResult.improvement} />
                        <div style={{ fontSize: "0.86rem", color: "#b6c9df" }}>
                          Dominant Pollutant: {String(panelResult.dominant_pollutant || "N/A").toUpperCase()}
                        </div>
                        {(panelResult.applied_interventions || []).length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            {panelResult.applied_interventions.map((name) => (
                              <span
                                key={name}
                                style={{
                                  border: "1px solid #2f5d84",
                                  borderRadius: 999,
                                  padding: "4px 8px",
                                  fontSize: "0.78rem",
                                  color: "#dff1ff",
                                  background: "#12334f",
                                }}
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </SubPanel>
                  )}
                </>
              )}

              {activePanelTab === "charts" && (
                <>
                  {panelResult && !panelResult.error && (panelResult.pollutant_changes || []).length > 0 ? (
                    <SubPanel title="Pollutant Impact">
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
                            {panelResult.pollutant_changes.map((row) => (
                              <tr key={row.pollutant} style={{ borderTop: "1px solid #244c6f" }}>
                                <td style={tdStyle}>{row.pollutant}</td>
                                <td style={tdStyle}>{formatNum(row.before)}</td>
                                <td style={tdStyle}>{formatNum(row.after)}</td>
                                <td style={{ ...tdStyle, color: "#49e48f", fontWeight: 700 }}>
                                  {formatNum(row.reduction)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </SubPanel>
                  ) : (
                    <SubPanel title="Charts">
                      <div style={{ color: "#b6c9df", fontSize: "0.9rem" }}>
                        Run a simulation to view pollutant impact charts and table.
                      </div>
                    </SubPanel>
                  )}
                </>
              )}
            </>
          )}
        </Panel>
      </div>
    </section>
  );
}

function StatCard({ label, value, sub, category, color }) {
  return (
    <div
      style={{
        background: "#132f4c",
        border: "1px solid #204768",
        borderRadius: 12,
        padding: "16px",
        boxShadow: "0 8px 20px rgba(2, 8, 20, 0.35)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px) scale(1.01)";
        e.currentTarget.style.boxShadow = "0 14px 26px rgba(2, 8, 20, 0.5)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "0 8px 20px rgba(2, 8, 20, 0.35)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: "0.78rem", color: "#9eb6cf" }}>{label}</span>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: color, display: "inline-block" }} />
      </div>
      <div style={{ color, fontSize: "1.45rem", fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ marginTop: 5, fontSize: "0.78rem", color: "#c7d9ec" }}>{sub}</div>}
      <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#b5c8dd" }}>{category}</div>
    </div>
  );
}

function Panel({ children, style }) {
  return (
    <div
      style={{
        border: "1px solid #204768",
        borderRadius: 12,
        background: "#132f4c",
        padding: 16,
        boxShadow: "0 10px 24px rgba(2, 8, 20, 0.35)",
        color: "#e6efff",
        display: "grid",
        gap: 14,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SubPanel({ title, children }) {
  return (
    <div
      style={{
        border: "1px solid #2f5d84",
        borderRadius: 12,
        background: "#0f2942",
        padding: 12,
        display: "grid",
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: "0.8rem",
          fontWeight: 700,
          color: "#9ec5e8",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function ImprovementBadge({ value }) {
  const num = Number(value || 0);
  const color = num > 0 ? "#00e676" : num === 0 ? "#ffea00" : "#ff1744";
  return (
    <div style={{ color, fontWeight: 800, fontSize: "1rem" }}>
      {num > 0 ? "v " : ""}
      {num.toFixed(1)}% Improvement
    </div>
  );
}

function LegendItem({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 999,
          background: color,
          display: "inline-block",
        }}
      />
      <span>{label}</span>
    </div>
  );
}

const thStyle = {
  textAlign: "left",
  padding: "8px",
  borderBottom: "1px solid #244c6f",
  fontSize: "0.78rem",
  color: "#a8c7e4",
};

const tdStyle = {
  padding: "8px",
  fontSize: "0.82rem",
};
