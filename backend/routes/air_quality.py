from flask import Blueprint, jsonify, request

from services.air_quality_service import AirQualityService
from services.live_data_service import live_data_service

air_quality_bp = Blueprint("air_quality", __name__)
_service = AirQualityService()


def _station_exists(station_name: str) -> bool:
    needle = (station_name or "").strip().lower()
    stations = _service.get_all_stations()
    return any(str(s.get("name", "")).strip().lower() == needle for s in stations)


def _get_station_details(station_name: str) -> dict | None:
    needle = (station_name or "").strip().lower()
    stations = _service.get_all_stations()
    for station in stations:
        if str(station.get("name", "")).strip().lower() == needle:
            return station
    return None


def _value(x):
    return float(x) if x is not None else 0.0


def calculate_aqi(pm25, pm10, no2, so2, co, o3):
    """
    Simple placeholder AQI estimator from pollutant sub-indices.
    """
    subs = [
        _value(pm25) * 1.6,
        _value(pm10) * 1.0,
        _value(no2) * 1.2,
        _value(so2) * 1.0,
        _value(co) * 30.0,
        _value(o3) * 1.0,
    ]
    return round(max(subs), 2)

@air_quality_bp.get("/stations")
def get_stations():
    stations = _service.get_all_stations()
    return jsonify(stations), 200


@air_quality_bp.get("/air-quality")
def get_station_air_quality():
    station_name = request.args.get("station_name", "").strip()
    if not station_name or not _station_exists(station_name):
        return jsonify({"error": "station not found"}), 404

    records = _service.get_station_aqi(station_name)
    # Service returns sorted by date asc; endpoint requires latest first.
    records = sorted(records, key=lambda x: x.get("date") or "", reverse=True)
    return jsonify(records), 200


@air_quality_bp.get("/latest")
def get_latest_station_aqi():
    station_name = request.args.get("station_name", "").strip()
    if not station_name or not _station_exists(station_name):
        return jsonify({"error": "station not found"}), 404

    latest = _service.get_latest_aqi(station_name)
    if not latest:
        return jsonify({"error": "no AQI data for station"}), 404
    return jsonify(latest), 200


@air_quality_bp.get("/zones")
def get_zone_summary():
    summary = _service.get_zone_summary()
    return jsonify(summary), 200


@air_quality_bp.get("/zones-pollutants")
def get_zone_pollutants():
    rows = _service.get_zone_pollutants()
    return jsonify(rows), 200


@air_quality_bp.get("/monthly-trend")
def get_monthly_trend():
    rows = _service.get_monthly_trend_2023()
    return jsonify(rows), 200


@air_quality_bp.get("/station-trend")
def get_station_trend():
    station_name = request.args.get("station_name", "").strip()
    if not station_name or not _station_exists(station_name):
        return jsonify({"error": "station not found"}), 404

    rows = _service.get_station_monthly_trend(station_name)
    return jsonify(rows), 200


@air_quality_bp.post("/intervention")
def intervention_simulation():
    body = request.get_json(silent=True) or {}
    station_name = str(body.get("station_name", "")).strip()
    if not station_name:
        return jsonify({"error": "station_name is required"}), 400

    preferred = []
    if isinstance(body.get("interventions"), list):
        preferred = [str(x) for x in body.get("interventions", [])]
    elif body.get("intervention"):
        preferred = [str(body.get("intervention"))]

    station = _get_station_details(station_name)
    if station:
        result = _service.simulate_dynamic_intervention(
            station_name=station_name,
            preferred_interventions=preferred,
        )
        if result:
            return (
                jsonify(result),
                200,
            )

    # Fallback to latest live snapshot by area name.
    live_rows = live_data_service.get_latest_all_areas()
    needle = station_name.strip().lower()
    live_row = next(
        (row for row in live_rows if str(row.get("area", "")).strip().lower() == needle),
        None,
    )
    if not live_row:
        return jsonify({"error": "station/area not found"}), 404

    pollutants = live_row.get("pollutants") or {}
    result = _service.simulate_dynamic_intervention_from_snapshot(
        station_name=str(live_row.get("area") or station_name),
        zone=str(live_row.get("city") or "Live Area"),
        current_aqi=float(live_row.get("aqi") or 0.0),
        pollutants={
            "pm25": float(pollutants.get("pm25") or 0.0),
            "pm10": float(pollutants.get("pm10") or 0.0),
            "no2": float(pollutants.get("no2") or 0.0),
            "so2": float(pollutants.get("so2") or 0.0),
            "co": float(pollutants.get("co") or 0.0),
            "o3": float(pollutants.get("o3") or 0.0),
        },
        humidity=float(live_row.get("humidity") or 0.0),
        preferred_interventions=preferred,
    )

    return (
        jsonify(result),
        200,
    )

