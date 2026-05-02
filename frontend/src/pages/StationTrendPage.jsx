import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchStations, fetchStationTrend } from "../services/api.js";

const MONTH_TO_SEASON = {
  Jan: "Winter",
  Feb: "Winter",
  Mar: "Summer",
  Apr: "Summer",
  May: "Summer",
  Jun: "Monsoon",
  Jul: "Monsoon",
  Aug: "Monsoon",
  Sep: "Monsoon",
  Oct: "Post-monsoon",
  Nov: "Post-monsoon",
  Dec: "Winter",
};

const SEASON_ORDER = ["Winter", "Summer", "Monsoon", "Post-monsoon"];

function getSeasonColor(season) {
  if (season === "Winter") return "#546B41";
  if (season === "Summer") return "#99AD7A";
  if (season === "Monsoon") return "#BAC095";
  return "#2F3E24";
}

function buildSeasonalTrend(monthlyTrend) {
  const buckets = SEASON_ORDER.reduce((acc, season) => {
    acc[season] = { total: 0, count: 0 };
    return acc;
  }, {});

  monthlyTrend.forEach((row) => {
    const season = MONTH_TO_SEASON[row.month] || "Winter";
    const bucket = buckets[season];
    bucket.total += Number(row.aqi ?? 0);
    bucket.count += 1;
  });

  return SEASON_ORDER.map((season) => {
    const bucket = buckets[season];
    return {
      season,
      aqi: bucket.count ? bucket.total / bucket.count : 0,
    };
  });
}

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
  const seasonalTrend = useMemo(() => buildSeasonalTrend(stationTrend), [stationTrend]);
  const bestSeason = seasonalTrend.reduce((best, row) => (best == null || row.aqi < best.aqi ? row : best), null);
  const worstSeason = seasonalTrend.reduce((worst, row) => (worst == null || row.aqi > worst.aqi ? row : worst), null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <section className="fade-up stagger-1" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem", color: "var(--ink)" }}>Station AQI Trend</h2>
        <select
          value={selectedStation}
          onChange={(e) => setSelectedStation(e.target.value)}
          disabled={stations.length === 0}
          className="theme-select"
          style={{ padding: "8px 10px", minWidth: 260 }}
        >
          {stations.map((station) => (
            <option key={station.name} value={station.name}>
              {station.name}
            </option>
          ))}
        </select>
        <Link
          to="/"
          className="theme-button floating-lift"
          style={{ padding: "8px 12px", textDecoration: "none", fontWeight: 700 }}
        >
          Exit
        </Link>
      </section>

      {error && <p style={{ color: "#546B41", margin: 0 }}>{error}</p>}

      <section
        style={{
          background: "#DCCCAC",
          border: "1px solid rgba(84,107,65,0.28)",
          borderRadius: 18,
          padding: "12px",
          height: 360,
          boxShadow: "var(--shadow)",
        }}
      >
        <div style={{ marginBottom: 10, fontSize: "0.9rem", color: "var(--ink-soft)" }}>
          Station: {selectedStation || "N/A"}
          {bestMonth && worstMonth && (
            <span>
              {" "}- Best: {bestMonth.month} ({Number(bestMonth.aqi).toFixed(2)}) | Worst: {worstMonth.month} ({Number(worstMonth.aqi).toFixed(2)})
            </span>
          )}
        </div>

        {loading && <div style={{ color: "var(--ink-soft)" }}>Loading station trend...</div>}
        {!loading && !error && (
          <ResponsiveContainer>
            <LineChart data={stationTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(84,107,65,0.18)" />
              <XAxis dataKey="month" stroke="var(--ink-soft)" />
              <YAxis stroke="var(--ink-soft)" />
              <Tooltip />
              <Line type="monotone" dataKey="aqi" stroke="#546b41" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      <section
        className="surface-card fade-up stagger-2 floating-lift"
        style={{
          padding: "12px",
          minHeight: 380,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem", color: "var(--ink)" }}>Seasonal AQI Analysis</h3>


        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
          <div style={{ padding: "10px", borderRadius: 12, background: "#FFF8EC", border: "1px solid rgba(84,107,65,0.22)" }}>
            <div style={{ color: "var(--ink-soft)", fontSize: "0.78rem", textTransform: "uppercase" }}>Best Season</div>
            <div style={{ color: getSeasonColor(bestSeason?.season), fontWeight: 800, fontSize: "1.05rem" }}>
              {bestSeason?.season || "N/A"}
            </div>
            <div style={{ color: "var(--ink-soft)", fontSize: "0.82rem" }}>{bestSeason ? `AQI ${Number(bestSeason.aqi).toFixed(2)}` : ""}</div>
          </div>
          <div style={{ padding: "10px", borderRadius: 12, background: "#FFF8EC", border: "1px solid rgba(84,107,65,0.22)" }}>
            <div style={{ color: "var(--ink-soft)", fontSize: "0.78rem", textTransform: "uppercase" }}>Worst Season</div>
            <div style={{ color: getSeasonColor(worstSeason?.season), fontWeight: 800, fontSize: "1.05rem" }}>
              {worstSeason?.season || "N/A"}
            </div>
            <div style={{ color: "var(--ink-soft)", fontSize: "0.82rem" }}>{worstSeason ? `AQI ${Number(worstSeason.aqi).toFixed(2)}` : ""}</div>
          </div>
        </div>

        <div style={{ height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={seasonalTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(84,107,65,0.18)" />
              <XAxis dataKey="season" stroke="var(--ink-soft)" />
              <YAxis stroke="var(--ink-soft)" />
              <Tooltip />
              <Bar dataKey="aqi" name="Seasonal AQI" radius={[8, 8, 0, 0]}>
                {seasonalTrend.map((row) => (
                  <Cell key={row.season} fill={getSeasonColor(row.season)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
