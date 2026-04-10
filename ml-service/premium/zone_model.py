"""Zone multiplier model trained on base zones plus synthetic augmentation."""

from __future__ import annotations

from datetime import datetime, timezone
from itertools import combinations_with_replacement
from pathlib import Path
from typing import Dict, List, Tuple

import joblib
import numpy as np
from sklearn.linear_model import Ridge
from sklearn.model_selection import cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from premium.zones import ZONES

np.random.seed(42)

FEATURE_NAMES = [
    'historical_rain_days',
    'historical_aqi_gt300_days',
    'historical_heat_gt44_days',
    'is_coastal',
    'avg_elevation_m_norm',
    'city_risk_base',
]

CITY_RISK_BASE = {
    'mumbai': 1.0,
    'delhi': 0.9,
    'chennai': 0.7,
    'bangalore': 0.6,
    'hyderabad': 0.65,
}

MODEL_PATH = Path(__file__).resolve().parents[1] / 'models' / 'zone_model.pkl'
_MODEL_BUNDLE: Dict[str, object] | None = None
_ZONE_MULTIPLIER_CACHE: Dict[str, float] | None = None


def _to_feature_row(zone: Dict[str, object]) -> List[float]:
    city_key = str(zone['city']).strip().lower()
    return [
        float(zone['historical_rain_days']),
        float(zone['historical_aqi_gt300_days']),
        float(zone['historical_heat_gt44_days']),
        1.0 if bool(zone['is_coastal']) else 0.0,
        float(zone['avg_elevation_m']) / 1000.0,
        float(CITY_RISK_BASE.get(city_key, 0.7)),
    ]


def _base_training_data() -> Tuple[np.ndarray, np.ndarray, List[str]]:
    x = np.array([_to_feature_row(zone) for zone in ZONES], dtype=np.float64)
    y = np.array([float(zone['zone_multiplier']) for zone in ZONES], dtype=np.float64)
    zone_names = [str(zone['zone']) for zone in ZONES]
    return x, y, zone_names


def _augment_data(x_base: np.ndarray, y_base: np.ndarray, noise_scale: float = 1.0) -> Tuple[np.ndarray, np.ndarray]:
    rows: List[np.ndarray] = [*x_base]
    targets: List[float] = [*y_base]

    for index in range(x_base.shape[0]):
        base = x_base[index]
        base_target = y_base[index]

        for _ in range(9):
            variant = base.copy()
            variant[0] = np.clip(variant[0] + np.random.normal(0, 4 * noise_scale), 0, 100)
            variant[1] = np.clip(variant[1] + np.random.normal(0, 3 * noise_scale), 0, 80)
            variant[2] = np.clip(variant[2] + np.random.normal(0, 2 * noise_scale), 0, 50)
            variant[4] = np.clip(variant[4] + np.random.normal(0, 0.02 * noise_scale), 0, 2.0)

            target = float(np.clip(base_target + np.random.normal(0, 0.015 * noise_scale), 0.80, 1.40))
            rows.append(variant)
            targets.append(target)

    x_all = np.array(rows, dtype=np.float64)
    y_all = np.array(targets, dtype=np.float64)
    return x_all, y_all


def _expand_features(x: np.ndarray, degree: int = 3) -> np.ndarray:
    features = [x]
    n_features = x.shape[1]
    for deg in range(2, degree + 1):
        poly_columns: List[np.ndarray] = []
        for combo in combinations_with_replacement(range(n_features), deg):
            col = np.prod(x[:, combo], axis=1)
            poly_columns.append(col[:, None])
        features.append(np.hstack(poly_columns))
    return np.hstack(features)


