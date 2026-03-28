"""Unit tests for GNN feature encoding helpers."""

from __future__ import annotations

import numpy as np

from gnn.feature_encoding import (
    build_claim_features,
    build_event_features,
    build_upi_features,
    build_worker_features,
    encode_city,
    encode_platform,
    encode_trigger_type,
    normalise,
    pad_to_dim,
)


def test_platform_encoding_bounds() -> None:
    """Platform encoding should be float32 in [0, 1]."""
    value = encode_platform("swiggy")
    assert isinstance(value, np.floating)
    assert np.float32(0.0) <= value <= np.float32(1.0)


def test_city_unknown_fallback() -> None:
    """Unknown city should map to neutral midpoint value."""
    assert float(encode_city("unknown_city")) == 0.5


def test_trigger_encoding_unknown_maps_to_1() -> None:
    """Unknown trigger types should map to max bucket."""
    assert float(encode_trigger_type("nonexistent_trigger")) == 1.0


def test_normalise_clips_to_range() -> None:
    """normalise should clamp output to [0, 1]."""
    assert float(normalise(10.0, 5.0)) == 1.0
    assert float(normalise(-1.0, 5.0)) == 0.0


def test_worker_features_shape_dtype() -> None:
    """Worker features must be float32 with expected shape."""
    features = build_worker_features(
        {
            "platform": "zomato",
            "city": "mumbai",
            "zone_multiplier": 1.2,
            "claim_freq_30d": 2,
            "account_age_days": 180,
            "gnn_risk_score": 0.4,
        }
    )
    assert features.shape == (6,)
    assert features.dtype == np.float32
    assert np.all(features >= 0.0) and np.all(features <= 1.0)


def test_claim_event_upi_features_are_float32() -> None:
    """Claim/event/UPI features should remain float32."""
    claim = build_claim_features({"trigger_type": "flood", "payout_amount": 500, "fraud_score": 0.2, "disruption_hours": 4})
    event = build_event_features({"trigger_type": "flood", "affected_count": 120, "total_payout": 50000, "hours_active": 6})
    upi = build_upi_features({"worker_count": 5, "total_payouts_received": 12000, "unique_hex_count": 4, "account_age_days": 200})
    assert claim.dtype == np.float32
    assert event.dtype == np.float32
    assert upi.dtype == np.float32


def test_padding_adds_node_type_feature() -> None:
    """Padding should append node type encoding as final element."""
    padded = pad_to_dim(np.array([0.1, 0.2], dtype=np.float32), target_dim=7, node_type="event")
    assert padded.shape == (7,)
    assert padded.dtype == np.float32
    assert float(padded[-1]) == 0.5

