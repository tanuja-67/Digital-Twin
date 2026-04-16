from sqlalchemy import UniqueConstraint

from database.connection import db


class AQIData(db.Model):
    __tablename__ = "aqi_data"

    id = db.Column(db.Integer, primary_key=True)
    station_id = db.Column(
        db.Integer,
        db.ForeignKey("stations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date = db.Column(db.DateTime, nullable=False, index=True)
    pm25 = db.Column(db.Float, nullable=False)
    pm10 = db.Column(db.Float, nullable=False)
    no2 = db.Column(db.Float, nullable=True)
    so2 = db.Column(db.Float, nullable=True)
    co = db.Column(db.Float, nullable=True)
    o3 = db.Column(db.Float, nullable=True)
    humidity = db.Column(db.Float, nullable=True)
    final_aqi = db.Column(db.Float, nullable=False)

    station = db.relationship("Station", back_populates="aqi_records")

    __table_args__ = (
        UniqueConstraint("station_id", "date", name="uq_aqi_station_date"),
    )

    def to_dict(self, include_station: bool = False):
        out = {
            "id": self.id,
            "station_id": self.station_id,
            "date": self.date.isoformat() + "Z" if self.date else None,
            "pm25": self.pm25,
            "pm10": self.pm10,
            "no2": self.no2,
            "so2": self.so2,
            "co": self.co,
            "o3": self.o3,
            "humidity": self.humidity,
            "final_aqi": self.final_aqi,
        }
        if include_station and self.station:
            out["station"] = self.station.to_dict()
        return out
