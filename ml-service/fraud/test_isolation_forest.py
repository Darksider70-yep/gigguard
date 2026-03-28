"""Unit tests for Isolation Forest fraud scorer."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Dict, List

import numpy as np
import pytest

joblib = pytest.importorskip("joblib")
IsolationForest = pytest.importorskip("sklearn.ensemble").IsolationForest

from fraud.isolation_forest import FraudScorer


def _make_claim(overrides: Dict[str, float] | None = None) -> Dict[str, float | str]:
    base: Dict[str, float | str] = {
        "payout_amount": 320.0,
        "claim_freq_30d": 2.0,
        "hours_since_trigger": 0.25,
        "zone_multiplier": 1.2,
        "platform": "swiggy",
        "account_age_days": 120.0,
    }
    if overrides:
        base.update(overrides)
    return base


def _make_model_bundle(path: Path) -> None:
    rng = np.random.default_rng(42)
    x_train = rng.normal(0.0, 1.0, size=(200, 6))
    model = IsolationForest(n_estimators=100, contamination=0.15, random_state=42)
    model.fit(x_train)
    scores = model.decision_function(x_train)
    joblib.dump(
        {
            "model": model,
            "min_score": float(np.min(scores)),
            "max_score": float(np.max(scores)),
        },
        path,
    )


def test_scorer_loads_model(tmp_path: Path) -> None:
    """Scorer should load a valid serialized model bundle."""
    model_path = tmp_path / "if_model.pkl"
    _make_model_bundle(model_path)
    scorer = FraudScorer(str(model_path))
    assert scorer.loaded is True


def test_score_output_shape(tmp_path: Path) -> None:
    """score() should return all required keys."""
    model_path = tmp_path / "if_model.pkl"
    _make_model_bundle(model_path)
    scorer = FraudScorer(str(model_path))

    result = scorer.score(_make_claim())
    required = {"fraud_score", "tier", "flagged", "features_used", "scorer"}
    assert required.issubset(result.keys())


def test_fraud_score_range(tmp_path: Path) -> None:
    """Fraud score should always be clamped to [0, 1]."""
    model_path = tmp_path / "if_model.pkl"
    _make_model_bundle(model_path)
    scorer = FraudScorer(str(model_path))

    rng = np.random.default_rng(7)
    for _ in range(50):
        claim = _make_claim(
            {
                "payout_amount": float(rng.uniform(50, 1200)),
                "claim_freq_30d": float(rng.uniform(0, 15)),
                "hours_since_trigger": float(rng.uniform(0, 12)),
                "zone_multiplier": float(rng.uniform(0.8, 1.6)),
                "account_age_days": float(rng.uniform(1, 1200)),
            }
        )
        result = scorer.score(claim)
        assert 0.0 <= result["fraud_score"] <= 1.0


def test_tier_classification_thresholds(tmp_path: Path) -> None:
    """Tier boundaries should classify as expected."""
    model_path = tmp_path / "if_model.pkl"
    _make_model_bundle(model_path)
    scorer = FraudScorer(str(model_path))

    assert scorer.classify_tier(0.2) == 1
    assert scorer.classify_tier(0.4) == 2
    assert scorer.classify_tier(0.8) == 3


def test_missing_model_fallback() -> None:
    """Missing model should return safe fallback output."""
    scorer = FraudScorer("non_existent_model.pkl")
    result = scorer.score(_make_claim())
    assert result["fraud_score"] == 0.5
    assert result["flagged"] is False


def test_batch_score_size_and_latency(tmp_path: Path) -> None:
    """batch_score should return one output per claim and run faster than serial scoring."""
    model_path = tmp_path / "if_model.pkl"
    _make_model_bundle(model_path)
    scorer = FraudScorer(str(model_path))

    claims: List[Dict[str, float | str]] = [_make_claim({"payout_amount": 100 + i}) for i in range(200)]

    serial_start = time.perf_counter()
    serial_results = [scorer.score(claim) for claim in claims]
    serial_time = time.perf_counter() - serial_start

    batch_start = time.perf_counter()
    batch_results = scorer.batch_score(claims)
    batch_time = time.perf_counter() - batch_start

    assert len(batch_results) == 200
    assert len(serial_results) == 200
    assert batch_time < serial_time


def test_tier3_flags_as_true(tmp_path: Path) -> None:
    """Scores above 0.65 should be flagged tier-3."""
    model_path = tmp_path / "if_model.pkl"
    _make_model_bundle(model_path)
    scorer = FraudScorer(str(model_path))
    scorer._map_raw_score = lambda raw_score: 0.71  # type: ignore[method-assign]
    result = scorer.score(_make_claim())
    assert result["tier"] == 3
    assert result["flagged"] is True
