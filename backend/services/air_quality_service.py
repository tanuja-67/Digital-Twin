from __future__ import annotations

from sqlalchemy import and_, desc
from sqlalchemy import func
from sqlalchemy.orm import joinedload

from database.connection import db
from database.parsing import parse_date
from ml.twin_engine import TwinProjectionInput, project_air_quality
from models.aqi_data import AQIData
from models.station import Station


class AirQualityService:
    """Service layer for station/AQI queries and digital twin projections."""

    def _aqi_record_to_dict(self, row: AQIData) -> dict:
        return {
            "date": row.date.isoformat() + "Z" if row.date else None,
            "pm25": row.pm25,
            "pm10": row.pm10,
            "no2": row.no2,
            "so2": row.so2,
            "co": row.co,
            "o3": row.o3,
            "humidity": row.humidity,
            "final_aqi": row.final_aqi,
        }

    def _get_station(self, station_name: str) -> Station | None:
        return Station.query.filter(Station.name == station_name).first()

    def get_all_stations(self) -> list[dict]:
        stations = Station.query.order_by(Station.name.asc()).all()
        return [
            {
                "name": station.name,
                "latitude": station.latitude,
                "longitude": station.longitude,
                "zone": station.zone,
            }
            for station in stations
        ]

    def get_station_aqi(self, station_name: str) -> list[dict]:
        station = self._get_station(station_name)
        if not station:
            return []

        rows = (
            AQIData.query.filter(AQIData.station_id == station.id)
            .order_by(AQIData.date.asc())
            .all()
        )
        return [self._aqi_record_to_dict(row) for row in rows]

    def get_latest_aqi(self, station_name: str) -> dict | None:
        station = self._get_station(station_name)
        if not station:
            return None

        row = (
            AQIData.query.filter(AQIData.station_id == station.id)
            .order_by(AQIData.date.desc())
            .first()
        )
        if not row:
            return None
        return self._aqi_record_to_dict(row)

    def get_zone_summary(self) -> list[dict]:
        rows = (
            db.session.query(
                Station.zone.label("zone"),
                func.avg(AQIData.final_aqi).label("average_aqi"),
                func.count(func.distinct(Station.id)).label("station_count"),
            )
            .join(AQIData, AQIData.station_id == Station.id)
            .group_by(Station.zone)
            .order_by(Station.zone.asc())
            .all()
        )
        return [
            {
                "zone": row.zone,
                "average_aqi": round(float(row.average_aqi), 2)
                if row.average_aqi is not None
                else None,
                "station_count": int(row.station_count or 0),
            }
            for row in rows
        ]

    # Compatibility helper used by existing route.
    def list_aqi(self, station_name: str | None = None, limit: int = 100):
        q = AQIData.query.options(joinedload(AQIData.station)).order_by(
            desc(AQIData.date)
        )
        if station_name:
            q = q.join(Station).filter(Station.name == station_name)
        return q.limit(limit).all()

    def create_aqi_row(
        self,
        station_name: str,
        latitude: float,
        longitude: float,
        zone: str | None,
        date_str: str,
        pm25: float,
        pm10: float,
        no2: float | None = None,
        so2: float | None = None,
        co: float | None = None,
        o3: float | None = None,
        humidity: float | None = None,
        final_aqi: float = 0.0,
    ) -> AQIData:
        station = Station.query.filter_by(name=station_name).first()
        if not station:
            station = Station(
                name=station_name,
                latitude=latitude,
                longitude=longitude,
                zone=zone,
            )
            db.session.add(station)
            db.session.flush()

        dt = parse_date(date_str)
        duplicate = AQIData.query.filter(
            and_(AQIData.station_id == station.id, AQIData.date == dt)
        ).first()
        if duplicate:
            return duplicate

        row = AQIData(
            station_id=station.id,
            date=dt,
            pm25=pm25,
            pm10=pm10,
            no2=no2,
            so2=so2,
            co=co,
            o3=o3,
            humidity=humidity,
            final_aqi=final_aqi,
        )
        db.session.add(row)
        db.session.commit()
        return row

    def project_for_station(self, station_name: str, minutes_ahead: int = 60):
        station = self._get_station(station_name)
        if not station:
            return None
        latest_row = (
            AQIData.query.filter(AQIData.station_id == station.id)
            .order_by(AQIData.date.desc())
            .first()
        )
        if not latest_row:
            return None
        twin_input = TwinProjectionInput(
            pm25=latest_row.pm25,
            pm10=latest_row.pm10,
            co=latest_row.co,
            humidity=latest_row.humidity,
        )
        return project_air_quality(twin_input, minutes_ahead=minutes_ahead)
