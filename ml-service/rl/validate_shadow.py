"""Shadow-mode validation logic for RL premium policy."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List

import numpy as np
from sqlalchemy import create_engine, text


def _sigmoid(value: float) -> float:
    """Compute logistic sigmoid."""
    return float(1.0 / (1.0 + np.exp(-value)))


def _estimate_purchase_prob(premium: float) -> float:
    """Estimate purchase probability from premium."""
    return _sigmoid(3.0 - 0.05 * premium)


def _estimate_loss_ratio(premiums: np.ndarray, state_vectors: np.ndarray) -> float:
    """Estimate expected loss ratio from premium and state vectors."""
    zone_risk = np.clip(state_vectors[:, 0], 0.0, 2.0)
    purchase_prob = np.array([_estimate_purchase_prob(float(p)) for p in premiums], dtype=np.float64)
    claim_prob = np.clip(zone_risk * 0.25 + (premiums / 100.0) * 0.05, 0.0, 1.0)
    expected_payout = premiums * purchase_prob * claim_prob * (2.0 / 7.0)
    expected_premium = premiums * purchase_prob
    return float(np.sum(expected_payout) / max(np.sum(expected_premium), 1e-8))


def _fetch_shadow_rows(database_url: str) -> List[Dict[str, Any]]:
    """Fetch shadow log rows from database."""
    engine = create_engine(database_url, future=True)
    query = text(
        """
        SELECT worker_id, formula_premium, rl_premium, state_vector, formula_won
        FROM rl_shadow_log
        ORDER BY logged_at DESC
        """
    )
    with engine.connect() as connection:
        rows = connection.execute(query).mappings().all()
    engine.dispose()
    return [dict(row) for row in rows]


def validate_shadow(database_url: str) -> Dict[str, Any]:
    """Validate RL in shadow mode using logged formula vs RL decisions."""
    rows = _fetch_shadow_rows(database_url)
    if len(rows) < 500:
        report = {
            "recommendation": "needs_more_data",
            "rows": len(rows),
            "minimum_required": 500,
        }
        _write_report(report)
        return report

    formula_premium = np.array([float(row["formula_premium"]) for row in rows], dtype=np.float64)
    rl_premium = np.array([float(row["rl_premium"]) for row in rows], dtype=np.float64)
    state_vectors = np.array([np.array(row["state_vector"], dtype=np.float64) for row in rows], dtype=np.float64)

    formula_purchase_rate = float(np.mean([_estimate_purchase_prob(float(x)) for x in formula_premium]))
    rl_purchase_rate = float(np.mean([_estimate_purchase_prob(float(x)) for x in rl_premium]))

    formula_loss_ratio = _estimate_loss_ratio(formula_premium, state_vectors)
    rl_loss_ratio = _estimate_loss_ratio(rl_premium, state_vectors)

    if rl_loss_ratio < 0.75 and rl_purchase_rate > formula_purchase_rate:
        recommendation = "rl_ready"
    elif formula_loss_ratio < rl_loss_ratio and formula_purchase_rate >= rl_purchase_rate:
        recommendation = "formula_wins"
    else:
        recommendation = "needs_more_data"

    report = {
        "rows": len(rows),
        "formula_loss_ratio": formula_loss_ratio,
        "rl_loss_ratio": rl_loss_ratio,
        "formula_purchase_rate": formula_purchase_rate,
        "rl_purchase_rate": rl_purchase_rate,
        "recommendation": recommendation,
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
    }
    _write_report(report)
    return report


def _write_report(report: Dict[str, Any]) -> None:
    """Write validation report to models directory."""
    os.makedirs("models", exist_ok=True)
    with open("models/validation_report.json", "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)


def main() -> None:
    """CLI entrypoint for shadow validation."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable is required")
    report = validate_shadow(database_url)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
