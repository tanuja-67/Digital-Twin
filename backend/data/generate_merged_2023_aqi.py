from __future__ import annotations

from pathlib import Path

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent


def generate_merged_2023_aqi(
    aqi_path: Path | None = None,
    station_info_path: Path | None = None,
    output_path: Path | None = None,
) -> Path:
    """
    Generate merged_2023_aqi.csv by joining AQI data with station metadata.
    """
    aqi_file = aqi_path or (BASE_DIR / "aqi_2023.csv")
    station_file = station_info_path or (BASE_DIR / "stations_info.csv")
    out_file = output_path or (BASE_DIR / "merged_2023_aqi.csv")

    if not aqi_file.is_file():
        raise FileNotFoundError(f"AQI dataset not found: {aqi_file}")
    if not station_file.is_file():
        raise FileNotFoundError(f"Station metadata not found: {station_file}")

    # 1) Load AQI dataset.
    df_aqi = pd.read_csv(aqi_file)
    # 2) Load stations_info.csv.
    df_station = pd.read_csv(station_file)

    if "station" not in df_aqi.columns:
        raise ValueError("AQI dataset must contain 'station' column")
    if "station" not in df_station.columns:
        raise ValueError("stations_info.csv must contain 'station' column")

    # 3) Normalize station names before merge.
    df_aqi["station"] = df_aqi["station"].astype(str).str.strip()
    df_station["station"] = df_station["station"].astype(str).str.strip()

    # 4) Merge.
    merged = pd.merge(
        df_aqi,
        df_station,
        on="station",
        how="left",
    )

    # 5) Ensure station info columns exist.
    for column in ("latitude", "longitude", "zone"):
        if column not in merged.columns:
            merged[column] = None

    # 6) Print rows where latitude is null.
    print(merged[merged["latitude"].isnull()])

    # 7) Save merged_2023_aqi.csv.
    merged.to_csv(out_file, index=False)
    print(f"Saved merged file: {out_file}")
    print("Total rows in merged file:", len(merged))
    return out_file


if __name__ == "__main__":
    generate_merged_2023_aqi()
