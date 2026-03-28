"""Unit tests for contextual Thompson Sampling bandit."""

from __future__ import annotations

from collections import Counter

import numpy as np

from bandits.policy_bandit import ThompsonSamplingBandit


def _chi_square_statistic(observed: list[int], expected: float) -> float:
    return sum(((value - expected) ** 2) / expected for value in observed)


def test_cold_start_chi_square_uniformity() -> None:
    """Cold start should produce roughly uniform arm choices."""
    np.random.seed(42)
    bandit = ThompsonSamplingBandit(n_arms=4)
    draws = [bandit.select_arm("cold_ctx")["arm"] for _ in range(1000)]
    counts = Counter(draws)
    observed = [counts.get(idx, 0) for idx in range(4)]
    chi_sq = _chi_square_statistic(observed, 250.0)
    # df=3 critical value at p=0.05
    assert chi_sq < 7.815


def test_learning_prefers_arm2_after_rewards() -> None:
    """Context with repeated positive reward on arm 2 should prefer arm 2."""
    np.random.seed(42)
    bandit = ThompsonSamplingBandit(n_arms=4)
    context = "test_ctx"

    for _ in range(50):
        bandit.update(context, arm=2, reward=1.0)

    draws = [bandit.select_arm(context)["arm"] for _ in range(200)]
    assert draws.count(2) / 200 > 0.70


def test_unknown_context_falls_back_to_global() -> None:
    """Unknown context should not raise and should use global state."""
    bandit = ThompsonSamplingBandit(n_arms=4)
    result = bandit.select_arm("never_seen")
    assert result["arm"] in {0, 1, 2, 3}


def test_update_increments_alpha_and_beta() -> None:
    """update should modify alpha for rewarded arm and beta for unrewarded."""
    bandit = ThompsonSamplingBandit(n_arms=4)
    context = "ctx"
    state = bandit._ensure_context(context)  # pylint: disable=protected-access
    old_alpha = state["alpha"][1]
    old_beta = state["beta"][1]

    bandit.update(context, arm=1, reward=1.0)
    assert state["alpha"][1] > old_alpha

    bandit.update(context, arm=1, reward=0.0)
    assert state["beta"][1] > old_beta


def test_get_arm_stats_hides_alpha_beta() -> None:
    """Stats endpoint output must not expose raw alpha/beta values."""
    bandit = ThompsonSamplingBandit(n_arms=4)
    stats = bandit.get_arm_stats("ctx")
    for arm_entry in stats["arms"]:
        assert "alpha" not in arm_entry
        assert "beta" not in arm_entry


def test_state_round_trip_is_consistent() -> None:
    """Serialized state should restore deterministic selections with same seed."""
    bandit = ThompsonSamplingBandit(n_arms=4)
    context = "round_trip"
    for _ in range(25):
        bandit.update(context, arm=3, reward=1.0)

    state = bandit.get_state()
    clone = ThompsonSamplingBandit(n_arms=4)
    clone.load_state(state)

    np.random.seed(123)
    original_draws = [bandit.select_arm(context)["arm"] for _ in range(20)]
    np.random.seed(123)
    clone_draws = [clone.select_arm(context)["arm"] for _ in range(20)]
    assert original_draws == clone_draws

