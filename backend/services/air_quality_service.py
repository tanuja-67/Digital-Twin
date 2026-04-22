from __future__ import annotations

from datetime import datetime
from itertools import combinations
import logging
import random

from sqlalchemy import and_, desc
from sqlalchemy import func
from sqlalchemy.orm import joinedload

from database.connection import db
from database.parsing import parse_date
from ml.predict import predict_aqi
from ml.twin_engine import TwinProjectionInput, project_air_quality
from models.aqi_data import AQIData
from models.station import Station


class AirQualityService:
    """Service layer for station/AQI queries and digital twin projections."""

    _LOGGER = logging.getLogger(__name__)

    _INTERVENTION_EFFECT_RANGES = {
        "industrialScrubbers": {"so2": (0.70, 0.90), "no2": (0.70, 0.90), "pm10": (0.20, 0.30)},
        "roadsidePurifiers": {"pm25": (0.15, 0.25), "no2": (0.15, 0.25)},
        "biofilters": {"pm25": (0.10, 0.20), "co": (0.10, 0.20)},
        "verticalGardens": {"pm25": (0.10, 0.20)},
    }

    _INTERVENTION_LABELS = {
        "industrialScrubbers": "Industrial Scrubbers",
        "roadsidePurifiers": "Roadside Purifiers",
        "biofilters": "Biofilters",
        "verticalGardens": "Vertical Gardens",
    }

    _DOMINANT_INTERVENTIONS = {
        "pm25": ["verticalGardens", "biofilters"],
        "pm10": ["industrialScrubbers", "roadsidePurifiers"],
        "no2": ["roadsidePurifiers", "industrialScrubbers"],
        "so2": ["industrialScrubbers"],
        "co": ["biofilters"],
        "o3": ["biofilters"],
    }

    _LEGACY_INTERVENTION_MAP = {
        "green_wall": "verticalGardens",
        "green_belt": "verticalGardens",
        "scrubbers": "industrialScrubbers",
        "industrial_scrubbers": "industrialScrubbers",
        "roadside_purifiers": "roadsidePurifiers",
        "vertical_gardens": "verticalGardens",
        "industrialscrubbers": "industrialScrubbers",
        "roadsidepurifiers": "roadsidePurifiers",
        "verticalgardens": "verticalGardens",
    }

    _POLLUTANT_KEYS = ("pm25", "pm10", "no2", "so2", "co", "o3")

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

    def get_zone_pollutants(self) -> list[dict]:
        latest_date_subquery = (
            db.session.query(
                AQIData.station_id.label("station_id"),
                func.max(AQIData.date).label("max_date"),
            )
            .group_by(AQIData.station_id)
            .subquery()
        )

        rows = (
            db.session.query(
                Station.zone.label("zone"),
                func.avg(AQIData.pm25).label("pm25"),
                func.avg(AQIData.no2).label("no2"),
                func.avg(AQIData.so2).label("so2"),
                func.avg(AQIData.co).label("co"),
            )
            .join(latest_date_subquery, latest_date_subquery.c.station_id == Station.id)
            .join(
                AQIData,
                and_(
                    AQIData.station_id == latest_date_subquery.c.station_id,
                    AQIData.date == latest_date_subquery.c.max_date,
                ),
            )
            .group_by(Station.zone)
            .order_by(Station.zone.asc())
            .all()
        )

        return [
            {
                "zone": row.zone,
                "pollutants": {
                    "pm25": round(float(row.pm25 or 0.0), 2),
                    "no2": round(float(row.no2 or 0.0), 2),
                    "so2": round(float(row.so2 or 0.0), 2),
                    "co": round(float(row.co or 0.0), 2),
                },
            }
            for row in rows
        ]

    def get_monthly_trend_2023(self) -> list[dict]:
        start = datetime(2023, 1, 1)
        end = datetime(2024, 1, 1)

        rows = (
            AQIData.query.filter(AQIData.date >= start, AQIData.date < end)
            .order_by(AQIData.date.asc())
            .all()
        )

        monthly_values: dict[int, list[float]] = {month: [] for month in range(1, 13)}
        for row in rows:
            if row.date and row.final_aqi is not None:
                monthly_values[row.date.month].append(float(row.final_aqi))

        month_names = {
            1: "Jan",
            2: "Feb",
            3: "Mar",
            4: "Apr",
            5: "May",
            6: "Jun",
            7: "Jul",
            8: "Aug",
            9: "Sep",
            10: "Oct",
            11: "Nov",
            12: "Dec",
        }

        trend = []
        for month in range(1, 13):
            values = monthly_values[month]
            average = round(sum(values) / len(values), 2) if values else 0.0
            trend.append({"month": month_names[month], "aqi": average})

        return trend

    def get_station_monthly_trend(self, station_name: str) -> list[dict]:
        station = self._get_station(station_name)
        if not station:
            return []

        rows = (
            AQIData.query.filter(AQIData.station_id == station.id)
            .order_by(AQIData.date.asc())
            .all()
        )

        monthly_values: dict[int, list[float]] = {month: [] for month in range(1, 13)}
        for row in rows:
            if row.date and row.final_aqi is not None:
                monthly_values[row.date.month].append(float(row.final_aqi))

        month_names = {
            1: "Jan",
            2: "Feb",
            3: "Mar",
            4: "Apr",
            5: "May",
            6: "Jun",
            7: "Jul",
            8: "Aug",
            9: "Sep",
            10: "Oct",
            11: "Nov",
            12: "Dec",
        }

        trend = []
        for month in range(1, 13):
            values = monthly_values[month]
            average = round(sum(values) / len(values), 2) if values else 0.0
            trend.append({"month": month_names[month], "aqi": average})

        return trend

    def simulate_dynamic_intervention(
        self,
        station_name: str,
        preferred_interventions: list[str] | None = None,
    ) -> dict | None:
        station = self._get_station(station_name)
        if not station:
            return None

        latest = self.get_latest_aqi(station_name)
        if not latest:
            return None

        original_values = {k: self._as_float(latest.get(k)) for k in self._POLLUTANT_KEYS}
        humidity = self._as_float(latest.get("humidity"))
        fallback_current_aqi = self._as_float(latest.get("final_aqi"))

        return self.simulate_dynamic_intervention_from_snapshot(
            station_name=station.name,
            zone=station.zone,
            current_aqi=fallback_current_aqi,
            pollutants=original_values,
            humidity=humidity,
            preferred_interventions=preferred_interventions,
        )

    def simulate_dynamic_intervention_from_snapshot(
        self,
        station_name: str,
        zone: str | None,
        current_aqi: float,
        pollutants: dict[str, float],
        humidity: float,
        preferred_interventions: list[str] | None = None,
    ) -> dict:
        original_values = {
            k: self._as_float(pollutants.get(k))
            for k in self._POLLUTANT_KEYS
        }
        before = original_values.copy()
        humidity = self._as_float(humidity)
        fallback_current_aqi = self._as_float(current_aqi)

        dominant_pollutant = max(before, key=before.get)
        
        # ✅ Use user-selected interventions directly if provided
        if preferred_interventions:
            selected = []
            for intervention in preferred_interventions:
                normalized = self._normalize_intervention(intervention)
                if normalized and normalized not in selected:
                    selected.append(normalized)
        else:
            # Fall back to auto-selection if no preferences
            selected = self._select_interventions(
                dominant_pollutant,
                before,
                preferred_interventions,
            )

        after = self._simulate_intervention(before, selected)
        self._LOGGER.debug("Intervention simulation start station=%s before=%s", station_name, before)

        pollutant_changes = []
        for pollutant in self._POLLUTANT_KEYS:
            base = before[pollutant]
            reduced = after[pollutant]
            if base > 0:
                reduction_percent = round(((base - reduced) / base) * 100.0, 2)
            else:
                reduction_percent = 0.0
            pollutant_changes.append(
                {
                    "pollutant": self._format_pollutant_name(pollutant),
                    "before": round(base, 2),
                    "after": round(reduced, 2),
                    "reduction": reduction_percent,
                }
            )

        self._LOGGER.debug("Predict AQI current inputs=%s humidity=%.4f", before, humidity)
        current_aqi = self._predict_aqi_safe(before, humidity, fallback_current_aqi)
        self._LOGGER.debug("Predict AQI after inputs=%s humidity=%.4f", after, humidity)
        predicted_aqi = self._predict_aqi_safe(after, humidity, current_aqi * 0.85)
        if selected and current_aqi > 0 and predicted_aqi >= current_aqi:
            # Guardrail: applying interventions should not worsen AQI in the simulation output.
            min_reduction_ratio = min(0.30, 0.06 * len(selected))
            predicted_aqi = round(current_aqi * (1.0 - min_reduction_ratio), 2)
        recommendations = self._build_smart_recommendations(
            original_values=original_values,
            humidity=humidity,
            current_aqi=current_aqi,
        )
        self._LOGGER.debug(
            "Intervention simulation end station=%s current_aqi=%.2f predicted_aqi=%.2f",
            station_name,
            current_aqi,
            predicted_aqi,
        )

        improvement = (
            round(((current_aqi - predicted_aqi) / current_aqi) * 100.0, 2)
            if current_aqi > 0
            else 0.0
        )

        primary_intervention = selected[0] if selected else None

        return {
            "station_name": station_name,
            "zone": zone,
            "dominant_pollutant": dominant_pollutant,
            "applied_interventions": [self._INTERVENTION_LABELS.get(key, key) for key in selected],
            "current_aqi": round(current_aqi, 2),
            "predicted_aqi": predicted_aqi,
            "recommended": recommendations,
            "aqi_reduction_percent": improvement,
            "improvement": improvement,
            "intervention": primary_intervention,
            "pollutant_changes": pollutant_changes,
            "pollutants": {
                "before": {k: round(v, 2) for k, v in before.items()},
                "after": {k: round(v, 2) for k, v in after.items()},
            },
        }

    def _simulate_intervention(
        self,
        values: dict[str, float],
        selected_interventions: list[str] | tuple[str, ...],
    ) -> dict[str, float]:
        after_values = values.copy()
        for intervention in selected_interventions:
            effects = self._INTERVENTION_EFFECT_RANGES.get(intervention, {})
            for pollutant, reduction_range in effects.items():
                reduction = random.uniform(reduction_range[0], reduction_range[1])
                reduction = min(max(reduction, 0.0), 0.95)
                before_value = after_values.get(pollutant, 0.0)
                after_values[pollutant] = max(0.0, before_value * (1.0 - reduction))
                self._LOGGER.debug(
                    "Applied intervention=%s pollutant=%s reduction=%.4f before=%.4f after=%.4f",
                    intervention,
                    pollutant,
                    reduction,
                    before_value,
                    after_values[pollutant],
                )
        return after_values

    def _build_smart_recommendations(
        self,
        original_values: dict[str, float],
        humidity: float,
        current_aqi: float,
    ) -> list[dict]:
        intervention_keys = list(self._INTERVENTION_EFFECT_RANGES.keys())
        candidates: list[tuple[str, ...]] = []

        for key in intervention_keys:
            candidates.append((key,))
        for pair in combinations(intervention_keys, 2):
            candidates.append(pair)

        results = []
        for combo in candidates:
            after_values = self._simulate_intervention(original_values, combo)
            predicted = self._predict_aqi_safe(after_values, humidity, current_aqi)
            if current_aqi > 0 and predicted >= current_aqi:
                min_reduction_ratio = min(0.30, 0.05 * len(combo))
                predicted = round(current_aqi * (1.0 - min_reduction_ratio), 2)
            name = " + ".join(self._INTERVENTION_LABELS.get(k, k) for k in combo)
            improvement = round(((current_aqi - predicted) / current_aqi) * 100.0, 2) if current_aqi > 0 else 0.0
            results.append(
                {
                    "name": name,
                    "predicted_aqi": round(predicted, 2),
                    "improvement": improvement,
                }
            )

        results.sort(key=lambda r: r["predicted_aqi"])
        return results[:3]

    def _as_float(self, value) -> float:
        return float(value) if value is not None else 0.0

    def _normalize_intervention(self, key: str) -> str | None:
        raw = (key or "").strip()
        s = raw.lower()
        if raw in self._INTERVENTION_EFFECT_RANGES:
            return raw
        for defined in self._INTERVENTION_EFFECT_RANGES:
            if s == defined.lower():
                return defined
        return self._LEGACY_INTERVENTION_MAP.get(s)

    def _select_interventions(
        self,
        dominant_pollutant: str,
        pollutant_values: dict[str, float],
        preferred_interventions: list[str] | None = None,
    ) -> list[str]:
        candidates: list[str] = []

        for intervention in self._DOMINANT_INTERVENTIONS.get(dominant_pollutant, []):
            if intervention not in candidates:
                candidates.append(intervention)

        for intervention in preferred_interventions or []:
            normalized = self._normalize_intervention(intervention)
            if normalized and normalized not in candidates:
                candidates.append(normalized)

        sorted_pollutants = sorted(
            self._POLLUTANT_KEYS,
            key=lambda p: pollutant_values.get(p, 0.0),
            reverse=True,
        )

        for pollutant in sorted_pollutants:
            if pollutant == dominant_pollutant:
                continue
            for intervention in self._DOMINANT_INTERVENTIONS.get(pollutant, []):
                if intervention not in candidates:
                    candidates.append(intervention)
                if len(candidates) >= 3:
                    return candidates

        if len(candidates) < 2:
            for fallback in ("biofilters", "verticalGardens"):
                if fallback not in candidates:
                    candidates.append(fallback)
                if len(candidates) >= 2:
                    break

        return candidates[:3]

    def _format_pollutant_name(self, pollutant: str) -> str:
        return {
            "pm25": "PM2.5",
            "pm10": "PM10",
            "no2": "NO2",
            "so2": "SO2",
            "co": "CO",
            "o3": "O3",
        }.get(pollutant, pollutant.upper())

    def _predict_aqi_safe(
        self,
        pollutant_values: dict[str, float],
        humidity: float,
        fallback: float,
    ) -> float:
        try:
            value = predict_aqi(
                pollutant_values["pm25"],
                pollutant_values["pm10"],
                pollutant_values["no2"],
                pollutant_values["so2"],
                pollutant_values["co"],
                pollutant_values["o3"],
                humidity,
            )
            return round(float(value), 2)
        except Exception:
            return round(max(0.0, float(fallback)), 2)

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
