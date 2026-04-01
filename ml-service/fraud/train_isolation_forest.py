"""Train Isolation Forest fraud scorer on synthetic clean/fraud claims."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Tuple

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest

from premium.zones import ZONES

np.random.seed(42)

FEATURES = [
    'payout_amount_norm',
    'claim_freq_30d_norm',
    'hours_since_trigger',
    'zone_risk',
    'platform_enc',
    'account_age_norm',
]


def _zone_weights_by_worker_count() -> np.ndarray:
    multipliers = np.array([float(zone['zone_multiplier']) for zone in ZONES], dtype=np.float64)
    worker_counts = np.maximum(((1.55 - multipliers) * 120 + 40).astype(int), 5)
    weights = worker_counts / worker_counts.sum()
    return weights


def _build_training_data() -> Tuple[np.ndarray, np.ndarray]:
    clean_n = 1700
    fraud_n = 300

    zone_values = np.array([float(zone['zone_multiplier']) for zone in ZONES], dtype=np.float64)
    zone_weights = _zone_weights_by_worker_count()

    clean = np.column_stack(
        [
            np.random.beta(2, 5, clean_n) * 0.7,
            np.clip(np.random.poisson(1.0, clean_n) / 10.0, 0.0, 0.5),
            np.random.uniform(0.05, 8.0, clean_n) / 24.0,
            np.random.choice(zone_values, clean_n, p=zone_weights),
            np.random.randint(0, 2, clean_n).astype(float),
            np.random.uniform(30, 730, clean_n) / 365.0,
        ]
    )

    fraud = np.column_stack(
        [
            np.random.uniform(0.7, 1.0, fraud_n),
            np.random.uniform(0.4, 1.0, fraud_n),
            np.random.uniform(0.0, 0.5, fraud_n) / 24.0,
            np.random.uniform(1.2, 1.4, fraud_n),
            np.random.randint(0, 2, fraud_n).astype(float),
            np.random.uniform(1, 21, fraud_n) / 365.0,
        ]
    )

    x = np.vstack([clean, fraud]).astype(np.float64)
    y = np.array([0] * clean_n + [1] * fraud_n, dtype=np.int64)
    return x, y


def train(output_path: str | None = None) -> str:
    path = Path(output_path or 'models/isolation_forest.pkl')
    path.parent.mkdir(parents=True, exist_ok=True)

    x, y = _build_training_data()

    model = IsolationForest(
        n_estimators=200,
        contamination=0.15,
        random_state=42,
        max_samples='auto',
        max_features=1.0,
        n_jobs=-1,
    )
    model.fit(x)

    raw_scores = model.decision_function(x)
    min_score = float(np.percentile(raw_scores, 1))
    max_score = float(np.percentile(raw_scores, 99))

    denom = max(max_score - min_score, 1e-8)
    fraud_scores = 1 - (raw_scores - min_score) / denom
    fraud_scores = np.clip(fraud_scores, 0, 1)

    clean_mean = float(fraud_scores[:1700].mean())
    fraud_mean = float(fraud_scores[1700:].mean())

    print(f'Clean claims mean score: {clean_mean:.3f}  (target < 0.35)')
    print(f'Fraud claims mean score: {fraud_mean:.3f}  (target > 0.60)')

    assert clean_mean < 0.40, f'Clean claims scoring too high: {clean_mean}'
    assert fraud_mean > 0.55, f'Fraud claims scoring too low: {fraud_mean}'

    tier1 = int((fraud_scores < 0.30).sum())
    tier2 = int(((fraud_scores >= 0.30) & (fraud_scores < 0.65)).sum())
    tier3 = int((fraud_scores >= 0.65).sum())

    print(f'Tier 1 (auto-approve): {tier1} ({tier1 / 2000 * 100:.1f}%)')
    print(f'Tier 2 (provisional):  {tier2} ({tier2 / 2000 * 100:.1f}%)')
    print(f'Tier 3 (review):       {tier3} ({tier3 / 2000 * 100:.1f}%)')

    joblib.dump(
        {
            'model': model,
            'min_score': min_score,
            'max_score': max_score,
            'features': FEATURES,
            'contamination': 0.15,
            'n_train': 2000,
            'clean_mean_score': clean_mean,
            'fraud_mean_score': fraud_mean,
            'trained_at': datetime.now(timezone.utc).isoformat(),
            'validation': {
                'tier1_pct': float(tier1 / 2000),
                'tier2_pct': float(tier2 / 2000),
                'tier3_pct': float(tier3 / 2000),
            },
            'label_balance': {
                'clean': int((y == 0).sum()),
                'fraud': int((y == 1).sum()),
            },
        },
        path,
    )

    print(f'[OK] Isolation Forest saved to {path.as_posix()}')
    return str(path)


if __name__ == '__main__':
    train()

