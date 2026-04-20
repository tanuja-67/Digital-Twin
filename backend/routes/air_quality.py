from flask import Blueprint, jsonify, request

from services.air_quality_service import AirQualityService

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

    station = _get_station_details(station_name)
    if not station:
        return jsonify({"error": "station not found"}), 404

    preferred = []
    if isinstance(body.get("interventions"), list):
        preferred = [str(x) for x in body.get("interventions", [])]
    elif body.get("intervention"):
        preferred = [str(body.get("intervention"))]

    result = _service.simulate_dynamic_intervention(
        station_name=station_name,
        preferred_interventions=preferred,
    )
    if not result:
        return jsonify({"error": "no AQI data for station"}), 404

    return (
        jsonify(result),
        200,
    )

