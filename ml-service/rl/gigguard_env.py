"""GigGuard Gymnasium environment for SAC premium optimization."""

from __future__ import annotations

from typing import Any, Dict, Tuple

import gymnasium as gym
import numpy as np
from gymnasium import spaces


def compute_reward(premium: float, purchased: bool, claim_filed: bool, payout: float) -> float:
    """Reward function shared by the environment and external evaluators."""
    purchase_reward = 1.0 if purchased else -0.3
    loss_ratio = float(payout) / max(float(premium), 1.0)
    loss_penalty = max(0.0, loss_ratio - 0.8) * 5.0
    churn_penalty = 0.5 if (float(premium) > 65.0 and not purchased) else 0.0
    _ = claim_filed  # Included for signature completeness.
    return float(purchase_reward - loss_penalty - churn_penalty)


class GigGuardEnv(gym.Env):
    """Synthetic weekly insurance environment (52-step episodes)."""

    metadata = {"render_modes": []}

    def __init__(self) -> None:
        super().__init__()
        self.observation_space = spaces.Box(low=0.0, high=2.0, shape=(8,), dtype=np.float32)
        self.action_space = spaces.Box(low=0.5, high=2.0, shape=(1,), dtype=np.float32)
        self.step_count = 0
        self.current_state = self._sample_worker_state()

    def _sample_worker_state(self) -> np.ndarray:
        return np.array(
            [
                np.random.uniform(0.85, 1.45),  # zone_risk
                float(np.random.beta(2, 5)),  # rain_prob_7d
                float(np.random.beta(1, 4)),  # aqi_avg_7d
                float(np.clip(np.random.beta(1, 8), 0.0, 1.0)),  # claim_rate_90d
                float(np.random.uniform(0.4, 0.9)),  # worker_hours
                float(np.random.randint(0, 2)),  # platform_enc
                float(np.random.choice([0.0, 0.33, 0.66, 1.0])),  # season_enc
                float(np.random.uniform(0.25, 0.55)),  # competitor_price
            ],
            dtype=np.float32,
        )

    def _compute_reward(self, premium: float, purchased: bool, claim_filed: bool, payout: float) -> float:
        return compute_reward(premium=premium, purchased=purchased, claim_filed=claim_filed, payout=payout)

    def reset(
        self,
        *,
        seed: int | None = None,
        options: Dict[str, Any] | None = None,
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        super().reset(seed=seed)
        if seed is not None:
            np.random.seed(seed)
        self.step_count = 0
        state = self._sample_worker_state()
        self.current_state = state
        return state.copy(), {}

    def step(self, action: np.ndarray) -> Tuple[np.ndarray, float, bool, bool, Dict[str, Any]]:
        action_val = float(np.clip(action[0], 0.5, 2.0))
        premium = 35.0 * action_val

        purchase_prob = 1.0 / (1.0 + np.exp(-(3.0 - 0.05 * premium)))
        purchased = bool(np.random.random() < purchase_prob)

        zone_risk = float(self.current_state[0])
        claim_prob = zone_risk * 0.25 if purchased else 0.0
        claim_filed = bool(np.random.random() < claim_prob)

        payout = 0.0
        if claim_filed:
            loss_ratio = float(np.random.beta(2, 5))
            payout = premium * loss_ratio

        reward = self._compute_reward(
            premium=premium,
            purchased=purchased,
            claim_filed=claim_filed,
            payout=payout,
        )

        self.step_count += 1
        terminated = self.step_count >= 52

        next_state = self._sample_worker_state()
        self.current_state = next_state

        info = {
            "premium": round(premium, 2),
            "purchased": purchased,
            "claim_filed": claim_filed,
            "payout": round(payout, 2),
            "action_val": round(action_val, 4),
        }
        return next_state.copy(), float(reward), terminated, False, info

