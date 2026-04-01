#!/usr/bin/env python3
"""Verify GigGuard setup end-to-end."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg2
import requests

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
ML_SERVICE_URL = os.environ.get("ML_SERVICE_URL", "http://localhost:5001").rstrip("/")
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:4000").rstrip("/")


def check(label: str, fn):
    try:
        result = fn()
        print(f"  OK {label}: {result}")
        return True
    except Exception as exc:
        print(f"  FAIL {label}: {exc}")
        return False


def main() -> None:
    print("\nGigGuard Setup Verification")
    print("=" * 45)
    failures = 0

    print("\n[Model Files]")
    for artifact in [
        "ml-service/models/zone_model.pkl",
        "ml-service/models/isolation_forest.pkl",
        "ml-service/models/sac_premium_v1.zip",
        "ml-service/data/synthetic_graph.json",
    ]:
        if not check(artifact, lambda f=artifact: f"{Path(f).stat().st_size // 1024}KB"):
            failures += 1

    print("\n[Database]")
    if not DATABASE_URL:
        print("  FAIL DATABASE_URL: not set")
        failures += 1
    else:
        try:
            conn = psycopg2.connect(DATABASE_URL)
            cur = conn.cursor()
            for table, min_count in [
                ("workers", 100),
                ("policies", 200),
                ("disruption_events", 10),
                ("claims", 50),
                ("payouts", 30),
            ]:
                cur.execute(f"SELECT COUNT(*) FROM {table}")
                count = int(cur.fetchone()[0])
                ok = count >= min_count
                print(f"  {'OK' if ok else 'FAIL'} {table}: {count} rows (min {min_count})")
                if not ok:
                    failures += 1
            conn.close()
        except Exception as exc:
            print(f"  FAIL DB connection: {exc}")
            failures += 1

    print("\n[ML Service]")
    if not check("health", lambda: requests.get(f"{ML_SERVICE_URL}/health", timeout=3).json()["status"]):
        failures += 1
    if not check(
        "/predict-premium",
        lambda: requests.post(
            f"{ML_SERVICE_URL}/predict-premium",
            json={"worker_id": "test", "zone_multiplier": 1.2, "weather_multiplier": 1.1, "history_multiplier": 0.9},
            timeout=3,
        ).json()["premium"],
    ):
        failures += 1
    if not check(
        "/score-fraud",
        lambda: requests.post(
            f"{ML_SERVICE_URL}/score-fraud",
            json={
                "claim_id": "00000000-0000-0000-0000-000000000001",
                "worker_id": "test",
                "payout_amount": 320,
                "claim_freq_30d": 1,
                "hours_since_trigger": 0.5,
                "zone_multiplier": 1.2,
                "platform": "zomato",
                "account_age_days": 180,
            },
            timeout=3,
        ).json()["fraud_score"],
    ):
        failures += 1
    if not check(
        "/recommend-tier",
        lambda: requests.post(
            f"{ML_SERVICE_URL}/recommend-tier",
            json={
                "worker_id": "test",
                "context": {
                    "platform": "zomato",
                    "city": "mumbai",
                    "experience_tier": "mid",
                    "season": "monsoon",
                    "zone_risk": "high",
                },
            },
            timeout=3,
        ).json()["recommended_arm"],
    ):
        failures += 1
    if not check(
        "/zone-multipliers",
        lambda: len(requests.get(f"{ML_SERVICE_URL}/zone-multipliers", timeout=3).json()["multipliers"]),
    ):
        failures += 1

    print("\n[Backend]")
    if not check("health", lambda: requests.get(f"{BACKEND_URL}/health", timeout=3).json()["status"]):
        failures += 1

    print("\n" + "=" * 45)
    if failures == 0:
        print("All checks passed. GigGuard is ready for demo.\n")
    else:
        print(f"{failures} check(s) failed.\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
