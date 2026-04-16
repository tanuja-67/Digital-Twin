"""
Load cleaned CSV rows into Station and AQIData.
Stations are keyed by name: existing rows are reused (no duplicate stations).
AQI rows are skipped when (station_id, date) already exists.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import and_

from config import BASE_DIR
from database.connection import db
from database.parsing import parse_date, parse_optional_float
from models.aqi_data import AQIData
from models.station import Station

REQUIRED_COLUMNS = (
    "name",
    "latitude",
    "longitude",
    "zone",
    "date",
    "pm25",
    "pm10",
    "no2",
    "so2",
    "co",
    "o3",
    "humidity",
    "final_aqi",
)

COLUMN_ALIASES = {
    "station": "name",
    "final_aqi": "final_aqi",
    "FINAL_AQI": "final_aqi",
}

STATION_INFO_COLUMNS = {
    "Site Name": "name",
    "Latitude": "latitude",
    "Longitude": "longitude",
    "Zone Type": "zone",
}


def _get_or_create_station(
    name: str,
    latitude: float,
    longitude: float,
    zone: str | None,
) -> tuple[Station, bool]:
    existing = Station.query.filter_by(name=name).first()
    if existing:
        return existing, False
    station = Station(
        name=name,
        latitude=latitude,
        longitude=longitude,
        zone=zone,
    )
    db.session.add(station)
    db.session.flush()
    return station, True


def _read_csv_auto(path: Path) -> pd.DataFrame:
    """
    Read CSV and auto-handle comma/semicolon delimiters.
    """
    df = pd.read_csv(path)
    if len(df.columns) == 1:
        # If delimiter was semicolon, pandas default comma read collapses to one column.
        first_col = str(df.columns[0])
        if ";" in first_col:
            df = pd.read_csv(path, sep=";")
    return df


def _optional_cell(value: Any) -> Any:
    if pd.isna(value):
        return None
    return value


def _required_float(value: Any) -> float | None:
    if pd.isna(value):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _optional_float(value: Any) -> float | None:
    raw = _optional_cell(value)
    if raw is None:
        return None
    try:
        return parse_optional_float(raw)
    except (TypeError, ValueError):
        return None


def _normalize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    normalized = df.rename(columns=COLUMN_ALIASES).copy()
    return normalized


def _normalize_station_name(value: Any) -> str:
    text = str(value or "").strip().lower()
    return " ".join(text.split())


def _compact_station_key(value: Any) -> str:
    normalized = _normalize_station_name(value)
    return "".join(ch for ch in normalized if ch.isalnum())


def _merge_station_info_if_needed(df: pd.DataFrame, base_dir: Path) -> pd.DataFrame:
    needs_station_info = any(c not in df.columns for c in ("latitude", "longitude", "zone"))
    if not needs_station_info:
        return df

    station_info_path = base_dir / "data" / "stations_info.csv"
    if not station_info_path.is_file():
        raise FileNotFoundError(
            f"stations_info.csv not found: {station_info_path}. "
            "Provide this file to enrich station metadata."
        )

    station_df = _read_csv_auto(station_info_path).rename(columns=STATION_INFO_COLUMNS).copy()
    missing_station_cols = [c for c in ("name", "latitude", "longitude", "zone") if c not in station_df.columns]
    if missing_station_cols:
        raise ValueError(
            f"stations_info.csv missing columns after mapping: {missing_station_cols}"
        )

    aqi_df = df.copy()
    station_df["_station_key"] = station_df["name"].map(_normalize_station_name)
    station_df["_station_compact"] = station_df["name"].map(_compact_station_key)
    station_df = station_df.drop_duplicates(subset=["_station_key"], keep="first")

    station_records = station_df[
        ["_station_key", "_station_compact", "latitude", "longitude", "zone"]
    ].to_dict("records")
    by_exact = {r["_station_key"]: r for r in station_records}

    def resolve_station_meta(name: str) -> dict[str, Any] | None:
        key = _normalize_station_name(name)
        compact = _compact_station_key(name)

        exact = by_exact.get(key)
        if exact:
            return exact

        fuzzy = [
            r
            for r in station_records
            if compact and (compact in r["_station_compact"] or r["_station_compact"] in compact)
        ]
        if len(fuzzy) == 1:
            return fuzzy[0]
        return None

    meta_series = aqi_df["name"].map(resolve_station_meta)
    aqi_df["latitude"] = meta_series.map(
        lambda m: m["latitude"] if isinstance(m, dict) else None
    )
    aqi_df["longitude"] = meta_series.map(
        lambda m: m["longitude"] if isinstance(m, dict) else None
    )
    aqi_df["zone"] = meta_series.map(
        lambda m: m["zone"] if isinstance(m, dict) else None
    )
    return aqi_df


def load_csv_to_database(csv_path: str | Path | None = None) -> dict[str, int]:
    """
    Load cleaned CSV into SQLite via SQLAlchemy.
    Tables are created automatically when the Flask app initializes the database.

    Expected header (exact names):
      name,latitude,longitude,zone,date,pm25,pm10,no2,so2,co,o3,humidity,final_aqi

    Returns counts: stations_created, stations_reused, aqi_inserted, aqi_skipped, rows_read
    """
    path = Path(csv_path) if csv_path else BASE_DIR / "data" / "merged_2023_aqi.csv"
    if not path.is_file():
        raise FileNotFoundError(f"CSV not found: {path}")

    stats: dict[str, int] = {
        "rows_read": 0,
        "stations_created": 0,
        "stations_reused": 0,
        "aqi_inserted": 0,
        "aqi_skipped": 0,
    }

    db.session.query(AQIData).delete()
    db.session.query(Station).delete()
    db.session.commit()
    print("Database cleared before loading")

    df = _normalize_dataframe(_read_csv_auto(path))
    df = _merge_station_info_if_needed(df, BASE_DIR)
    print("Total rows in CSV:", len(df))

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(
            f"CSV missing columns: {missing}. Regenerate merged CSV with station info "
            "(latitude, longitude, zone) before loading."
        )

    unresolved_station_rows = df[df["latitude"].isnull() | df["longitude"].isnull()]
    if not unresolved_station_rows.empty:
        unresolved_names = sorted(set(unresolved_station_rows["name"].astype(str)))
        raise ValueError(
            "Could not resolve station metadata (latitude/longitude) for: "
            f"{unresolved_names}. Please update stations_info.csv station names."
        )

    for _, row in df.iterrows():
        stats["rows_read"] += 1
        name = str(_optional_cell(row["name"]) or "").strip()
        if not name:
            continue

        lat = float(row["latitude"])
        lon = float(row["longitude"])
        zone_raw = str(_optional_cell(row["zone"]) or "").strip()
        zone = zone_raw if zone_raw else None

        station, created = _get_or_create_station(name, lat, lon, zone)
        if created:
            stats["stations_created"] += 1
        else:
            stats["stations_reused"] += 1

        date_value = _optional_cell(row["date"])
        pm25_value = _required_float(row["pm25"])
        pm10_value = _required_float(row["pm10"])
        final_aqi_value = _required_float(row["final_aqi"])
        if (
            date_value is None
            or pm25_value is None
            or pm10_value is None
            or final_aqi_value is None
        ):
            stats["aqi_skipped"] += 1
            continue

        dt = parse_date(str(date_value))
        exists = AQIData.query.filter(
            and_(AQIData.station_id == station.id, AQIData.date == dt)
        ).first()
        if exists:
            stats["aqi_skipped"] += 1
            continue

        aqi = AQIData(
            station_id=station.id,
            date=dt,
            pm25=pm25_value,
            pm10=pm10_value,
            no2=_optional_float(row["no2"]),
            so2=_optional_float(row["so2"]),
            co=_optional_float(row["co"]),
            o3=_optional_float(row["o3"]),
            humidity=_optional_float(row["humidity"]),
            final_aqi=final_aqi_value,
        )
        db.session.add(aqi)
        stats["aqi_inserted"] += 1

    db.session.commit()

    return stats


if __name__ == "__main__":
    from app import create_app

    application = create_app()
    with application.app_context():
        summary = load_csv_to_database()
        print(summary)
