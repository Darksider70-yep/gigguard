"""Evaluate SAC model against formula baseline."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Tuple

import numpy as np
from stable_baselines3 import SAC

from rl.gigguard_env import GigGuardEnv


@dataclass
class EvalMetrics:
    """Aggregated metrics for one policy strategy."""

    mean_premium: float
    purchase_rate: float
    loss_ratio: float
    mean_reward: float


def _formula_action(state: np.ndarray) -> np.ndarray:
    """Formula baseline action from current state."""
    zone_risk = float(state[0])
    multiplier = np.clip(0.8 + 0.5 * zone_risk, 0.5, 2.0)
    return np.array([multiplier], dtype=np.float32)


def _run_episode(env: GigGuardEnv, policy: str, model: SAC | None) -> Tuple[float, int, float, float]:
    """Run one episode and return premium sum, purchases, payout sum, reward sum."""
    total_premium = 0.0
    purchases = 0
    total_payout = 0.0
    total_reward = 0.0

    state, _ = env.reset()
    terminated = False
    while not terminated:
        if policy == "sac":
            assert model is not None
            action, _ = model.predict(state, deterministic=True)
        else:
            action = _formula_action(state)

        state, reward, terminated, _, info = env.step(action)
        total_reward += float(reward)
        total_premium += float(info["premium"])
        if bool(info["purchased"]):
            purchases += 1
        total_payout += float(info["payout"])

    return total_premium, purchases, total_payout, total_reward


def evaluate_model(model_path: str, episodes: int = 1_000) -> Dict[str, Dict[str, float]]:
    """Evaluate SAC and formula baselines on matched episode seeds."""
    model = SAC.load(model_path)

    sac_premiums: list[float] = []
    sac_purchases: list[int] = []
    sac_payouts: list[float] = []
    sac_rewards: list[float] = []

    formula_premiums: list[float] = []
    formula_purchases: list[int] = []
    formula_payouts: list[float] = []
    formula_rewards: list[float] = []

    for seed in range(episodes):
        np.random.seed(seed)
        sac_env = GigGuardEnv()
        sac_episode = _run_episode(sac_env, policy="sac", model=model)
        sac_env.close()

        np.random.seed(seed)
        formula_env = GigGuardEnv()
        formula_episode = _run_episode(formula_env, policy="formula", model=None)
        formula_env.close()

        sac_premiums.append(sac_episode[0])
        sac_purchases.append(sac_episode[1])
        sac_payouts.append(sac_episode[2])
        sac_rewards.append(sac_episode[3])

        formula_premiums.append(formula_episode[0])
        formula_purchases.append(formula_episode[1])
        formula_payouts.append(formula_episode[2])
        formula_rewards.append(formula_episode[3])

    def _metrics(premiums: list[float], purchases: list[int], payouts: list[float], rewards: list[float]) -> EvalMetrics:
        premium_total = float(np.sum(premiums))
        payout_total = float(np.sum(payouts))
        return EvalMetrics(
            mean_premium=float(np.mean(premiums) / 52.0),
            purchase_rate=float(np.sum(purchases) / (episodes * 52.0)),
            loss_ratio=float(payout_total / max(premium_total, 1e-8)),
            mean_reward=float(np.mean(rewards) / 52.0),
        )

    sac_metrics = _metrics(sac_premiums, sac_purchases, sac_payouts, sac_rewards)
    formula_metrics = _metrics(formula_premiums, formula_purchases, formula_payouts, formula_rewards)

    report = {
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "episodes": episodes,
        "sac": sac_metrics.__dict__,
        "formula": formula_metrics.__dict__,
    }
    output_path = os.path.join(os.path.dirname(model_path), "eval_report.json")
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)

    print("Metric          | SAC    | Formula")
    print(f"Mean premium    | Rs{sac_metrics.mean_premium:.1f} | Rs{formula_metrics.mean_premium:.1f}")
    print(f"Purchase rate   | {sac_metrics.purchase_rate:.2%} | {formula_metrics.purchase_rate:.2%}")
    print(f"Loss ratio      | {sac_metrics.loss_ratio:.2%} | {formula_metrics.loss_ratio:.2%}")
    print(f"Mean reward     | {sac_metrics.mean_reward:.2f} | {formula_metrics.mean_reward:.2f}")

    return report


def main() -> None:
    """CLI entrypoint for SAC evaluation."""
    model_path = os.getenv("SAC_MODEL_PATH")
    if not model_path:
        raise RuntimeError("SAC_MODEL_PATH environment variable is required")
    evaluate_model(model_path, episodes=1_000)


if __name__ == "__main__":
    main()

