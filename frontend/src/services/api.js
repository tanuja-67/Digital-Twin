import axios from "axios";

const client = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
  timeout: 20000,
});

async function request(path, options = {}) {
  try {
    const response = await client.request({
      url: path,
      method: options.method || "GET",
      data: options.body,
      params: options.params,
      headers: options.headers,
    });
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.error || error?.message || "Request failed";
    throw new Error(message);
  }
}

export function fetchHealth() {
  return request("/api/health");
}

export function fetchStations() {
  return request("/api/air-quality/stations");
}

export function fetchLatestAqi(stationName) {
  return request("/api/air-quality/latest", { params: { station_name: stationName } });
}

export function simulateIntervention(stationName, interventions = []) {
  return request("/api/air-quality/intervention", {
    method: "POST",
    body: { station_name: stationName, interventions },
  });
}

export function fetchReadings(stationName) {
  return request("/api/air-quality/air-quality", { params: { station_name: stationName } });
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
  return request("/api/air-quality/station-trend", { params: { station_name: stationName } });
}

export function fetchTwinProjection(stationName, minutesAhead = 60) {
  return request("/api/air-quality/latest", { params: { station_name: stationName, minutes_ahead: minutesAhead } });
}

export function postReading(body) {
  return request("/api/air-quality/intervention", {
    method: "POST",
    body,
  });
}

export function fetchLiveData(refresh = false) {
  return request("/api/live-data", {
    params: { refresh: refresh ? 1 : 0 },
  });
}

export function fetchLiveHistory(city, limit = 30) {
  return request("/api/live-data/history", {
    params: { city, limit },
  });
}
