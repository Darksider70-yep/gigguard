"""Train SAC agent on GigGuardEnv."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import numpy as np
from stable_baselines3 import SAC
from stable_baselines3.common.callbacks import BaseCallback, EvalCallback
from stable_baselines3.common.env_checker import check_env
from stable_baselines3.common.env_util import make_vec_env

from rl.gigguard_env import GigGuardEnv


def evaluate_model(model: SAC, n_episodes: int = 200) -> Dict[str, Any]:
    env = GigGuardEnv()
    premiums: list[float] = []
    rewards: list[float] = []
    purchase_rates: list[float] = []
    loss_ratios: list[float] = []

    for _ in range(n_episodes):
        obs, _ = env.reset()
        episode_premiums: list[float] = []
        episode_rewards: list[float] = []
        episode_purchases = 0
        episode_payouts = 0.0
        done = False

        while not done:
            action, _ = model.predict(obs, deterministic=True)
            obs, reward, terminated, truncated, info = env.step(action)
            done = terminated or truncated
            episode_premiums.append(float(info["premium"]))
            episode_rewards.append(float(reward))
            if info["purchased"]:
                episode_purchases += 1
            if info["claim_filed"]:
                episode_payouts += float(info["payout"])

        total_premium = sum(episode_premiums)
        premiums.extend(episode_premiums)
        rewards.append(sum(episode_rewards))
        purchase_rates.append(episode_purchases / 52.0)
        loss_ratios.append(episode_payouts / max(total_premium, 1.0))

    env.close()
    mean_premium = float(np.mean(premiums)) if premiums else 0.0
    mean_loss_ratio = float(np.mean(loss_ratios)) if loss_ratios else 0.0
    return {
        "mean_premium": round(mean_premium, 2),
        "std_premium": round(float(np.std(premiums)) if premiums else 0.0, 2),
        "mean_reward": round(float(np.mean(rewards)) if rewards else 0.0, 4),
        "purchase_rate": round(float(np.mean(purchase_rates)) if purchase_rates else 0.0, 4),
        "loss_ratio": round(mean_loss_ratio, 4),
        "premium_in_target_range": bool(25 <= mean_premium <= 80),
        "loss_ratio_ok": bool(mean_loss_ratio < 0.80),
    }


def train() -> str:
    # 1) Validate environment
    env = GigGuardEnv()
    check_env(env, warn=True)
    env.close()

    # 2) Vectorized envs
    train_env = make_vec_env(GigGuardEnv, n_envs=2)
    eval_env = make_vec_env(GigGuardEnv, n_envs=1)

    # 3) Build model
    model = SAC(
        "MlpPolicy",
        train_env,
        learning_rate=3e-4,
        batch_size=256,
        buffer_size=50_000,
        learning_starts=1000,
        ent_coef="auto",
        target_update_interval=1,
        gradient_steps=1,
        verbose=1,
        seed=42,
        device="cpu",
        policy_kwargs={"net_arch": [64, 64]},
    )

    class MetricsCallback(BaseCallback):
        def __init__(self) -> None:
            super().__init__()
            self.episode_premiums: list[float] = []
            self.episode_rewards: list[float] = []

        def _on_step(self) -> bool:
            infos = self.locals.get("infos", [])
            for info in infos:
                if "premium" in info:
                    self.episode_premiums.append(float(info["premium"]))
                # reward stored by algorithm; we track env-derived as backup
                if "reward" in info:
                    self.episode_rewards.append(float(info["reward"]))
            return True

    metrics_cb = MetricsCallback()

    models_dir = Path("models")
    models_dir.mkdir(parents=True, exist_ok=True)
    eval_cb = EvalCallback(
        eval_env,
        best_model_save_path=str(models_dir),
        log_path=str(models_dir / "logs"),
        eval_freq=5000,
        n_eval_episodes=20,
        deterministic=True,
        verbose=0,
    )

    print(f"[SAC] Training started - {datetime.now(timezone.utc).isoformat()}")
    model.learn(total_timesteps=30_000, callback=[eval_cb, metrics_cb], progress_bar=True)

    model_path = models_dir / "sac_premium_v1"
    model.save(str(model_path))
    print("[SAC] Model saved to models/sac_premium_v1.zip")

    eval_results = evaluate_model(model, n_episodes=200)
    log = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "total_timesteps": 30_000,
        "eval_results": eval_results,
        "mean_premium_during_training": float(np.mean(metrics_cb.episode_premiums))
        if metrics_cb.episode_premiums
        else None,
    }
    with open(models_dir / "training_log.json", "w", encoding="utf-8") as handle:
        json.dump(log, handle, indent=2)
    print(f"[SAC] Training log saved. Eval results: {eval_results}")

    train_env.close()
    eval_env.close()
    return str(model_path.with_suffix(".zip"))


def train_sac_model(model_path: str) -> str:
    """Backward-compatible wrapper used by older tooling."""
    target = Path(model_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    cwd_before = Path.cwd()
    try:
        # Ensure expected relative output path exists.
        if cwd_before.name != "ml-service":
            os.chdir(target.parent.parent if target.parent.parent.exists() else cwd_before)
        trained = train()
        return trained
    finally:
        os.chdir(cwd_before)


if __name__ == "__main__":
    train()

