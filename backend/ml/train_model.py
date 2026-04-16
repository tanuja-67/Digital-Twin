from __future__ import annotations

from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score
from sklearn.model_selection import train_test_split

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_PATH = BASE_DIR / "data" / "merged_2023_aqi.csv"
MODEL_PATH = BASE_DIR / "ml" / "aqi_model.pkl"

FEATURES = ["pm25", "pm10", "no2", "so2", "co", "o3", "humidity"]
TARGET = "final_aqi"


def _load_and_prepare(path: Path) -> tuple[pd.DataFrame, pd.Series]:
    if not path.is_file():
        raise FileNotFoundError(f"Dataset not found: {path}")

    df = pd.read_csv(path)
    # Normalize common target naming.
    if TARGET not in df.columns and "FINAL_AQI" in df.columns:
        df = df.rename(columns={"FINAL_AQI": TARGET})

    missing = [c for c in FEATURES + [TARGET] if c not in df.columns]
    if missing:
        raise ValueError(f"Dataset missing required columns: {missing}")

    model_df = df[FEATURES + [TARGET]].copy()
    for col in FEATURES + [TARGET]:
        model_df[col] = pd.to_numeric(model_df[col], errors="coerce")
    model_df = model_df.dropna()
    x = model_df[FEATURES]
    y = model_df[TARGET]
    return x, y


def train_and_save_model() -> dict:
    x, y = _load_and_prepare(DATA_PATH)
    x_train, x_test, y_train, y_test = train_test_split(
        x, y, test_size=0.2, random_state=42
    )

    linear = LinearRegression()
    linear.fit(x_train, y_train)
    linear_pred = linear.predict(x_test)
    linear_r2 = r2_score(y_test, linear_pred)

    forest = RandomForestRegressor(n_estimators=100, random_state=42)
    forest.fit(x_train, y_train)
    forest_pred = forest.predict(x_test)
    forest_r2 = r2_score(y_test, forest_pred)

    print(f"Linear Regression R2: {linear_r2:.4f}")
    print(f"Random Forest R2: {forest_r2:.4f}")

    if forest_r2 > linear_r2:
        best_name = "RandomForestRegressor"
        best_model = forest
        best_r2 = forest_r2
    else:
        best_name = "LinearRegression"
        best_model = linear
        best_r2 = linear_r2

    payload = {"model": best_model, "features": FEATURES, "model_name": best_name}
    joblib.dump(payload, MODEL_PATH)
    print(f"Saved best model: {best_name} -> {MODEL_PATH}")

    return {
        "linear_r2": round(float(linear_r2), 6),
        "random_forest_r2": round(float(forest_r2), 6),
        "best_model": best_name,
        "best_r2": round(float(best_r2), 6),
        "saved_to": str(MODEL_PATH),
    }


if __name__ == "__main__":
    summary = train_and_save_model()
    print(summary)
