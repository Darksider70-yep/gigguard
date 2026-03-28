"""Contextual Thompson Sampling policy recommendation bandit."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, List, Optional

import numpy as np


def build_context_key(context: Dict[str, Any]) -> str:
    """Build deterministic context key from context payload."""
    platform = str(context.get("platform", "zomato")).strip().lower() or "zomato"
    city = str(context.get("city", "unknown")).strip().lower() or "unknown"
    city = city.replace(" ", "_")
    experience_tier = str(context.get("experience_tier", "mid")).strip().lower() or "mid"
    season = str(context.get("season", "other")).strip().lower() or "other"
    zone_risk = str(context.get("zone_risk", "medium")).strip().lower() or "medium"
    return f"{platform}_{city}_{experience_tier}_{season}_{zone_risk}"


class ThompsonSamplingBandit:
    """Thompson Sampling bandit with global and per-context Beta priors."""

    ARMS: List[Dict[str, float]] = [
        {"arm": 0, "premium": 29.0, "coverage": 290.0},
        {"arm": 1, "premium": 44.0, "coverage": 440.0},
        {"arm": 2, "premium": 65.0, "coverage": 640.0},
        {"arm": 3, "premium": 89.0, "coverage": 890.0},
    ]

    def __init__(self, n_arms: int = 4) -> None:
        """Initialize global and context-level Beta states."""
        self.n_arms = n_arms
        self.global_alpha: List[float] = [1.0] * n_arms
        self.global_beta: List[float] = [1.0] * n_arms
        self.context_states: Dict[str, Dict[str, List[float]]] = {}

    def _get_state(self, context_key: str) -> Dict[str, List[float]]:
        """Return context state, or virtual global fallback if not initialized."""
        if context_key in self.context_states:
            return self.context_states[context_key]
        return {"alpha": self.global_alpha, "beta": self.global_beta}

    def _ensure_context(self, context_key: str) -> Dict[str, List[float]]:
        """Initialize context state from global priors when first observed."""
        if context_key not in self.context_states:
            self.context_states[context_key] = {
                "alpha": deepcopy(self.global_alpha),
                "beta": deepcopy(self.global_beta),
            }
        return self.context_states[context_key]

    def _expected_values(self, alpha: List[float], beta: List[float]) -> List[float]:
        """Compute posterior expected conversion for each arm."""
        return [a / (a + b) for a, b in zip(alpha, beta)]

    def select_arm(self, context_key: str) -> Dict[str, Any]:
        """Sample from each arm posterior and return recommendation payload."""
        state = self._get_state(context_key)
        alpha = state["alpha"]
        beta = state["beta"]
        # Thompson Sampling: draw one sample from each arm's Beta(alpha, beta)
        # posterior, then pick the arm with highest sampled conversion rate.
        samples = [float(np.random.beta(a, b)) for a, b in zip(alpha, beta)]
        chosen = int(np.argmax(samples))

        # Posterior mean for Beta distribution is alpha / (alpha + beta).
        expected = self._expected_values(alpha, beta)
        explore = chosen != int(np.argmax(expected))

        return {
            "arm": chosen,
            "premium": self.ARMS[chosen]["premium"],
            "coverage": self.ARMS[chosen]["coverage"],
            "context_key": context_key,
            "explore": explore,
        }

    def update(self, context_key: str, arm: int, reward: float) -> None:
        """Update context posterior and soft-update global prior."""
        if arm < 0 or arm >= self.n_arms:
            raise ValueError(f"Arm index out of range: {arm}")
        if reward < 0.0 or reward > 1.0:
            raise ValueError("Reward must be within [0, 1]")

        state = self._ensure_context(context_key)
        # Beta-Bernoulli conjugate update:
        # alpha += reward (successes), beta += 1 - reward (failures).
        state["alpha"][arm] += float(reward)
        state["beta"][arm] += float(1.0 - reward)

        # Soft global update keeps unseen contexts informed while preserving locality.
        self.global_alpha[arm] += float(reward) * 0.1
        self.global_beta[arm] += float(1.0 - reward) * 0.1

    def get_arm_stats(self, context_key: Optional[str] = None) -> Dict[str, Any]:
        """Return expected values only (no alpha/beta leakage)."""
        if context_key:
            state = self._get_state(context_key)
            expected = self._expected_values(state["alpha"], state["beta"])
            return {
                "context_key": context_key,
                "arms": [
                    {
                        "arm": arm["arm"],
                        "premium": arm["premium"],
                        "coverage": arm["coverage"],
                        "expected_value": float(expected[idx]),
                    }
                    for idx, arm in enumerate(self.ARMS)
                ],
            }

        global_expected = self._expected_values(self.global_alpha, self.global_beta)
        contexts: Dict[str, Any] = {}
        for key, state in self.context_states.items():
            expected = self._expected_values(state["alpha"], state["beta"])
            contexts[key] = [
                {
                    "arm": arm["arm"],
                    "premium": arm["premium"],
                    "coverage": arm["coverage"],
                    "expected_value": float(expected[idx]),
                }
                for idx, arm in enumerate(self.ARMS)
            ]

        return {
            "global": [
                {
                    "arm": arm["arm"],
                    "premium": arm["premium"],
                    "coverage": arm["coverage"],
                    "expected_value": float(global_expected[idx]),
                }
                for idx, arm in enumerate(self.ARMS)
            ],
            "contexts": contexts,
        }

    def get_state(self) -> Dict[str, Any]:
        """Return full serializable internal state."""
        return {
            "n_arms": self.n_arms,
            "global_alpha": [float(x) for x in self.global_alpha],
            "global_beta": [float(x) for x in self.global_beta],
            "context_states": deepcopy(self.context_states),
        }

    def load_state(self, state: Dict[str, Any]) -> None:
        """Restore state from persisted dictionary."""
        if not state:
            return

        self.n_arms = int(state["n_arms"])
        self.global_alpha = [float(x) for x in state["global_alpha"]]
        self.global_beta = [float(x) for x in state["global_beta"]]
        context_states = state.get("context_states", {})

        restored: Dict[str, Dict[str, List[float]]] = {}
        for key, value in context_states.items():
            restored[key] = {
                "alpha": [float(x) for x in value["alpha"]],
                "beta": [float(x) for x in value["beta"]],
            }
        self.context_states = restored
