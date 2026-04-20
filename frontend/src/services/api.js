const base = "";

async function request(path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export function fetchHealth() {
  return request("/api/health");
}

export function fetchStations() {
  return request("/api/air-quality/stations");
}

export function fetchLatestAqi(stationName) {
  const q = new URLSearchParams({ station_name: stationName });
  return request(`/api/air-quality/latest?${q}`);
}

export function simulateIntervention(stationName, interventions = []) {
  return request("/api/air-quality/intervention", {
    method: "POST",
    body: JSON.stringify({ station_name: stationName, interventions }),
  });
}

export function fetchReadings(stationName) {
  const q = new URLSearchParams({ station_name: stationName });
  return request(`/api/air-quality/air-quality?${q}`);
}

export function fetchZoneSummary() {
  return request("/api/air-quality/zones");
}

export function fetchZonePollutants() {
  return request("/api/air-quality/zones-pollutants");
}

export function fetchMonthlyTrend() {
  return request("/api/air-quality/monthly-trend");
}

export function fetchStationTrend(stationName) {
  const q = new URLSearchParams({ station_name: stationName });
  return request(`/api/air-quality/station-trend?${q}`);
}

export function fetchTwinProjection(stationName, minutesAhead = 60) {
  const q = new URLSearchParams({ station_name: stationName });
  return request(`/api/air-quality/latest?${q}`);
}

export function postReading(body) {
  return request("/api/air-quality/intervention", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
