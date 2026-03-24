"""Isolation Forest based fraud scoring."""

from __future__ import annotations

import logging
import os
import pickle
from typing import Any, Dict, List

import numpy as np

try:
    import joblib  # type: ignore[import-not-found]
except ModuleNotFoundError:  # pragma: no cover - dependency availability varies by runtime
    joblib = None


LOGGER = logging.getLogger(__name__)


class FraudScorer:
    """Isolation Forest fraud scorer with fallback behavior."""

    FEATURES = [
        "payout_amount_norm",
        "claim_freq_30d",
        "hours_since_trigger",
        "zone_risk",
        "platform_enc",
        "account_age_days_norm",
    ]

    def __init__(self, model_path: str) -> None:
        """Load serialized model bundle if present."""
        self.model_path = model_path
        self.model: Any = None
        self.min_score = -0.5
        self.max_score = 0.5
        self.loaded = False

        if not os.path.exists(model_path):
            LOGGER.warning("IsolationForest model missing at %s", model_path)
            return

        if joblib is not None:
            bundle = joblib.load(model_path)
        else:
            with open(model_path, "rb") as handle:
                bundle = pickle.load(handle)
        self.model = bundle["model"]
        self.min_score = float(bundle.get("min_score", self.min_score))
        self.max_score = float(bundle.get("max_score", self.max_score))
        self.loaded = True

    def classify_tier(self, fraud_score: float) -> int:
        """Map fraud score to approval tier."""
        if fraud_score < 0.3:
            return 1
        if fraud_score <= 0.65:
            return 2
        return 3

    def _normalize_features(self, claim: Dict[str, Any]) -> np.ndarray:
        """Normalize raw claim fields into model feature vector."""
        payout_amount_norm = float(claim.get("payout_amount", 0.0)) / 1000.0
        claim_freq_30d = float(claim.get("claim_freq_30d", 0.0)) / 10.0
        hours_since_trigger = float(claim.get("hours_since_trigger", 0.0)) / 24.0
        zone_risk = float(claim.get("zone_multiplier", claim.get("zone_risk", 1.0)))
        platform = str(claim.get("platform", "zomato")).lower()
        platform_enc = 1.0 if platform == "swiggy" else 0.0
        account_age_days_norm = float(claim.get("account_age_days", 0.0)) / 365.0

        return np.array(
            [
                payout_amount_norm,
                claim_freq_30d,
                hours_since_trigger,
                zone_risk,
                platform_enc,
                account_age_days_norm,
            ],
            dtype=np.float64,
        )

    def _map_raw_score(self, raw_score: float) -> float:
        """Map IsolationForest decision function score to [0, 1] fraud score."""
        denominator = max(self.max_score - self.min_score, 1e-8)
        fraud_score = 1.0 - (float(raw_score) - self.min_score) / denominator
        return float(np.clip(fraud_score, 0.0, 1.0))

    def score(self, claim: Dict[str, Any]) -> Dict[str, Any]:
        """Score a single claim."""
        features = self._normalize_features(claim)

        if not self.loaded or self.model is None:
            fallback_score = 0.5
            return {
                "fraud_score": fallback_score,
                "tier": self.classify_tier(fallback_score),
                "flagged": False,
                "features_used": dict(zip(self.FEATURES, features.tolist())),
                "scorer": "isolation_forest",
            }

        raw_score = float(self.model.decision_function(features.reshape(1, -1))[0])
        fraud_score = self._map_raw_score(raw_score)
        tier = self.classify_tier(fraud_score)

        return {
            "fraud_score": fraud_score,
            "tier": tier,
            "flagged": fraud_score > 0.65,
            "features_used": dict(zip(self.FEATURES, features.tolist())),
            "scorer": "isolation_forest",
        }

    def batch_score(self, claims: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Vectorized scoring for a list of claims."""
        if not claims:
            return []

        feature_matrix = np.vstack([self._normalize_features(claim) for claim in claims])

        if not self.loaded or self.model is None:
            return [
                {
                    "fraud_score": 0.5,
                    "tier": self.classify_tier(0.5),
                    "flagged": False,
                    "features_used": dict(zip(self.FEATURES, row.tolist())),
                    "scorer": "isolation_forest",
                }
                for row in feature_matrix
            ]

        raw_scores = self.model.decision_function(feature_matrix)
        fraud_scores = np.array([self._map_raw_score(score) for score in raw_scores], dtype=np.float64)

        results: List[Dict[str, Any]] = []
        for row, fraud_score in zip(feature_matrix, fraud_scores):
            tier = self.classify_tier(float(fraud_score))
            results.append(
                {
                    "fraud_score": float(fraud_score),
                    "tier": tier,
                    "flagged": float(fraud_score) > 0.65,
                    "features_used": dict(zip(self.FEATURES, row.tolist())),
                    "scorer": "isolation_forest",
                }
            )
        return results
