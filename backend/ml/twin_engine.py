"""
Digital twin and projection logic only.
No HTTP or database access here.
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class TwinProjectionInput:
    pm25: float
    pm10: float
    co: Optional[float]
    humidity: Optional[float]


def project_air_quality(
    current: TwinProjectionInput,
    minutes_ahead: int = 60,
) -> dict:
    """
    Simple placeholder twin: gradual shift toward calmer baseline levels.
    Replace with trained models or physics-based simulation as needed.
    """
    if minutes_ahead <= 0:
        minutes_ahead = 1

    decay = min(1.0, minutes_ahead / 120.0)
    target_pm25 = 12.0
    target_pm10 = 20.0
    target_co = 1.0

    def blend(value: float, target: float) -> float:
        return value + (target - value) * decay * 0.15

    projected = {
        "pm25": round(blend(current.pm25, target_pm25), 2),
        "pm10": round(blend(current.pm10, target_pm10), 2),
        "co": round(blend(current.co or target_co, target_co), 3)
        if current.co is not None
        else None,
        "humidity": round(blend(current.humidity or 50.0, 50.0), 2)
        if current.humidity is not None
        else None,
        "minutes_ahead": minutes_ahead,
        "note": "placeholder twin; swap for your model",
    }
    return projected
