"""Zone multiplier model based on zone-level historical risk features."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

import joblib
import numpy as np
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error
from sklearn.preprocessing import StandardScaler

from premium.zones import ZONES

FEATURE_NAMES = [
    "historical_rain_days_per_year",
    "historical_aqi_gt300_days",
    "historical_heat_gt44_days",
    "is_coastal",
    "avg_elevation_m",
    "city_risk_base",
]

CITY_RISK_BASE = {
    "mumbai": 1.0,
    "delhi": 0.9,
    "chennai": 0.7,
    "bangalore": 0.6,
    "hyderabad": 0.65,
}

MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "zone_model.pkl"
_MODEL_BUNDLE: Dict[str, object] | None = None
_ZONE_MULTIPLIER_CACHE: Dict[str, float] | None = None


def _to_feature_row(zone: Dict[str, object]) -> List[float]:
    city = str(zone["city"]).strip().lower()
    return [
        float(zone["historical_rain_days"]),
        float(zone["historical_aqi_gt300_days"]),
        float(zone["historical_heat_gt44_days"]),
        1.0 if bool(zone["is_coastal"]) else 0.0,
        float(zone["avg_elevation_m"]),
        float(CITY_RISK_BASE.get(city, 0.7)),
    ]


def _base_training_data() -> Tuple[np.ndarray, np.ndarray]:
    x = np.array([_to_feature_row(zone) for zone in ZONES], dtype=np.float64)
    y = np.array([float(zone["zone_multiplier"]) for zone in ZONES], dtype=np.float64)
    return x, y


def _augment_data(x_base: np.ndarray, y_base: np.ndarray, n_synthetic: int = 300) -> Tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(42)
    idx = rng.integers(0, x_base.shape[0], size=n_synthetic)
    sampled = x_base[idx].copy()
    sampled[:, 0] = np.clip(sampled[:, 0] + rng.normal(0.0, 5.0, size=n_synthetic), 0.0, None)
    sampled[:, 1] = np.clip(sampled[:, 1] + rng.normal(0.0, 3.0, size=n_synthetic), 0.0, None)
    sampled[:, 2] = np.clip(sampled[:, 2] + rng.normal(0.0, 2.0, size=n_synthetic), 0.0, None)
    sampled[:, 3] = np.clip(sampled[:, 3] + rng.normal(0.0, 0.02, size=n_synthetic), 0.0, 1.0)
    sampled[:, 4] = np.clip(sampled[:, 4] + rng.normal(0.0, 25.0, size=n_synthetic), 0.0, None)
    sampled[:, 5] = np.clip(sampled[:, 5] + rng.normal(0.0, 0.03, size=n_synthetic), 0.4, 1.1)

    y_syn = y_base[idx] + rng.normal(0.0, 0.02, size=n_synthetic)
    y_syn = np.clip(y_syn, 0.80, 1.40)

    x_all = np.vstack([x_base, sampled])
    y_all = np.concatenate([y_base, y_syn])
    return x_all, y_all


def train_zone_model(output_path: str | Path | None = None) -> Dict[str, object]:
    """Train and persist the zone multiplier model bundle."""
    path = Path(output_path) if output_path else MODEL_PATH
    path.parent.mkdir(parents=True, exist_ok=True)

    x_base, y_base = _base_training_data()
    x_train, y_train = _augment_data(x_base, y_base, n_synthetic=300)

    scaler = StandardScaler()
    x_scaled = scaler.fit_transform(x_train)

    model = Ridge(alpha=0.1)
    model.fit(x_scaled, y_train)
    preds = model.predict(x_scaled)
    mae = float(mean_absolute_error(y_train, preds))

    bundle: Dict[str, object] = {
        "model": model,
        "scaler": scaler,
        "feature_names": FEATURE_NAMES,
        "mae": mae,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "n_samples": int(x_train.shape[0]),
    }
    joblib.dump(bundle, path)

    global _MODEL_BUNDLE, _ZONE_MULTIPLIER_CACHE
    _MODEL_BUNDLE = bundle
    _ZONE_MULTIPLIER_CACHE = None
    return bundle


def _load_bundle() -> Dict[str, object]:
    global _MODEL_BUNDLE
    if _MODEL_BUNDLE is not None:
        return _MODEL_BUNDLE
    if not MODEL_PATH.exists():
        _MODEL_BUNDLE = train_zone_model(MODEL_PATH)
        return _MODEL_BUNDLE
    _MODEL_BUNDLE = joblib.load(MODEL_PATH)
    return _MODEL_BUNDLE


def predict_zone_multiplier(zone_features: Dict[str, object]) -> float:
    """Predict zone multiplier and clip to [0.80, 1.40]."""
    bundle = _load_bundle()
    model = bundle["model"]
    scaler = bundle["scaler"]

    row = np.array([_to_feature_row(zone_features)], dtype=np.float64)
    scaled = scaler.transform(row)
    pred = float(model.predict(scaled)[0])
    return float(np.clip(pred, 0.80, 1.40))


def get_all_zone_multipliers() -> Dict[str, float]:
    """Return predicted multipliers for all configured zones."""
    global _ZONE_MULTIPLIER_CACHE
    if _ZONE_MULTIPLIER_CACHE is not None:
        return dict(_ZONE_MULTIPLIER_CACHE)

    multipliers = {
        str(zone["zone_id"]): round(predict_zone_multiplier(zone), 4)
        for zone in ZONES
    }
    _ZONE_MULTIPLIER_CACHE = multipliers
    return dict(multipliers)


if __name__ == "__main__":
    trained = train_zone_model()
    print(
        f"[Zone Model] saved={MODEL_PATH} n_samples={trained['n_samples']} "
        f"mae={float(trained['mae']):.4f}"
    )

