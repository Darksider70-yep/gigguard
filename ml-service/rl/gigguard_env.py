"""Gymnasium environment for shadow RL premium optimization."""

from __future__ import annotations

from typing import Any, Dict, Tuple

import gymnasium as gym
import numpy as np
from gymnasium import spaces


def compute_reward(premium: float, purchased: bool, claim_filed: bool, payout: float) -> float:
    """Compute scalar RL reward from premium outcome."""
    premium_value = float(premium)
    payout_value = float(payout)

    if purchased:
        margin = premium_value - payout_value
        reward = margin / 50.0
        reward += 0.2 if not claim_filed else -0.2
        return float(reward)

    return float(-0.5 if premium_value > 60.0 else -0.1)


class GigGuardEnv(gym.Env):
    """Synthetic environment for premium selection with stochastic outcomes."""

    metadata = {"render_modes": []}

    def __init__(self) -> None:
        """Initialize observation/action spaces and state."""
        super().__init__()
        self.observation_space = spaces.Box(low=0.0, high=2.0, shape=(8,), dtype=np.float32)
        self.action_space = spaces.Box(low=0.5, high=2.0, shape=(1,), dtype=np.float32)
        self.step_count = 0
        self._state = self._sample_worker_state()

    def _sample_worker_state(self) -> np.ndarray:
        """Sample a plausible worker-environment state vector."""
        zone_risk = np.random.uniform(0.8, 1.6)
        rain_prob_7d = np.random.uniform(0.0, 1.0)
        aqi_avg_7d = np.random.uniform(0.0, 1.5)
        claim_rate_90d = np.random.uniform(0.0, 0.6)
        worker_hours = np.random.uniform(0.6, 1.8)
        platform_enc = np.random.choice([0.0, 1.0])
        season_enc = np.random.uniform(0.0, 1.0)
        competitor_price = np.random.uniform(0.7, 1.8)

        vector = np.array(
            [
                zone_risk,
                rain_prob_7d,
                aqi_avg_7d,
                claim_rate_90d,
                worker_hours,
                platform_enc,
                season_enc,
                competitor_price,
            ],
            dtype=np.float32,
        )
        return np.clip(vector, 0.0, 2.0).astype(np.float32)

    def reset(
        self,
        *,
        seed: int | None = None,
        options: Dict[str, Any] | None = None,
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Reset episode and return initial state."""
        super().reset(seed=seed)
        if seed is not None:
            np.random.seed(seed)
        self.step_count = 0
        self._state = self._sample_worker_state()
        return self._state.copy(), {}

    def step(self, action: np.ndarray) -> Tuple[np.ndarray, float, bool, bool, Dict[str, Any]]:
        """Advance one timestep given premium multiplier action."""
        multiplier = float(np.clip(action[0], 0.5, 2.0))
        premium = 35.0 * multiplier

        purchase_prob = 1.0 / (1.0 + np.exp(-(3.0 - 0.05 * premium)))
        purchased = bool(np.random.random() < purchase_prob)

        claim_prob = float(self._state[0]) * 0.3 if purchased else 0.0
        claim_prob = float(np.clip(claim_prob, 0.0, 1.0))
        claim_filed = bool(np.random.random() < claim_prob)
        payout = premium * float(np.random.beta(2, 5)) if claim_filed else 0.0

        reward = compute_reward(premium, purchased, claim_filed, payout)

        self.step_count += 1
        terminated = self.step_count >= 52
        self._state = self._sample_worker_state()

        info = {
            "premium": premium,
            "purchased": purchased,
            "claim_filed": claim_filed,
            "payout": payout,
        }
        return self._state.copy(), float(reward), terminated, False, info

