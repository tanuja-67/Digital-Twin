import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { fetchLiveData } from "../services/api.js";

function getAqiStatus(aqi) {
  const value = Number(aqi || 0);
  if (value <= 50) return { label: "Good", color: "green" };
  if (value <= 100) return { label: "Moderate", color: "orange" };
  if (value <= 200) return { label: "Poor", color: "red" };
  return { label: "Severe", color: "#546B41" };
}

function safeNum(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function formatTs(ts) {
  if (!ts) return "N/A";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString();
}

export function Analysis() {
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const center = useMemo(() => {
    if (!areas.length) return [17.44, 78.42];
    const valid = areas.filter((a) => Number.isFinite(Number(a.latitude)) && Number.isFinite(Number(a.longitude)));
    if (!valid.length) return [17.44, 78.42];
    const lat = valid.reduce((acc, row) => acc + Number(row.latitude), 0) / valid.length;
    const lon = valid.reduce((acc, row) => acc + Number(row.longitude), 0) / valid.length;
    return [lat, lon];
  }, [areas]);

  const loadLive = async (forceRefresh = false) => {
    try {
      if (!areas.length || forceRefresh) setLoading(true);
      setError(null);
      const rows = await fetchLiveData(forceRefresh);
      setAreas(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e.message || "Failed to load live AQI data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLive(false);
    const timer = setInterval(() => {
      loadLive(false);
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const stats = useMemo(() => {
    if (!areas.length) {
      return {
        averageAqi: 0,
        highestArea: null,
        lowestArea: null,
        severeCount: 0,
      };
    }
    const sorted = [...areas].sort((a, b) => safeNum(b.aqi) - safeNum(a.aqi));
    const sum = areas.reduce((acc, row) => acc + safeNum(row.aqi), 0);
    return {
      averageAqi: sum / areas.length,
      highestArea: sorted[0],
      lowestArea: sorted[sorted.length - 1],
      severeCount: areas.filter((row) => safeNum(row.aqi) > 200).length,
    };
  }, [areas]);

  const compareBars = useMemo(
    () =>
      areas.map((row) => ({
        area: row.area,
        actual: safeNum(row.aqi),
        predicted: safeNum(row.predicted_aqi),
      })),
    [areas]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <section
        className="fade-up stagger-1"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={() => loadLive(true)}
          className="theme-button floating-lift"
          style={{
            borderRadius: 10,
            padding: "8px 10px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Refresh all areas
        </button>
        <span style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>
          Auto refresh: 1 min | Backend cycle: 3 hours
        </span>
        <Link
          to="/station-trend"
          className="theme-button floating-lift"
          style={{
            borderRadius: 10,
            padding: "8px 10px",
            minWidth: 220,
            textDecoration: "none",
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          Station-wise Monthly Trend
        </Link>
      </section>

      {loading && <p style={{ color: "var(--ink-soft)", margin: 0 }}>Loading live AQI data...</p>}

      {error && (
        <p style={{ color: "#546B41", margin: 0 }}>
          {error} - is the Flask server running on port 5000?
        </p>
      )}

      {!!areas.length && (
        <>
          <section
            className="fade-up stagger-2"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "10px",
            }}
          >
            <MetricCard
              label="Tracked Areas"
              value={String(areas.length)}
              sub="Predefined WAQI locations"
              color="#101110"
            />
            <MetricCard
              label="Average AQI"
              value={safeNum(stats.averageAqi).toFixed(2)}
              sub={getAqiStatus(stats.averageAqi).label}
              color="#0e0e0e"
            />
            <MetricCard
              label="Highest AQI"
              value={safeNum(stats.highestArea?.aqi).toFixed(2)}
              sub={stats.highestArea?.area || "N/A"}
              color="#0e0e0e"
            />
            <MetricCard
              label="Lowest AQI"
              value={safeNum(stats.lowestArea?.aqi).toFixed(2)}
              sub={stats.lowestArea?.area || "N/A"}
              color="#0f0f0e"
            />
            <MetricCard
              label="Severe Areas"
              value={String(stats.severeCount)}
              sub="AQI > 200"
              color="#131312"
            />
            <MetricCard
              label="Last Updated"
              value={formatTs(areas[0]?.timestamp)}
              sub="Latest backend snapshot"
              color="#111110"
            />
          </section>

          <section
            className="surface-card fade-up stagger-3 floating-lift"
            style={{
              padding: "12px",
              height: 360,
            }}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: "1.05rem", color: "var(--ink)" }}>Actual vs Predicted AQI by Area</h3>
            <ResponsiveContainer>
              <BarChart data={compareBars}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(84,107,65,0.2)" />
                <XAxis dataKey="area" stroke="rgba(84,107,65,0.75)" interval={0} angle={-35} textAnchor="end" height={85} />
                <YAxis stroke="rgba(84,107,65,0.75)" />
                <Tooltip />
                <Bar dataKey="actual" name="Actual AQI" fill="#546B41" radius={[6, 6, 0, 0]} />
                <Bar dataKey="predicted" name="Predicted AQI" fill="#99AD7A" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "12px" }}>
            <div
              className="surface-card floating-lift"
              style={{
                padding: "12px",
                maxHeight: 420,
                overflowY: "auto",
              }}
            >
              <h3 style={{ margin: "0 0 12px", fontSize: "1.05rem", color: "var(--ink)" }}>Area Status Board</h3>
              <div style={{ display: "grid", gap: "8px" }}>
                {areas.map((row) => {
                  const status = getAqiStatus(row.aqi);
                  return (
                    <div
                      key={row.area}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.4fr 0.7fr 0.7fr",
                        gap: "8px",
                        alignItems: "center",
                        border: "1px solid rgba(84,107,65,0.26)",
                        borderRadius: 10,
                        padding: "8px 10px",
                        background: "#FFF8EC",
                      }}
                    >
                      <div style={{ color: "#546B41", fontWeight: 700, fontSize: "0.88rem" }}>{row.area}</div>
                      <div style={{ color: "#494f40", fontWeight: 700, fontSize: "0.88rem" }}>AQI {safeNum(row.aqi).toFixed(1)}</div>
                      <div style={{ color: status.color, fontWeight: 700, fontSize: "0.85rem" }}>{status.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              className="surface-card floating-lift"
              style={{
                padding: "12px",
                height: 420,
              }}
            >
              <h3 style={{ margin: "0 0 12px", fontSize: "1.05rem", color: "var(--ink)" }}>Live AQI Map (14 Areas)</h3>
              <div style={{ height: 360, borderRadius: 10, overflow: "hidden" }}>
                <MapContainer center={center} zoom={10} style={{ height: "100%", width: "100%" }}>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {areas
                    .filter((row) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)))
                    .map((row) => {
                      const status = getAqiStatus(row.aqi);
                      return (
                        <CircleMarker
                          key={row.area}
                          center={[Number(row.latitude), Number(row.longitude)]}
                          radius={10}
                          pathOptions={{ color: status.color, fillOpacity: 0.8 }}
                        >
                          <Popup>
                            <div>
                              <strong>{row.area}</strong>
                              <div>AQI: {safeNum(row.aqi).toFixed(2)}</div>
                              <div>Predicted AQI: {safeNum(row.predicted_aqi).toFixed(2)}</div>
                              <div>Status: {status.label}</div>
                              <div>Updated: {formatTs(row.timestamp)}</div>
                            </div>
                          </Popup>
                        </CircleMarker>
                      );
                    })}
                </MapContainer>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub, color }) {
  return (
    <article
      className="panel-card floating-lift"
      style={{
        padding: "12px",
        display: "grid",
        gap: "4px",
      }}
    >
      <div style={{ color: "rgba(84,107,65,0.75)", fontSize: "0.8rem", textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: color || "#546B41", fontSize: "1.1rem", fontWeight: 800 }}>{value}</div>
      <div style={{ color: "rgba(84,107,65,0.7)", fontSize: "0.84rem" }}>{sub}</div>
    </article>
  );
}
