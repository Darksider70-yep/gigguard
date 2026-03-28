"""Flask integration tests for ML service routes."""

from __future__ import annotations

import importlib
import os
from pathlib import Path
from typing import Generator

import pytest


@pytest.fixture()
def client(tmp_path: Path) -> Generator:
    """Build Flask test client with isolated sqlite DB-backed environment."""
    db_file = tmp_path / "ml_service.db"
    os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{db_file}"
    os.environ["FLASK_ENV"] = "development"
    os.environ["ML_SERVICE_PORT"] = "5001"
    os.environ["SAC_MODEL_PATH"] = str(tmp_path / "missing_sac.zip")
    os.environ["IF_MODEL_PATH"] = str(tmp_path / "missing_if.pkl")
    os.environ["LOG_LEVEL"] = "INFO"

    app_module = importlib.import_module("app")
    importlib.reload(app_module)
    app = app_module.create_app()
    with app.test_client() as flask_client:
        yield flask_client


def test_health_endpoint(client) -> None:
    """Health endpoint should return status ok."""
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["status"] == "ok"


def test_predict_premium_endpoint(client) -> None:
    """Premium endpoint should return expected keys and bounded value."""
    response = client.post(
        "/predict-premium",
        json={
            "worker_id": "00000000-0000-0000-0000-000000000001",
            "zone_multiplier": 1.2,
            "weather_multiplier": 1.1,
            "history_multiplier": 0.9,
        },
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert 25.0 <= payload["premium"] <= 150.0
    assert "formula_breakdown" in payload


def test_score_fraud_endpoint(client) -> None:
    """Fraud endpoint should return normalized fraud score."""
    response = client.post(
        "/score-fraud",
        json={
            "worker_id": "00000000-0000-0000-0000-000000000002",
            "payout_amount": 320.0,
            "claim_freq_30d": 2,
            "hours_since_trigger": 0.25,
            "zone_multiplier": 1.4,
            "platform": "swiggy",
            "account_age_days": 180,
        },
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert 0.0 <= payload["fraud_score"] <= 1.0


def test_recommend_tier_endpoint(client) -> None:
    """Bandit recommend endpoint should return valid arm."""
    response = client.post(
        "/recommend-tier",
        json={
            "worker_id": "00000000-0000-0000-0000-000000000003",
            "context": {
                "platform": "zomato",
                "city": "mumbai",
                "experience_tier": "veteran",
                "season": "monsoon",
                "zone_risk": "high",
            },
        },
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert 0 <= payload["recommended_arm"] <= 3


def test_bandit_update_endpoint(client) -> None:
    """Bandit update endpoint should accept feedback updates."""
    response = client.post(
        "/bandit-update",
        json={
            "worker_id": "00000000-0000-0000-0000-000000000004",
            "context_key": "zomato_mumbai_veteran_monsoon_high",
            "arm": 2,
            "reward": 1.0,
        },
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True


def test_endpoints_handle_minimal_payloads(client) -> None:
    """Core POST endpoints should not fail on minimal input."""
    premium_res = client.post("/predict-premium", json={})
    fraud_res = client.post("/score-fraud", json={})
    recommend_res = client.post("/recommend-tier", json={})
    update_res = client.post("/bandit-update", json={})

    assert premium_res.status_code == 200
    assert fraud_res.status_code == 200
    assert recommend_res.status_code == 200
    assert update_res.status_code == 200