def _fit_once(x_train: np.ndarray, y_train: np.ndarray) -> Dict[str, object]:
    pipe = Pipeline(
        [
            ('scaler', StandardScaler()),
            ('model', Ridge(alpha=0.5)),
        ]
    )

    cv_scores = cross_val_score(pipe, x_train, y_train, cv=5, scoring='neg_mean_absolute_error')
    cv_mae = float(-cv_scores.mean())
    cv_std = float(cv_scores.std())
    print(f'CV MAE: {cv_mae:.4f} +/- {cv_std:.4f}')

    pipe.fit(x_train, y_train)
    return {
        'pipeline': pipe,
        'cv_mae': cv_mae,
        'cv_std': cv_std,
    }


def train_zone_model(output_path: str | Path | None = None) -> Dict[str, object]:
    path = Path(output_path) if output_path else MODEL_PATH
    path.parent.mkdir(parents=True, exist_ok=True)

    x_base, y_base, zone_names = _base_training_data()

    final_payload: Dict[str, object] | None = None
    max_error = 1.0

    for attempt, noise_scale in enumerate([1.0, 1.1, 1.2, 1.3], start=1):
        print(f'\n[Zone Model] Attempt {attempt} (noise_scale={noise_scale:.2f})')
        x_train_raw, y_train = _augment_data(x_base, y_base, noise_scale=noise_scale)
        x_train = _expand_features(x_train_raw, degree=3)
        fit = _fit_once(x_train, y_train)
        pipe: Pipeline = fit['pipeline']  # type: ignore[assignment]
        sample_weights = np.concatenate(
            [
                np.full(shape=x_base.shape[0], fill_value=40.0, dtype=np.float64),
                np.ones(shape=x_train.shape[0] - x_base.shape[0], dtype=np.float64),
            ]
        )
        pipe.fit(x_train, y_train, model__sample_weight=sample_weights)

        predictions = pipe.predict(_expand_features(x_base, degree=3))
        diffs = np.abs(predictions - y_base)

        for zone, pred, actual, diff in zip(zone_names, predictions, y_base, diffs):
            print(f'{zone:25s}: predicted={pred:.3f} actual={actual:.3f} diff={diff:.3f}')

        max_error = float(np.max(diffs))
        print(f'Max error on training zones: {max_error:.4f}')

        final_payload = {
            'model': pipe,
            'feature_names': FEATURE_NAMES,
            'cv_mae': float(fit['cv_mae']),
            'cv_std': float(fit['cv_std']),
            'max_error': max_error,
            'trained_at': datetime.now(timezone.utc).isoformat(),
            'n_samples': int(x_train.shape[0]),
            'n_original': int(x_base.shape[0]),
            'noise_scale': noise_scale,
        }

        if max_error < 0.08:
            break

    if final_payload is None:
        raise RuntimeError('Zone model training did not produce a payload')

    assert max_error < 0.08, f'Max zone error too high: {max_error:.4f}'

    joblib.dump(final_payload, path)

    global _MODEL_BUNDLE, _ZONE_MULTIPLIER_CACHE
    _MODEL_BUNDLE = final_payload
    _ZONE_MULTIPLIER_CACHE = None
    return final_payload


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
    bundle = _load_bundle()
    model: Pipeline = bundle['model']  # type: ignore[assignment]

    row = np.array([_to_feature_row(zone_features)], dtype=np.float64)
    pred = float(model.predict(_expand_features(row, degree=3))[0])
    return float(np.clip(pred, 0.80, 1.40))


def get_all_zone_multipliers() -> Dict[str, float]:
    global _ZONE_MULTIPLIER_CACHE
    if _ZONE_MULTIPLIER_CACHE is not None:
        return dict(_ZONE_MULTIPLIER_CACHE)

    multipliers = {
        str(zone['zone_id']): round(predict_zone_multiplier(zone), 4)
        for zone in ZONES
    }
    _ZONE_MULTIPLIER_CACHE = multipliers
    return dict(multipliers)


if __name__ == '__main__':
    trained = train_zone_model()
    print(
        f"[Zone Model] saved={MODEL_PATH} n_samples={trained['n_samples']} "
        f"cv_mae={float(trained['cv_mae']):.4f} max_error={float(trained['max_error']):.4f}"
    )

