import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { fetchLatestAqi, fetchStations, simulateIntervention } from "../services/api.js";

const INTERVENTIONS = ["green_wall", "green_belt", "scrubbers"];

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

function getRecommendations(latest) {
  if (!latest) {
    return ["No pollutant snapshot available", "Use latest station data to evaluate action"];
  }

  const list = [];
  if ((latest.pm25 || 0) > 100) list.push("Plant trees and use roadside green barriers");
  if ((latest.no2 || 0) > 50) list.push("Reduce traffic emissions during peak hours");
  if ((latest.pm10 || 0) > 120) list.push("Strengthen dust suppression at hotspots");

  if (list.length === 0) {
    list.push("Maintain current environmental controls");
    list.push("Continue routine monitoring and preventive cleaning");
  }

  return list.slice(0, 3);
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

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const stationRows = await fetchStations();
        const withAqi = await Promise.all(
          stationRows.map(async (station) => {
            try {
              const latest = await fetchLatestAqi(station.name);
              return { ...station, latest, final_aqi: latest?.final_aqi ?? null };
            } catch {
              return { ...station, latest: null, final_aqi: null };
            }
          })
        );

        if (!mounted) return;
        setStations(withAqi);
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
  const getIntervention = (stationName) => selectedInterventions[stationName] || "green_wall";

  const stats = useMemo(() => {
    const valid = stations.filter((s) => s.latest && s.latest.final_aqi != null);
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

    const sum = (arr, pick) => arr.reduce((acc, x) => acc + Number(pick(x) || 0), 0);
    const avgAqi = sum(valid, (s) => s.latest.final_aqi) / valid.length;
    const avgPm25 = sum(valid, (s) => s.latest.pm25) / valid.length;
    const avgPm10 = sum(valid, (s) => s.latest.pm10) / valid.length;

    const sorted = [...valid].sort((a, b) => Number(b.latest.final_aqi) - Number(a.latest.final_aqi));
    const high = sorted[0];
    const low = sorted[sorted.length - 1];
    const goodCount = valid.filter((s) => Number(s.latest.final_aqi) <= 100).length;
    const poorCount = valid.length - goodCount;

    return { avgAqi, high, low, avgPm25, avgPm10, goodCount, poorCount };
  }, [stations]);

  const onSimulate = async (stationName) => {
    const intervention = getIntervention(stationName);
    setSimulationLoading((prev) => ({ ...prev, [stationName]: true }));
    try {
      const result = await simulateIntervention(stationName, intervention);
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

  return (
    <section style={{ display: "grid", gap: "16px" }}>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: "12px" }}>
        <StatCard
          label="Average AQI"
          value={formatNum(stats.avgAqi)}
          category={getAqiCategory(stats.avgAqi)}
          color={getAqiColor(stats.avgAqi)}
        />
        <StatCard
          label="Highest AQI Area"
          value={stats.high ? formatNum(stats.high.final_aqi) : "N/A"}
          sub={stats.high?.name}
          category={stats.high ? getAqiCategory(stats.high.final_aqi) : "No Data"}
          color={stats.high ? getAqiColor(stats.high.final_aqi) : "#94a3b8"}
        />
        <StatCard
          label="Lowest AQI Area"
          value={stats.low ? formatNum(stats.low.final_aqi) : "N/A"}
          sub={stats.low?.name}
          category={stats.low ? getAqiCategory(stats.low.final_aqi) : "No Data"}
          color={stats.low ? getAqiColor(stats.low.final_aqi) : "#94a3b8"}
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

      <div style={{ display: "grid", gridTemplateColumns: "7fr 3fr", gap: "16px", alignItems: "start" }}>
        <Panel style={{ padding: 0, overflow: "hidden", position: "relative" }}>
          <MapContainer center={center} zoom={10} style={{ height: "70vh", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {stations.map((station) => {
              const isHovered = hoveredStationName === station.name;
              const isSelected = selectedStationName === station.name;
              return (
                <CircleMarker
                  key={station.name}
                  center={[station.latitude, station.longitude]}
                  radius={isHovered || isSelected ? 11 : 9}
                  pathOptions={{
                    color: getAqiColor(station.final_aqi),
                    fillColor: getAqiColor(station.final_aqi),
                    fillOpacity: 0.92,
                    weight: isSelected ? 3 : 2,
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

        <Panel>
          <h3 style={{ margin: 0, fontSize: "1.05rem", color: "#ffffff" }}>Smart Station Panel</h3>
          {!selectedStation && <div style={{ color: "#c4d5e8" }}>No station selected.</div>}
          {selectedStation && (
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
                  {getRecommendations(selectedStation.latest).map((item) => (
                    <li key={item} style={{ fontSize: "0.88rem" }}>
                      {item}
                    </li>
                  ))}
                </ul>
              </SubPanel>

              <SubPanel title="Intervention Options">
                <div style={{ display: "grid", gap: "8px" }}>
                  {INTERVENTIONS.map((name) => (
                    <ActionButton
                      key={name}
                      active={getIntervention(selectedStation.name) === name}
                      onClick={() =>
                        setSelectedInterventions((prev) => ({
                          ...prev,
                          [selectedStation.name]: name,
                        }))
                      }
                    >
                      {name.replace("_", " ")}
                    </ActionButton>
                  ))}
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
                      {Number(panelResult.improvement) > 15
                        ? "Significant improvement achieved"
                        : "Minimal impact from this intervention"}
                    </div>
                  </div>
                </SubPanel>
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

function ActionButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: "10px 12px",
        borderRadius: 10,
        border: active ? "1px solid #00e676" : "1px solid #2f5d84",
        background: active ? "rgba(0, 230, 118, 0.2)" : "#132f4c",
        color: "#ecf6ff",
        cursor: "pointer",
        fontWeight: 600,
        textTransform: "capitalize",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "#173859";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "#132f4c";
      }}
    >
      {children}
    </button>
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
