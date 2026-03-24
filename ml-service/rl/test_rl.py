"""Unit tests for RL environment and shadow validation."""

from __future__ import annotations

import os
from pathlib import Path

import numpy as np
import pytest

gymnasium = pytest.importorskip("gymnasium")
check_env = pytest.importorskip("gymnasium.utils.env_checker").check_env

from rl.gigguard_env import GigGuardEnv, compute_reward
from rl import validate_shadow as shadow_module


def test_env_passes_gymnasium_checker() -> None:
    """Environment should satisfy Gymnasium API checker."""
    env = GigGuardEnv()
    check_env(env, skip_render_check=True)
    env.close()


def test_observations_are_within_bounds() -> None:
    """All sampled observations should remain in [0, 2]."""
    env = GigGuardEnv()
    state, _ = env.reset(seed=42)
    assert np.all(state >= 0.0)
    assert np.all(state <= 2.0)
    env.close()


def test_action_clipping_keeps_premium_capped() -> None:
    """Action values above bound should still produce premium <= 70."""
    env = GigGuardEnv()
    env.reset(seed=1)
    _, _, _, _, info = env.step(np.array([3.0], dtype=np.float32))
    assert info["premium"] <= 70.0
    env.close()


def test_episode_terminates_at_52_steps() -> None:
    """Episode must terminate exactly at step 52."""
    env = GigGuardEnv()
    env.reset(seed=3)
    done = False
    steps = 0
    while not done:
        _, _, done, _, _ = env.step(np.array([1.0], dtype=np.float32))
        steps += 1
    assert steps == 52
    env.close()


def test_compute_reward_positive_for_purchase_low_claim() -> None:
    """Purchase with no claim payout should yield positive reward."""
    reward = compute_reward(premium=40.0, purchased=True, claim_filed=False, payout=0.0)
    assert reward > 0.0


def test_compute_reward_negative_for_no_purchase_high_premium() -> None:
    """No purchase with expensive premium should be penalized."""
    reward = compute_reward(premium=65.0, purchased=False, claim_filed=False, payout=0.0)
    assert reward < 0.0


def test_sac_model_loads_if_available() -> None:
    """If SAC model exists, it should produce bounded action."""
    model_path = os.getenv("SAC_MODEL_PATH")
    if not model_path or not Path(model_path).exists():
        pytest.skip("SAC model file not available")

    stable_baselines3 = pytest.importorskip("stable_baselines3")
    model = stable_baselines3.SAC.load(model_path)
    env = GigGuardEnv()
    state, _ = env.reset(seed=9)
    action, _ = model.predict(state, deterministic=True)
    assert 0.5 <= float(action[0]) <= 2.0
    env.close()


def test_validate_shadow_needs_more_data(monkeypatch: pytest.MonkeyPatch) -> None:
    """Shadow validation should request more data below 500 rows."""
    monkeypatch.setattr(shadow_module, "_fetch_shadow_rows", lambda database_url: [])
    report = shadow_module.validate_shadow("postgresql://mock/mock")
    assert report["recommendation"] == "needs_more_data"
