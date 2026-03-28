"""Train Isolation Forest fraud scorer on synthetic claims."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest

from premium.zones import ZONES


def _build_training_matrix(seed: int = 42) -> np.ndarray:
    rng = np.random.default_rng(seed)
    zone_choices = np.array([float(zone["zone_multiplier"]) for zone in ZONES], dtype=np.float64)

    clean_n = 1700
    clean = np.column_stack(
        [
            rng.beta(2, 5, size=clean_n) * 0.7,
            np.clip(rng.poisson(1.0, size=clean_n) / 10.0, 0.0, 0.5),
            rng.uniform(0.05, 6.0, size=clean_n) / 24.0,
            rng.choice(zone_choices, size=clean_n, replace=True),
            rng.binomial(1, 0.5, size=clean_n).astype(np.float64),
            rng.uniform(30, 730, size=clean_n) / 365.0,
        ]
    )

    fraud_n = 300
    fraud = np.column_stack(
        [
            rng.uniform(0.7, 1.0, size=fraud_n),
            rng.uniform(0.4, 1.0, size=fraud_n),
            rng.uniform(0.0, 0.5, size=fraud_n) / 24.0,
            rng.uniform(1.2, 1.4, size=fraud_n),
            rng.binomial(1, 0.5, size=fraud_n).astype(np.float64),
            rng.uniform(1, 30, size=fraud_n) / 365.0,
        ]
    )
    return np.vstack([clean, fraud]).astype(np.float64)


def train(output_path: str | None = None) -> str:
    path = Path(output_path or os.getenv("IF_MODEL_PATH") or "models/isolation_forest.pkl")
    path.parent.mkdir(parents=True, exist_ok=True)

    x_train = _build_training_matrix(seed=42)
    model = IsolationForest(
        n_estimators=200,
        contamination=0.15,
        random_state=42,
        max_samples="auto",
        max_features=1.0,
    )
    model.fit(x_train)

    raw_scores = model.decision_function(x_train)
    min_score = float(np.percentile(raw_scores, 1))
    max_score = float(np.percentile(raw_scores, 99))

    joblib.dump(
        {
            "model": model,
            "min_score": min_score,
            "max_score": max_score,
            "contamination": 0.15,
            "n_train": int(x_train.shape[0]),
            "trained_at": datetime.now(timezone.utc).isoformat(),
        },
        path,
    )
    print(f"[Isolation Forest] Saved model at {path} (n_train={x_train.shape[0]})")
    return str(path)


if __name__ == "__main__":
    train()

