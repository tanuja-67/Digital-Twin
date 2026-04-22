from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
import requests
from sqlalchemy import text

from database.connection import db
from models.live_aqi_data import LiveAQIData


class LiveDataService:
    """Multi-area live AQI service with external API fallbacks and smart storage."""

    FEATURES = ["pm25", "pm10", "no2", "so2", "co", "o3", "humidity"]
    POLLUTANTS = ["pm25", "pm10", "no2", "so2", "co", "o3"]

    AREAS = [
        {
            "area": "ECIL Kapra",
            "city": "Hyderabad",
            "latitude": 17.470358,
            "longitude": 78.566894,
        },
        {
            "area": "Nacharam IALA",
            "city": "Hyderabad",
            "latitude": 17.429348,
            "longitude": 78.569297,
        },
        {
            "area": "Louis Braille Malakpet",
            "city": "Hyderabad",
            "latitude": 17.372073,
            "longitude": 78.50866,
        },
        {
            "area": "Khairthabad RTO Office",
            "city": "Hyderabad",
            "latitude": 17.417116,
            "longitude": 78.457475,
        },
        {
            "area": "Kompally",
            "city": "Hyderabad",
            "latitude": 17.544866,
            "longitude": 78.487001,
        },
        {
            "area": "Kokapet Community Hall",
            "city": "Hyderabad",
            "latitude": 17.393563,
            "longitude": 78.339247,
        },
        {
            "area": "Symphony Park RC Puram",
            "city": "Hyderabad",
            "latitude": 17.528552,
            "longitude": 78.286225,
        },
        {
            "area": "IIT Hyderabad",
            "city": "Hyderabad",
            "latitude": 17.58567,
            "longitude": 78.126225,
        },
        {
            "area": "IDA Pashamylaram",
            "city": "Hyderabad",
            "latitude": 17.527465,
            "longitude": 78.176807,
        },
        {
            "area": "Bollaram Industrial Area",
            "city": "Hyderabad",
            "latitude": 17.540891,
            "longitude": 78.358528,
        },
        {
            "area": "ICRISAT Patancheru",
            "city": "Hyderabad",
            "latitude": 17.514423,
            "longitude": 78.274611,
        },
        {
            "area": "Hyderabad Central University (HCU)",
            "city": "Hyderabad",
            "latitude": 17.460103,
            "longitude": 78.334361,
        },
        {
            "area": "Sanathnagar",
            "city": "Hyderabad",
            "latitude": 17.457121,
            "longitude": 78.443493,
        },
        {
            "area": "ZOO Park",
            "city": "Hyderabad",
            "latitude": 17.349694,
            "longitude": 78.451437,
        },
    ]

    _NEARBY_OFFSETS = [
        (0.0, 0.0),
        (0.01, 0.0),
        (-0.01, 0.0),
        (0.0, 0.01),
        (0.0, -0.01),
        (0.02, 0.0),
        (-0.02, 0.0),
        (0.0, 0.02),
        (0.0, -0.02),
    ]

    def __init__(self):
        self._logger = logging.getLogger(__name__)
        self._model = None
        self._model_features = list(self.FEATURES)
        self._thread: threading.Thread | None = None
        self._cycle_cache: dict[str, object] = {
            "fetched_at": None,
            "rows": [],
        }

    def _safe_float(self, value, default: float = 0.0) -> float:
        if value is None:
            return default
        try:
            out = float(value)
            if out != out:
                return default
            return out
        except (TypeError, ValueError):
            return default

    def extract_pollutant(self, data: dict | None, key: str) -> float:
        if not isinstance(data, dict):
            return 0.0
        raw = data.get(key)
        if isinstance(raw, dict):
            raw = raw.get("v")
        return self._safe_float(raw, default=0.0)

    def _ensure_live_table_columns(self) -> None:
        cols = db.session.execute(text("PRAGMA table_info(live_aqi_data)"))
        existing = {str(row[1]).lower() for row in cols}
        statements = []
        if "area" not in existing:
            statements.append("ALTER TABLE live_aqi_data ADD COLUMN area VARCHAR(120)")
        if "latitude" not in existing:
            statements.append("ALTER TABLE live_aqi_data ADD COLUMN latitude FLOAT")
        if "longitude" not in existing:
            statements.append("ALTER TABLE live_aqi_data ADD COLUMN longitude FLOAT")
        if "city" not in existing:
            statements.append("ALTER TABLE live_aqi_data ADD COLUMN city VARCHAR(120)")

        for sql in statements:
            db.session.execute(text(sql))
        if statements:
            db.session.commit()

    def _load_model(self):
        if self._model is not None:
            return self._model

        model_path_env = os.getenv("AQI_MODEL_PATH", "").strip()
        if model_path_env:
            candidate = Path(model_path_env)
            if not candidate.is_absolute():
                candidate = Path(__file__).resolve().parent.parent / candidate
            model_path = candidate
        else:
            model_path = Path(__file__).resolve().parent.parent / "ml" / "aqi_model.pkl"
        if not model_path.is_file():
            default_model_path = Path(__file__).resolve().parent.parent / "ml" / "aqi_model.pkl"
            if default_model_path.is_file():
                model_path = default_model_path
        if not model_path.is_file():
            raise FileNotFoundError(f"AQI model file not found: {model_path}")

        bundle = joblib.load(model_path)
        if isinstance(bundle, dict) and "model" in bundle:
            self._model = bundle["model"]
            model_features = bundle.get("features")
            if isinstance(model_features, list) and model_features:
                self._model_features = [str(x) for x in model_features]
        else:
            self._model = bundle
        return self._model

    def _predict_aqi(self, features_dict: dict[str, float]) -> float:
        model = self._load_model()
        base_row = {
            "pm25": self._safe_float(features_dict.get("pm25"), 0.0),
            "pm10": self._safe_float(features_dict.get("pm10"), 0.0),
            "no2": self._safe_float(features_dict.get("no2"), 0.0),
            "so2": self._safe_float(features_dict.get("so2"), 0.0),
            "co": self._safe_float(features_dict.get("co"), 0.0),
            "o3": self._safe_float(features_dict.get("o3"), 0.0),
            "humidity": self._safe_float(features_dict.get("humidity"), 0.0),
        }

        # If a model was trained without humidity, skip it transparently.
        chosen_features = [f for f in self._model_features if f in base_row]
        if not chosen_features:
            chosen_features = list(self.FEATURES)

        row = pd.DataFrame(
            [
                {key: base_row[key] for key in chosen_features}
            ]
        )
        prediction = float(model.predict(row[chosen_features])[0])
        return round(max(0.0, prediction), 2)

    def _estimate_aqi_from_pollutants(self, pollutants: dict[str, float]) -> float:
        subs = [
            self._safe_float(pollutants.get("pm25")) * 1.6,
            self._safe_float(pollutants.get("pm10")) * 1.0,
            self._safe_float(pollutants.get("no2")) * 1.2,
            self._safe_float(pollutants.get("so2")) * 1.0,
            self._safe_float(pollutants.get("co")) * 30.0,
            self._safe_float(pollutants.get("o3")) * 1.0,
        ]
        return round(max(subs), 2)

    def _fetch_waqi_geo(self, latitude: float, longitude: float) -> dict | None:
        token = os.getenv("WAQI_API_TOKEN", "").strip()
        if not token:
            self._logger.warning("WAQI token is missing (WAQI_API_TOKEN)")
            return None

        url = f"https://api.waqi.info/feed/geo:{latitude};{longitude}/"
        try:
            response = requests.get(url, params={"token": token}, timeout=12)
            response.raise_for_status()
            payload = response.json()
        except Exception as exc:
            self._logger.warning("WAQI geo request failed for (%s,%s): %s", latitude, longitude, exc)
            return None

        if payload.get("status") != "ok":
            return None

        data = payload.get("data") or {}
        iaqi = data.get("iaqi") or {}
        return {
            "aqi": self._safe_float(data.get("aqi"), 0.0),
            "pollutants": {key: self.extract_pollutant(iaqi, key) for key in self.POLLUTANTS},
            "humidity": self.extract_pollutant(iaqi, "h"),
        }

    def _fetch_waqi_with_nearby(self, latitude: float, longitude: float) -> dict | None:
        for d_lat, d_lon in self._NEARBY_OFFSETS:
            result = self._fetch_waqi_geo(latitude + d_lat, longitude + d_lon)
            if not result:
                continue
            if result["aqi"] > 0 or any((result.get("pollutants") or {}).values()):
                if d_lat != 0.0 or d_lon != 0.0:
                    self._logger.info(
                        "Using nearby WAQI location offset=(%s,%s) for (%s,%s)",
                        d_lat,
                        d_lon,
                        latitude,
                        longitude,
                    )
                return result
        return None

    def _prepare_payload(self, area_config: dict) -> dict:
        area = area_config["area"]
        city = area_config["city"]
        latitude = self._safe_float(area_config["latitude"], 0.0)
        longitude = self._safe_float(area_config["longitude"], 0.0)

        source = "waqi"
        fallbacks: list[str] = []

        waqi_data = self._fetch_waqi_with_nearby(latitude, longitude)
        if waqi_data is None:
            source = "waqi-unavailable"
            aqi = 0.0
            pollutants = {k: 0.0 for k in self.POLLUTANTS}
            humidity = 0.0
        else:
            aqi = self._safe_float(waqi_data.get("aqi"), 0.0)
            pollutants = waqi_data.get("pollutants") or {k: 0.0 for k in self.POLLUTANTS}
            humidity = self._safe_float(waqi_data.get("humidity"), 0.0)

        clean_pollutants = {
            key: self._safe_float(pollutants.get(key), 0.0)
            for key in self.POLLUTANTS
        }

        if aqi <= 0.0 and any(clean_pollutants.values()):
            aqi = self._estimate_aqi_from_pollutants(clean_pollutants)

        features = {
            "pm25": clean_pollutants["pm25"],
            "pm10": clean_pollutants["pm10"],
            "no2": clean_pollutants["no2"],
            "so2": clean_pollutants["so2"],
            "co": clean_pollutants["co"],
            "o3": clean_pollutants["o3"],
            "humidity": self._safe_float(humidity, 0.0),
        }
        predicted_aqi = self._predict_aqi(features)

        return {
            "area": area,
            "city": city,
            "aqi": round(self._safe_float(aqi, 0.0), 2),
            "predicted_aqi": predicted_aqi,
            "pollutants": {k: round(v, 2) for k, v in clean_pollutants.items()},
            "humidity": round(self._safe_float(humidity, 0.0), 2),
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "source": source,
            "fallbacks": fallbacks,
            "latitude": round(latitude, 6),
            "longitude": round(longitude, 6),
        }

    def _last_entry_for_area(self, area: str) -> LiveAQIData | None:
        return (
            LiveAQIData.query.filter(LiveAQIData.area == area)
            .order_by(LiveAQIData.timestamp.desc())
            .first()
        )

    def _store_if_changed(self, payload: dict) -> None:
        self._ensure_live_table_columns()
        last_row = self._last_entry_for_area(payload["area"])
        current_aqi = self._safe_float(payload.get("aqi"), 0.0)
        if last_row and abs(self._safe_float(last_row.aqi, 0.0) - current_aqi) < 1e-9:
            return

        pollutants = payload.get("pollutants") or {}
        row = LiveAQIData(
            area=payload["area"],
            city=payload.get("city"),
            aqi=current_aqi,
            predicted_aqi=self._safe_float(payload.get("predicted_aqi"), 0.0),
            pm25=self._safe_float(pollutants.get("pm25"), 0.0),
            pm10=self._safe_float(pollutants.get("pm10"), 0.0),
            no2=self._safe_float(pollutants.get("no2"), 0.0),
            so2=self._safe_float(pollutants.get("so2"), 0.0),
            co=self._safe_float(pollutants.get("co"), 0.0),
            o3=self._safe_float(pollutants.get("o3"), 0.0),
            humidity=self._safe_float(payload.get("humidity"), 0.0),
            latitude=self._safe_float(payload.get("latitude"), 0.0),
            longitude=self._safe_float(payload.get("longitude"), 0.0),
            timestamp=datetime.utcnow(),
        )
        db.session.add(row)
        db.session.commit()

    def fetch_cycle_all_areas(self, force_refresh: bool = False) -> list[dict]:
        cached_rows = self._cycle_cache.get("rows")
        if cached_rows and not force_refresh:
            return list(cached_rows)

        rows: list[dict] = []
        for area in self.AREAS:
            payload = self._prepare_payload(area)
            self._store_if_changed(payload)
            rows.append(payload)

        self._cycle_cache["fetched_at"] = datetime.now(timezone.utc)
        self._cycle_cache["rows"] = rows
        return rows

    def get_latest_all_areas(self) -> list[dict]:
        self._ensure_live_table_columns()
        latest_rows = (
            LiveAQIData.query.order_by(LiveAQIData.timestamp.desc())
            .limit(2000)
            .all()
        )

        by_area: dict[str, dict] = {}
        for row in latest_rows:
            key = str(row.area or "").strip()
            if not key or key in by_area:
                continue
            by_area[key] = row.to_api_dict()
            if len(by_area) >= len(self.AREAS):
                break

        output = []
        for area_cfg in self.AREAS:
            area = area_cfg["area"]
            if area in by_area:
                output.append(by_area[area])
                continue
            output.append(
                {
                    "area": area,
                    "aqi": 0.0,
                    "predicted_aqi": 0.0,
                    "pollutants": {k: 0.0 for k in self.POLLUTANTS},
                    "humidity": 0.0,
                    "latitude": area_cfg["latitude"],
                    "longitude": area_cfg["longitude"],
                    "timestamp": None,
                }
            )
        return output

    def start_background_fetch(self, app, interval_seconds: int = 10800) -> None:
        if self._thread and self._thread.is_alive():
            return

        def runner():
            with app.app_context():
                while True:
                    try:
                        self.fetch_cycle_all_areas(force_refresh=True)
                    except Exception as exc:
                        self._logger.exception("Background multi-area fetch failed: %s", exc)
                    time.sleep(max(60, interval_seconds))

        self._thread = threading.Thread(target=runner, name="aqi-multi-area-updater", daemon=True)
        self._thread.start()


live_data_service = LiveDataService()
