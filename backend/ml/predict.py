from __future__ import annotations

from pathlib import Path

import joblib
import pandas as pd

MODEL_PATH = Path(__file__).resolve().parent / "aqi_model.pkl"
FEATURES = ["pm25", "pm10", "no2", "so2", "co", "o3", "humidity"]


def _load_model_bundle():
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(
            f"Model file not found at {MODEL_PATH}. Run `python -m ml.train_model` first."
        )
    return joblib.load(MODEL_PATH)


def predict_aqi(pm25, pm10, no2, so2, co, o3, humidity) -> float:
    bundle = _load_model_bundle()
    model = bundle["model"]
    feature_order = bundle.get("features", FEATURES)

    row = pd.DataFrame(
        [
            {
                "pm25": float(pm25),
                "pm10": float(pm10),
                "no2": float(no2),
                "so2": float(so2),
                "co": float(co),
                "o3": float(o3),
                "humidity": float(humidity),
            }
        ]
    )
    x = row[feature_order]
    pred = float(model.predict(x)[0])
    pred = max(0.0, pred)  # Safety: AQI cannot be negative.
    return round(pred, 2)
