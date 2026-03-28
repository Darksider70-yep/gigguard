"""Node feature encoding utilities for GigGuard graph models."""

from __future__ import annotations

from typing import Dict

import numpy as np


CITY_VOCAB: Dict[str, float] = {
    "mumbai": 0.0,
    "delhi": 0.25,
    "chennai": 0.5,
    "bangalore": 0.75,
    "hyderabad": 1.0,
}

TRIGGER_VOCAB: Dict[str, float] = {
    "heavy_rainfall": 0.0,
    "extreme_heat": 0.2,
    "flood": 0.4,
    "severe_aqi": 0.6,
    "curfew": 0.8,
    "unknown": 1.0,
}

NODE_TYPE_ENCODING: Dict[str, float] = {
    "worker": 0.0,
    "claim": 0.25,
    "event": 0.5,
    "upi": 0.75,
}


def _to_float32(value: float) -> np.float32:
    """Convert scalar to float32."""
    return np.float32(value)


def normalise(value: float, max_val: float) -> np.float32:
    """Normalize and clip scalar into [0, 1]."""
    if max_val <= 0:
        return _to_float32(0.0)
    return _to_float32(float(np.clip(float(value) / float(max_val), 0.0, 1.0)))


def encode_platform(platform: str) -> np.float32:
    """Encode platform to [0, 1]."""
    return _to_float32(1.0 if str(platform).strip().lower() == "swiggy" else 0.0)


def encode_city(city: str) -> np.float32:
    """Encode city with fixed vocabulary and unknown fallback."""
    return _to_float32(CITY_VOCAB.get(str(city).strip().lower(), 0.5))


def encode_trigger_type(trigger_type: str) -> np.float32:
    """Encode trigger type with fixed mapping."""
    key = str(trigger_type).strip().lower()
    return _to_float32(TRIGGER_VOCAB.get(key, TRIGGER_VOCAB["unknown"]))


def encode_severity(affected_count: int) -> np.float32:
    """Encode event severity from affected worker count."""
    return normalise(float(affected_count), 500.0)


def build_worker_features(worker: Dict[str, float | str]) -> np.ndarray:
    """Build worker node features of shape (6,) float32."""
    features = np.array(
        [
            encode_platform(str(worker.get("platform", "zomato"))),
            encode_city(str(worker.get("city", "unknown"))),
            normalise(float(worker.get("zone_multiplier", 1.0)), 2.0),
            normalise(float(worker.get("claim_freq_30d", 0.0)), 10.0),
            normalise(float(worker.get("account_age_days", 0.0)), 365.0),
            _to_float32(float(np.clip(float(worker.get("gnn_risk_score", 0.0)), 0.0, 1.0))),
        ],
        dtype=np.float32,
    )
    return features


def build_claim_features(claim: Dict[str, float | str]) -> np.ndarray:
    """Build claim node features of shape (4,) float32."""
    return np.array(
        [
            encode_trigger_type(str(claim.get("trigger_type", "unknown"))),
            normalise(float(claim.get("payout_amount", 0.0)), 1000.0),
            _to_float32(float(np.clip(float(claim.get("fraud_score", 0.0)), 0.0, 1.0))),
            normalise(float(claim.get("disruption_hours", 0.0)), 24.0),
        ],
        dtype=np.float32,
    )


def build_event_features(event: Dict[str, float | str]) -> np.ndarray:
    """Build disruption-event node features of shape (4,) float32."""
    return np.array(
        [
            encode_trigger_type(str(event.get("trigger_type", "unknown"))),
            encode_severity(int(event.get("affected_count", 0))),
            normalise(float(event.get("total_payout", 0.0)), 500000.0),
            normalise(float(event.get("hours_active", 0.0)), 24.0),
        ],
        dtype=np.float32,
    )


def build_upi_features(upi: Dict[str, float | str]) -> np.ndarray:
    """Build UPI node features of shape (4,) float32."""
    return np.array(
        [
            normalise(float(upi.get("worker_count", 0.0)), 50.0),
            normalise(float(upi.get("total_payouts_received", 0.0)), 100000.0),
            normalise(float(upi.get("unique_hex_count", 0.0)), 20.0),
            normalise(float(upi.get("account_age_days", 0.0)), 365.0),
        ],
        dtype=np.float32,
    )


def pad_to_dim(features: np.ndarray, target_dim: int = 7, node_type: str = "worker") -> np.ndarray:
    """Pad feature vector to target_dim and append node-type encoding."""
    if target_dim < 2:
        raise ValueError("target_dim must be at least 2")

    node_enc = NODE_TYPE_ENCODING.get(node_type, 1.0)
    trimmed = np.asarray(features, dtype=np.float32)[: target_dim - 1]
    padded = np.zeros(target_dim - 1, dtype=np.float32)
    padded[: len(trimmed)] = trimmed
    result = np.concatenate([padded, np.array([node_enc], dtype=np.float32)]).astype(np.float32)
    return np.clip(result, 0.0, 1.0).astype(np.float32)

