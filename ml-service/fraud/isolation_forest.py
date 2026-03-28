"""Isolation Forest Fraud Scorer."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import joblib
import numpy as np

try:
    from sklearn.ensemble import IsolationForest
except ModuleNotFoundError:  # pragma: no cover - optional dependency in constrained runtimes
    IsolationForest = None  # type: ignore[assignment]

from premium.zones import ZONES


class FraudScorer:
    """Isolation Forest based fraud scorer with calibrated [0,1] output."""

    FEATURES = [
        "payout_amount_norm",
        "claim_freq_30d_norm",
        "hours_since_trigger",
        "zone_risk",
        "platform_enc",
        "account_age_norm",
    ]

    def __init__(self, model_path: str) -> None:
        self.model_path = model_path
        self.model: Any = None
        self.min_score = -0.5
        self.max_score = 0.5
        self.loaded = False

        path = Path(model_path)
        if path.exists():
            try:
                self._load(path)
            except Exception:
                # Keep service alive even when model dependencies are unavailable.
                self.model = None
                self.loaded = False

    def _load(self, path: Path) -> None:
        payload = joblib.load(path)
        self.model = payload["model"]
        self.min_score = float(payload.get("min_score", self.min_score))
        self.max_score = float(payload.get("max_score", self.max_score))
        self.loaded = True

    def _zone_multipliers(self) -> np.ndarray:
        return np.array([float(zone["zone_multiplier"]) for zone in ZONES], dtype=np.float64)

    def _generate_training_matrix(self) -> np.ndarray:
        rng = np.random.default_rng(42)
        zone_choices = self._zone_multipliers()

        # Clean claims (1700)
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

        # Fraud claims (300)
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

    def _train_and_save(self, path: Path) -> None:
        if IsolationForest is None:
            raise RuntimeError("scikit-learn is required to train IsolationForest model")
        x_train = self._generate_training_matrix()
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

        path.parent.mkdir(parents=True, exist_ok=True)
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
        self.model = model
        self.min_score = min_score
        self.max_score = max_score
        self.loaded = True

    @staticmethod
    def classify_tier(fraud_score: float) -> int:
        if fraud_score < 0.30:
            return 1
        if fraud_score < 0.65:
            return 2
        return 3

    def _extract_features(self, claim: Dict[str, Any]) -> np.ndarray:
        payout_amount = float(claim.get("payout_amount", 0.0) or 0.0)
        claim_freq = float(claim.get("claim_freq_30d", claim.get("claims_in_30_days", 0.0)) or 0.0)
        hours_since_trigger = float(claim.get("hours_since_trigger", 0.0) or 0.0)
        zone_risk = float(claim.get("zone_multiplier", claim.get("zone_risk", 1.0)) or 1.0)
        platform_raw = str(claim.get("platform", "zomato")).strip().lower()
        platform_enc = 1.0 if platform_raw == "swiggy" else 0.0
        account_age_days = float(claim.get("account_age_days", 180.0) or 180.0)

        return np.array(
            [
                payout_amount / 1000.0,
                claim_freq / 10.0,
                hours_since_trigger / 24.0,
                zone_risk,
                platform_enc,
                account_age_days / 365.0,
            ],
            dtype=np.float64,
        )

    def _map_score(self, raw: float) -> float:
        denom = max(self.max_score - self.min_score, 1e-8)
        fraud_score = 1.0 - (float(raw) - self.min_score) / denom
        return float(np.clip(fraud_score, 0.0, 1.0))

    def _map_raw_score(self, raw_score: float) -> float:
        """Backward-compatible mapper hook used by tests."""
        return self._map_score(raw_score)

    def score(self, claim: Dict[str, Any]) -> Dict[str, Any]:
        features = self._extract_features(claim)

        if not self.loaded or self.model is None:
            fallback_score = 0.5
            tier = self.classify_tier(fallback_score)
            return {
                "fraud_score": round(fallback_score, 4),
                "tier": tier,
                "flagged": tier == 3,
                "bcs_score": int(round((1.0 - fallback_score) * 100)),
                "graph_flags": [],
                "gnn_fraud_score": None,
                "scorer": "isolation_forest",
                "features_used": dict(zip(self.FEATURES, features.tolist())),
            }

        raw = float(self.model.decision_function([features])[0])
        fraud_score = float(self._map_raw_score(raw))
        fraud_score = float(np.clip(fraud_score, 0.0, 1.0))
        tier = self.classify_tier(fraud_score)
        bcs = int(round((1.0 - fraud_score) * 100))
        return {
            "fraud_score": round(fraud_score, 4),
            "tier": tier,
            "flagged": tier == 3,
            "bcs_score": bcs,
            "graph_flags": [],
            "gnn_fraud_score": None,
            "scorer": "isolation_forest",
            "features_used": dict(zip(self.FEATURES, features.tolist())),
        }

    def batch_score(self, claims: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not claims:
            return []

        matrix = np.vstack([self._extract_features(claim) for claim in claims])

        if not self.loaded or self.model is None:
            results: List[Dict[str, Any]] = []
            for row in matrix:
                fallback_score = 0.5
                tier = self.classify_tier(fallback_score)
                results.append(
                    {
                        "fraud_score": round(fallback_score, 4),
                        "tier": tier,
                        "flagged": tier == 3,
                        "bcs_score": int(round((1.0 - fallback_score) * 100)),
                        "graph_flags": [],
                        "gnn_fraud_score": None,
                        "scorer": "isolation_forest",
                        "features_used": dict(zip(self.FEATURES, row.tolist())),
                    }
                )
            return results

        raws = self.model.decision_function(matrix)
        fraud_scores = np.array([self._map_raw_score(float(raw)) for raw in raws], dtype=np.float64)
        fraud_scores = np.clip(fraud_scores, 0.0, 1.0)
        results = []
        for row, score in zip(matrix, fraud_scores):
            fraud_score = float(score)
            tier = self.classify_tier(fraud_score)
            results.append(
                {
                    "fraud_score": round(fraud_score, 4),
                    "tier": tier,
                    "flagged": tier == 3,
                    "bcs_score": int(round((1.0 - fraud_score) * 100)),
                    "graph_flags": [],
                    "gnn_fraud_score": None,
                    "scorer": "isolation_forest",
                    "features_used": dict(zip(self.FEATURES, row.tolist())),
                }
            )
        return results
