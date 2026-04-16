import os

from flask import Flask, jsonify
from flask_cors import CORS

from config import get_config
from database.connection import init_db
from routes import register_routes




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


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=app.config.get("DEBUG", False))
