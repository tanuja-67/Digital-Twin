import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchStations, fetchStationTrend } from "../services/api.js";

export function StationTrendPage() {
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState("");
  const [stationTrend, setStationTrend] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStations()
      .then((rows) => {
        const stationRows = Array.isArray(rows) ? rows : [];
        setStations(stationRows);
        if (stationRows.length > 0) {
          setSelectedStation(stationRows[0].name);
        }
      })
      .catch((e) => setError(e.message || "Failed to load stations"));
  }, []);

  useEffect(() => {
    if (!selectedStation) return;
    setLoading(true);
    setError(null);
    fetchStationTrend(selectedStation)
      .then((rows) => setStationTrend(Array.isArray(rows) ? rows : []))
      .catch((e) => setError(e.message || "Failed to load station trend"))
      .finally(() => setLoading(false));
  }, [selectedStation]);

  const bestMonth = stationTrend.reduce((best, row) => (best == null || row.aqi < best.aqi ? row : best), null);
  const worstMonth = stationTrend.reduce((worst, row) => (worst == null || row.aqi > worst.aqi ? row : worst), null);

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
        <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#f2f9ff" }}>Station AQI Trend</h2>
        <select
          value={selectedStation}
          onChange={(e) => setSelectedStation(e.target.value)}
          disabled={stations.length === 0}
          style={{
            background: "#0b1d31",
            color: "#f4faff",
            border: "1px solid #2f5c84",
            borderRadius: 10,
            padding: "8px 10px",
            minWidth: 260,
          }}
        >
          {stations.map((station) => (
            <option key={station.name} value={station.name}>
              {station.name}
            </option>
          ))}
        </select>
        <Link
          to="/"
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #7a1f28",
            background: "#3b0f14",
            color: "#ffdfe3",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          Exit
        </Link>
      </section>

      {error && (
        <p style={{ color: "#ff9e9e", margin: 0 }}>
          {error}
        </p>
      )}

      <section
        style={{
          background: "#10263f",
          border: "1px solid #244d73",
          borderRadius: 12,
          padding: "12px",
          height: 360,
        }}
      >
        <div style={{ marginBottom: 10, fontSize: "0.9rem", color: "#b7d0e8" }}>
          Station: {selectedStation || "N/A"}
          {bestMonth && worstMonth && (
            <span>
              {" "}- Best: {bestMonth.month} ({Number(bestMonth.aqi).toFixed(2)}) | Worst: {worstMonth.month} ({Number(worstMonth.aqi).toFixed(2)})
            </span>
          )}
        </div>

        {loading && <div style={{ color: "#b7d0e8" }}>Loading station trend...</div>}
        {!loading && !error && (
          <ResponsiveContainer>
            <LineChart data={stationTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f4568" />
              <XAxis dataKey="month" stroke="#b7d0e8" />
              <YAxis stroke="#b7d0e8" />
              <Tooltip />
              <Line type="monotone" dataKey="aqi" stroke="#63ffa3" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>
    </div>
  );
}
