from routes.air_quality import air_quality_bp
from routes.health import health_bp


def register_routes(app):
    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(air_quality_bp, url_prefix="/api/air-quality")
