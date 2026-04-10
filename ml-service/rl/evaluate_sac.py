"""Compare SAC agent vs formula baseline on identical episodes."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
from stable_baselines3 import SAC

from rl.gigguard_env import GigGuardEnv


def _formula_action(state: np.ndarray) -> np.ndarray:
    # Baseline formula around base 35 with risk adjustments.
    multiplier = float(np.clip(0.8 + 0.45 * float(state[0]), 0.5, 2.0))
    return np.array([multiplier], dtype=np.float32)


def _episode_rollout(env: GigGuardEnv, mode: str, model: SAC | None) -> Dict[str, float]:
    obs, _ = env.reset()
    premiums: List[float] = []
    rewards: List[float] = []
    purchases = 0
    payouts = 0.0
    done = False

    while not done:
        if mode == "sac":
            assert model is not None
            action, _ = model.predict(obs, deterministic=True)
        else:
            action = _formula_action(obs)

        obs, reward, terminated, truncated, info = env.step(action)
        done = terminated or truncated
        premiums.append(float(info["premium"]))
        rewards.append(float(reward))
        if info["purchased"]:
            purchases += 1
        if info["claim_filed"]:
            payouts += float(info["payout"])

    total_premium = float(sum(premiums))
    return {
        "mean_premium": float(np.mean(premiums)) if premiums else 0.0,
        "purchase_rate": purchases / 52.0,
        "loss_ratio": payouts / max(total_premium, 1.0),
        "mean_reward": float(np.mean(rewards)) if rewards else 0.0,
    }


def run_with_model(mode: str, seeds: List[int], model: SAC | None = None) -> Dict[str, float]:
    rows: List[Dict[str, float]] = []
    for seed in seeds:
        np.random.seed(seed)
        env = GigGuardEnv()
        rows.append(_episode_rollout(env, mode=mode, model=model))
        env.close()

    return {
        "mean_premium": float(np.mean([row["mean_premium"] for row in rows])) if rows else 0.0,
        "purchase_rate": float(np.mean([row["purchase_rate"] for row in rows])) if rows else 0.0,
        "loss_ratio": float(np.mean([row["loss_ratio"] for row in rows])) if rows else 0.0,
        "mean_reward": float(np.mean([row["mean_reward"] for row in rows])) if rows else 0.0,
    }


def compare_sac_vs_formula(n_episodes: int = 500, model_path: str = "models/sac_premium_v1.zip") -> Dict[str, Any]:
    env = GigGuardEnv()
    env.close()
    model = SAC.load(model_path)

    seeds = [i * 7 + 13 for i in range(n_episodes)]
    sac_results = run_with_model(mode="sac", seeds=seeds, model=model)
    formula_results = run_with_model(mode="formula", seeds=seeds, model=None)

    print("\n" + "=" * 55)
    print(f"{'Metric':<25} {'SAC':>12} {'Formula':>12}")
    print("=" * 55)
    metrics = [
        ("Mean premium (Rs)", sac_results["mean_premium"], formula_results["mean_premium"]),
        ("Purchase rate", sac_results["purchase_rate"], formula_results["purchase_rate"]),
        ("Loss ratio", sac_results["loss_ratio"], formula_results["loss_ratio"]),
        ("Mean reward", sac_results["mean_reward"], formula_results["mean_reward"]),
    ]
    for name, sac_val, formula_val in metrics:
        print(f"{name:<25} {sac_val:>12.3f} {formula_val:>12.3f}")
    print("=" * 55)

    winner = "SAC" if (
        sac_results["loss_ratio"] < formula_results["loss_ratio"]
        and sac_results["purchase_rate"] >= formula_results["purchase_rate"]
    ) else "FORMULA"
    print(f"\nRecommendation: {winner} performs better")

    report = {
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "n_episodes": n_episodes,
        "sac": sac_results,
        "formula": formula_results,
        "recommendation": "rl_ready" if winner == "SAC" else "formula_wins",
    }
    out = Path("models") / "eval_report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    return report


def evaluate_model(model_path: str, episodes: int = 500) -> Dict[str, Any]:
    """Backward-compatible wrapper."""
    return compare_sac_vs_formula(n_episodes=episodes, model_path=model_path)


if __name__ == "__main__":
    compare_sac_vs_formula()

