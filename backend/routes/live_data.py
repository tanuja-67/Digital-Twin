from flask import Blueprint, jsonify, request

from services.live_data_service import live_data_service

live_data_bp = Blueprint("live_data", __name__)


@live_data_bp.get("/live-data")
def get_live_data():
    refresh = request.args.get("refresh", "0").strip().lower() in {"1", "true", "yes"}
    try:
        if refresh:
            try:
                rows = live_data_service.fetch_cycle_all_areas(force_refresh=True)
                return jsonify(rows), 200
            except Exception as e:
                # If refresh fails (timeout, API error), return stale data instead of erroring out
                rows = live_data_service.get_latest_all_areas()
                if any((row.get("timestamp") for row in rows)):
                    return jsonify(rows), 200
                raise e
        rows = live_data_service.get_latest_all_areas()
        if not any((row.get("timestamp") for row in rows)):
            rows = live_data_service.fetch_cycle_all_areas(force_refresh=True)
        return jsonify(rows), 200
    except Exception as exc:
        return jsonify({"error": f"failed to fetch live data: {exc}"}), 500


@live_data_bp.get("/live-data/history")
def get_live_data_history():
    # Deprecated in multi-area mode. Keep route to avoid breaking existing frontend callers.
    return jsonify([]), 200


@live_data_bp.get("/live-data/stations")
def get_live_data_for_stations():
    # Backward-compatible alias to new multi-area response.
    refresh = request.args.get("refresh", "0").strip().lower() in {"1", "true", "yes"}
    try:
        rows = live_data_service.fetch_cycle_all_areas(force_refresh=True) if refresh else live_data_service.get_latest_all_areas()
        return jsonify({"count": len(rows), "stations": rows}), 200
    except Exception as exc:
        return jsonify({"error": f"failed to fetch station live data: {exc}"}), 500