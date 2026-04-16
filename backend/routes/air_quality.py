from flask import Blueprint, jsonify, request

from ml.predict import predict_aqi
from services.air_quality_service import AirQualityService

air_quality_bp = Blueprint("air_quality", __name__)
_service = AirQualityService()


def _station_exists(station_name: str) -> bool:
    stations = _service.get_all_stations()
    return any(s["name"] == station_name for s in stations)


def _get_station_details(station_name: str) -> dict | None:
    stations = _service.get_all_stations()
    for station in stations:
        if station["name"] == station_name:
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


def _get_suggestion(pm25, pm10, no2):
    if _value(pm25) > 100:
        return "Use green solutions like trees or walls"
    if _value(no2) > 50:
        return "Reduce traffic emissions"
    if _value(pm10) > 120:
        return "Apply dust control measures"
    return "Maintain current conditions"


def _apply_intervention(intervention: str, pm25, pm10, no2, so2, co, o3):
    out_pm25 = _value(pm25)
    out_pm10 = _value(pm10)
    out_no2 = _value(no2)
    out_so2 = _value(so2)
    out_co = _value(co)
    out_o3 = _value(o3)

    if intervention == "green_wall":
        out_pm25 *= 0.8
        out_pm10 *= 0.9
    elif intervention == "green_belt":
        out_pm25 *= 0.75
        out_co *= 0.85
    elif intervention == "scrubbers":
        out_pm25 *= 0.7
        out_so2 *= 0.7
        out_no2 *= 0.8

    return out_pm25, out_pm10, out_no2, out_so2, out_co, out_o3


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


@air_quality_bp.post("/intervention")
def intervention_simulation():
    body = request.get_json(silent=True) or {}
    station_name = str(body.get("station_name", "")).strip()
    intervention = str(body.get("intervention", "")).strip().lower()
    if not station_name:
        return jsonify({"error": "station_name is required"}), 400
    if intervention not in {"green_wall", "green_belt", "scrubbers"}:
        return (
            jsonify(
                {
                    "error": "invalid intervention. Use one of: green_wall, green_belt, scrubbers"
                }
            ),
            400,
        )

    station = _get_station_details(station_name)
    if not station:
        return jsonify({"error": "station not found"}), 404

    latest = _service.get_latest_aqi(station_name)
    if not latest:
        return jsonify({"error": "no AQI data for station"}), 404

    zone = str(station.get("zone") or "")

    pm25 = _value(latest.get("pm25"))
    pm10 = _value(latest.get("pm10"))
    no2 = _value(latest.get("no2"))
    so2 = _value(latest.get("so2"))
    co = _value(latest.get("co"))
    o3 = _value(latest.get("o3"))
    humidity = _value(latest.get("humidity"))
    final_aqi = _value(latest.get("final_aqi"))

    reduced_pm25, reduced_pm10, reduced_no2, reduced_so2, reduced_co, reduced_o3 = (
        _apply_intervention(intervention, pm25, pm10, no2, so2, co, o3)
    )

    try:
        predicted_aqi = predict_aqi(
            reduced_pm25,
            reduced_pm10,
            reduced_no2,
            reduced_so2,
            reduced_co,
            reduced_o3,
            humidity,
        )
    except Exception:
        # Fallback keeps API usable when model file is absent.
        predicted_aqi = round(max(0.0, final_aqi * 0.8), 2)

    current_aqi = final_aqi
    if final_aqi > 0:
        improvement = ((final_aqi - predicted_aqi) / final_aqi) * 100.0
    else:
        improvement = 0.0

    return (
        jsonify(
            {
                "station_name": station_name,
                "zone": zone,
                "intervention": intervention,
                "current_aqi": round(current_aqi, 2),
                "predicted_aqi": round(predicted_aqi, 2),
                "improvement": round(improvement, 2),
                "suggestion": _get_suggestion(pm25, pm10, no2),
            }
        ),
        200,
    )

