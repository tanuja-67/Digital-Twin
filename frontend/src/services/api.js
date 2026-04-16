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

export function simulateIntervention(stationName, intervention) {
  return request("/api/air-quality/intervention", {
    method: "POST",
    body: JSON.stringify({ station_name: stationName, intervention }),
  });
}

export function fetchReadings(stationName) {
  const q = new URLSearchParams({ station_name: stationName });
  return request(`/api/air-quality/air-quality?${q}`);
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
