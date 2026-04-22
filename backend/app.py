import os

from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from config import get_config
from database.connection import init_db
from routes import register_routes
from services.live_data_service import live_data_service


load_dotenv()




def create_app():
    app = Flask(__name__)
    app.config.from_object(get_config())

    CORS(app, resources={r"/api/*": {"origins": os.getenv("CORS_ORIGINS", "*")}})
    init_db(app)
    register_routes(app)

    @app.get("/")
    def index():
        return jsonify(
            {
                "message": "AQI Digital Twin backend is running",
                "health": "/api/health",
            }
        )

    @app.route("/test-service")
    @app.route("/api/test-service")
    def test_service():
        from services.air_quality_service import AirQualityService

        service = AirQualityService()
        stations = service.get_all_stations()

        return {
            "count": len(stations),
            "data": stations
        }

    return app


app = create_app()


def _should_start_background_worker(flask_app: Flask) -> bool:
    if not flask_app.config.get("DEBUG", False):
        return True
    # In debug mode, start only in the reloader child process.
    return os.getenv("WERKZEUG_RUN_MAIN") == "true"


if _should_start_background_worker(app):
    live_data_service.start_background_fetch(app, interval_seconds=900)  # 15 minutes


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=app.config.get("DEBUG", False))
