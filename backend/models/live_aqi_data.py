from database.connection import db


class LiveAQIData(db.Model):
    __tablename__ = "live_aqi_data"

    id = db.Column(db.Integer, primary_key=True)
    area = db.Column(db.String(120), nullable=False, index=True)
    city = db.Column(db.String(120), nullable=True, index=True)
    aqi = db.Column(db.Float, nullable=False)
    predicted_aqi = db.Column(db.Float, nullable=False)
    pm25 = db.Column(db.Float, nullable=False, default=0.0)
    pm10 = db.Column(db.Float, nullable=False, default=0.0)
    no2 = db.Column(db.Float, nullable=False, default=0.0)
    so2 = db.Column(db.Float, nullable=False, default=0.0)
    co = db.Column(db.Float, nullable=False, default=0.0)
    o3 = db.Column(db.Float, nullable=False, default=0.0)
    humidity = db.Column(db.Float, nullable=False, default=0.0)
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    timestamp = db.Column(db.DateTime, nullable=False, index=True)

    def to_api_dict(self) -> dict:
        pollutants = {
            "pm25": round(float(self.pm25 or 0.0), 2),
            "pm10": round(float(self.pm10 or 0.0), 2),
            "no2": round(float(self.no2 or 0.0), 2),
            "so2": round(float(self.so2 or 0.0), 2),
            "co": round(float(self.co or 0.0), 2),
            "o3": round(float(self.o3 or 0.0), 2),
        }
        return {
            "area": self.area,
            "aqi": round(float(self.aqi or 0.0), 2),
            "predicted_aqi": round(float(self.predicted_aqi or 0.0), 2),
            "pollutants": pollutants,
            "humidity": round(float(self.humidity or 0.0), 2),
            "latitude": round(float(self.latitude), 6) if self.latitude is not None else None,
            "longitude": round(float(self.longitude), 6) if self.longitude is not None else None,
            "timestamp": self.timestamp.isoformat() + "Z" if self.timestamp else None,
        }