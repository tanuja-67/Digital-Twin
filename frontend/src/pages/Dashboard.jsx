import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ZoneAnalysis } from "../components/ZoneAnalysis.jsx";
import { fetchHealth, fetchMonthlyTrend } from "../services/api.js";

export function Analysis() {
  const [health, setHealth] = useState(null);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    fetchMonthlyTrend()
      .then((rows) => setMonthlyTrend(Array.isArray(rows) ? rows : []))
      .catch((e) => setError(e.message || "Failed to load monthly trend"));
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
        <Link
          to="/station-trend"
          style={{
            background: "#0b1d31",
            color: "#f4faff",
            border: "1px solid #2f5c84",
            borderRadius: 10,
            padding: "8px 10px",
            minWidth: 220,
            textDecoration: "none",
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          Station-wise Monthly AQI
        </Link>
        {health && (
          <span style={{ fontSize: "0.85rem", color: "#15803d" }}>API: {health.status}</span>
        )}
      </section>

      {error && (
        <p style={{ color: "#b91c1c", margin: 0 }}>
          {error} — is the Flask server running on port 5000?
        </p>
      )}

      <section
        style={{
          background: "#10263f",
          border: "1px solid #244d73",
          borderRadius: 12,
          padding: "12px",
          height: 320,
        }}
      >
        <h3 style={{ margin: "0 0 12px", fontSize: "1.05rem", color: "#f2f9ff" }}>2023 AQI Trend</h3>
        <ResponsiveContainer>
          <LineChart data={monthlyTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f4568" />
            <XAxis dataKey="month" stroke="#b7d0e8" />
            <YAxis stroke="#b7d0e8" />
            <Tooltip />
            <Line type="monotone" dataKey="aqi" stroke="#4fc3f7" strokeWidth={3} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <ZoneAnalysis />
    </div>
  );
}
