"""SAC training script for GigGuard premium optimization."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Callable

from stable_baselines3 import SAC
from stable_baselines3.common.callbacks import EvalCallback
from stable_baselines3.common.vec_env import DummyVecEnv, SubprocVecEnv

from rl.gigguard_env import GigGuardEnv


def _make_env() -> Callable[[], GigGuardEnv]:
    """Create environment factory for vectorized training."""
    def _init() -> GigGuardEnv:
        return GigGuardEnv()

    return _init


def train_sac_model(model_path: str) -> str:
    """Train SAC policy and save best/final model artifacts."""
    train_env = SubprocVecEnv([_make_env(), _make_env()])
    eval_env = DummyVecEnv([_make_env()])

    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    best_dir = os.path.dirname(model_path)

    callback = EvalCallback(
        eval_env,
        best_model_save_path=best_dir,
        log_path=best_dir,
        eval_freq=5_000,
        deterministic=True,
        render=False,
    )

    model = SAC(
        "MlpPolicy",
        train_env,
        learning_rate=3e-4,
        batch_size=256,
        buffer_size=100_000,
        ent_coef="auto",
        verbose=1,
    )
    model.learn(total_timesteps=50_000, callback=callback)
    model.save(model_path)

    log_payload = {
        "model_path": model_path,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "timesteps": 50_000,
        "algorithm": "SAC",
    }
    with open(os.path.join(best_dir, "training_log.json"), "w", encoding="utf-8") as handle:
        json.dump(log_payload, handle, indent=2)

    train_env.close()
    eval_env.close()
    return model_path


def main() -> None:
    """CLI entrypoint for SAC training."""
    model_path = os.getenv("SAC_MODEL_PATH")
    if not model_path:
        raise RuntimeError("SAC_MODEL_PATH environment variable is required")
    output_path = train_sac_model(model_path)
    print(f"SAC model saved at {output_path}")


if __name__ == "__main__":
    main()

