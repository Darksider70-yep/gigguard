"""Training script for Isolation Forest fraud model."""

from __future__ import annotations

import os
import pickle
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from sqlalchemy import text

from db.connection import session_scope

try:
    import joblib  # type: ignore[import-not-found]
except ModuleNotFoundError:  # pragma: no cover - dependency availability varies by runtime
    joblib = None

try:
    from sklearn.ensemble import IsolationForest
except ModuleNotFoundError as exc:  # pragma: no cover - dependency availability varies by runtime
    IsolationForest = None
    _SKLEARN_IMPORT_ERROR = exc
else:
    _SKLEARN_IMPORT_ERROR = None


FEATURE_COLUMNS = [
    "payout_amount_norm",
    "claim_freq_30d",
    "hours_since_trigger",
    "zone_risk",
    "platform_enc",
    "account_age_days_norm",
]


def _row_to_features(row: Dict[str, object]) -> Dict[str, float]:
    """Convert a DB row to normalized fraud features."""
    platform = str(row.get("platform", "zomato")).lower()
    return {
        "payout_amount_norm": float(row.get("payout_amount", 0.0)) / 1000.0,
        "claim_freq_30d": float(row.get("claim_freq_30d", 0.0)) / 10.0,
        "hours_since_trigger": float(row.get("hours_since_trigger", 0.0)) / 24.0,
        "zone_risk": float(row.get("zone_multiplier", 1.0)),
        "platform_enc": 1.0 if platform == "swiggy" else 0.0,
        "account_age_days_norm": float(row.get("account_age_days", 0.0)) / 365.0,
    }


def _fetch_training_rows() -> List[Dict[str, object]]:
    """Fetch historical claims/workers rows from PostgreSQL."""
    query = text(
        """
        SELECT
            c.id,
            c.payout_amount,
            COALESCE(c.claim_freq_30d, 0) AS claim_freq_30d,
            COALESCE(c.hours_since_trigger, 0) AS hours_since_trigger,
            w.zone_multiplier,
            w.platform,
            EXTRACT(DAY FROM (NOW() - w.created_at)) AS account_age_days,
            w.avg_daily_earning
        FROM claims c
        JOIN workers w ON c.worker_id = w.id
        WHERE c.status IN ('approved', 'denied')
        """
    )
    try:
        with session_scope() as session:
            rows = session.execute(query).mappings().all()
        return [dict(row) for row in rows]
    except Exception:
        # Service must remain operable even if historical columns are missing.
        return []


def _generate_synthetic_rows(seed: int = 42) -> pd.DataFrame:
    """Generate synthetic fraud/non-fraud rows when DB history is sparse."""
    rng = np.random.default_rng(seed)

    clean = pd.DataFrame(
        {
            "payout_amount_norm": rng.beta(2, 5, size=400) * 0.8,
            "claim_freq_30d": np.clip(rng.poisson(1.2, size=400) / 10.0, 0.0, 1.0),
            "hours_since_trigger": rng.uniform(0.0, 2.0, size=400) / 24.0,
            "zone_risk": rng.uniform(0.9, 1.3, size=400),
            "platform_enc": rng.integers(0, 2, size=400).astype(float),
            "account_age_days_norm": rng.uniform(30, 365, size=400) / 365.0,
        }
    )

    anomalous = pd.DataFrame(
        {
            "payout_amount_norm": rng.uniform(0.8, 1.0, size=100),
            "claim_freq_30d": rng.uniform(0.5, 1.0, size=100),
            "hours_since_trigger": rng.uniform(0.0, 0.1, size=100) / 24.0,
            "zone_risk": rng.uniform(1.3, 1.5, size=100),
            "platform_enc": rng.integers(0, 2, size=100).astype(float),
            "account_age_days_norm": rng.uniform(1, 14, size=100) / 365.0,
        }
    )
    return pd.concat([clean, anomalous], ignore_index=True)


def _prepare_training_data(rows: List[Dict[str, object]]) -> np.ndarray:
    """Prepare model matrix from DB rows or synthetic fallback."""
    if len(rows) < 50:
        synthetic = _generate_synthetic_rows()
        return synthetic[FEATURE_COLUMNS].to_numpy(dtype=np.float64)

    features = [_row_to_features(row) for row in rows]
    frame = pd.DataFrame(features)
    return frame[FEATURE_COLUMNS].to_numpy(dtype=np.float64)


def train_and_save_model(output_path: str) -> Tuple[int, float, float]:
    """Train IsolationForest and save model bundle."""
    if IsolationForest is None:
        raise RuntimeError(
            "scikit-learn is required to train Isolation Forest model. "
            f"Original error: {_SKLEARN_IMPORT_ERROR}"
        )

    rows = _fetch_training_rows()
    x_train = _prepare_training_data(rows)

    model = IsolationForest(
        n_estimators=200,
        contamination=0.15,
        random_state=42,
        max_samples="auto",
    )
    model.fit(x_train)

    decision_scores = model.decision_function(x_train)
    min_score = float(np.min(decision_scores))
    max_score = float(np.max(decision_scores))

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    payload = {
        "model": model,
        "min_score": min_score,
        "max_score": max_score,
        "features": FEATURE_COLUMNS,
    }
    if joblib is not None:
        joblib.dump(payload, output_path)
    else:
        with open(output_path, "wb") as handle:
            pickle.dump(payload, handle)

    return len(x_train), min_score, max_score


def main() -> None:
    """CLI entrypoint."""
    output_path = os.getenv("IF_MODEL_PATH")
    if not output_path:
        raise RuntimeError("IF_MODEL_PATH environment variable is required")

    n_samples, _, _ = train_and_save_model(output_path)
    print(f"Model saved. Contamination=0.15, n_samples={n_samples}")


if __name__ == "__main__":
    main()
