import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchZonePollutants } from "../services/api.js";

function getZoneColor(aqi) {
  if (aqi <= 100) return "#00e676";
  if (aqi <= 200) return "#ffea00";
  return "#ff5252";
}

export function computeZoneAnalysis(zonesData) {
  const ALLOWED_ZONES = ["Residential", "Green", "Industrial"];

  if (!zonesData || zonesData.length === 0) {
    return {
      zones: [],
      summary: {
        averageAQI: null,
        bestZone: null,
        worstZone: null,
      },
    };
  }

  // ✅ GROUP BY ZONE (only allowed zones)
  const grouped = {};

  zonesData.forEach((row) => {
    const zone = row.zone || "Unzoned";
    
    // Only include allowed zones
    if (!ALLOWED_ZONES.includes(zone)) {
      return;
    }

    if (!grouped[zone]) {
      grouped[zone] = {
        pm25: 0,
        no2: 0,
        so2: 0,
        co: 0,
        count: 0,
      };
    }

    grouped[zone].pm25 += Number(row?.pollutants?.pm25 || 0);
    grouped[zone].no2 += Number(row?.pollutants?.no2 || 0);
    grouped[zone].so2 += Number(row?.pollutants?.so2 || 0);
    grouped[zone].co += Number(row?.pollutants?.co || 0);
    grouped[zone].count += 1;
  });

  // ✅ COMPUTE AVG + AQI PER ZONE
  const zones = Object.keys(grouped).map((zone) => {
    const g = grouped[zone];

    const avg = {
      pm25: g.pm25 / g.count,
      no2: g.no2 / g.count,
      so2: g.so2 / g.count,
      co: g.co / g.count,
    };

    const aqi =
      0.5 * avg.pm25 +
      0.2 * avg.no2 +
      0.2 * avg.so2 +
      0.1 * avg.co;

    return {
      zone,
      aqi: Number(aqi.toFixed(2)),
      pollutants: avg,
    };
  });

  if (zones.length === 0) {
    return {
      zones: [],
      summary: {
        averageAQI: null,
        bestZone: null,
        worstZone: null,
      },
    };
  }

  // ✅ SUMMARY
  const total = zones.reduce((sum, z) => sum + z.aqi, 0);
  const averageAQI = Number((total / zones.length).toFixed(2));

  const best = zones.reduce((a, b) => (a.aqi <= b.aqi ? a : b));
  const worst = zones.reduce((a, b) => (a.aqi >= b.aqi ? a : b));

  return {
    zones,
    summary: {
      averageAQI,
      bestZone: best.zone,
      worstZone: worst.zone,
    },
  };
}

function StatCard({ label, value, color }) {
  return (
    <div
      style={{
        background: "#10263f",
        border: "1px solid #244d73",
        borderRadius: 12,
        padding: "12px",
        display: "grid",
        gap: 4,
      }}
    >
      <div style={{ color: "#9ec3e4", fontSize: "0.78rem", textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: color || "#f4fbff", fontSize: "1.2rem", fontWeight: 800 }}>{value ?? "N/A"}</div>
    </div>
  );
}

export function ZoneAnalysis() {
  const [zonesData, setZonesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const rows = await fetchZonePollutants();
        if (!mounted) return;
        setZonesData(Array.isArray(rows) ? rows : []);
      } catch (e) {
        if (mounted) setError(e.message || "Failed to load zone analysis");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const analysis = useMemo(() => computeZoneAnalysis(zonesData), [zonesData]);

  return (
    <section style={{ display: "grid", gap: "12px" }}>
      <h3 style={{ margin: 0, fontSize: "1.05rem", color: "#f2f9ff" }}>Zone Analysis</h3>

      {loading && <div style={{ color: "#b7d0e8" }}>Loading zone analysis...</div>}
      {error && <div style={{ color: "#ff9e9e" }}>{error}</div>}

      {!loading && !error && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
            <StatCard
              label="Average AQI"
              value={analysis.summary.averageAQI == null ? "N/A" : analysis.summary.averageAQI.toFixed(2)}
              color="#ffe082"
            />
            <StatCard label="Best Zone" value={analysis.summary.bestZone || "N/A"} color="#69f0ae" />
            <StatCard label="Worst Zone" value={analysis.summary.worstZone || "N/A"} color="#ff8a80" />
          </div>

          <div
            style={{
              background: "#10263f",
              border: "1px solid #244d73",
              borderRadius: 12,
              padding: "12px",
              height: 320,
            }}
          >
            <ResponsiveContainer>
              <BarChart data={analysis.zones}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f4568" />
                <XAxis dataKey="zone" stroke="#b7d0e8" />
                <YAxis stroke="#b7d0e8" />
                <Tooltip />
                <Bar dataKey="aqi" radius={[8, 8, 0, 0]}>
                  {analysis.zones.map((row) => (
                    <Cell key={row.zone} fill={getZoneColor(row.aqi)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}
