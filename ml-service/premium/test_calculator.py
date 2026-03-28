"""Unit tests for premium calculation."""

from __future__ import annotations

from premium.calculator import PremiumCalculator


def test_calculate_standard_input() -> None:
    """Standard multiplier inputs should produce stable premium output."""
    calculator = PremiumCalculator()
    result = calculator.calculate(1.40, 1.20, 0.85)
    assert result["premium"] == 49.98
    assert result["base_rate"] == 35.0


def test_calculate_identity_multipliers() -> None:
    """Identity multipliers should return the base premium."""
    calculator = PremiumCalculator()
    result = calculator.calculate(1.0, 1.0, 1.0)
    assert result["premium"] == 35.0


def test_calculate_extreme_input_does_not_crash() -> None:
    """Extreme but valid multipliers should still produce numeric premium."""
    calculator = PremiumCalculator()
    result = calculator.calculate(2.0, 1.5, 1.2)
    assert result["premium"] == 126.0
    assert result["raw_premium"] > 0


def test_get_coverage_for_premium_uses_nearest_tier() -> None:
    """Nearest tier mapping should return correct arm and coverage."""
    calculator = PremiumCalculator()
    tier = calculator.get_coverage_for_premium(57.12)
    assert tier["arm"] == 2
    assert tier["premium"] == 65.0
    assert tier["coverage"] == 640.0


def test_response_contains_required_keys() -> None:
    """Calculation output should expose all required breakdown fields."""
    calculator = PremiumCalculator()
    result = calculator.calculate(1.10, 1.00, 0.85)
    required = {
        "premium",
        "base_rate",
        "zone_multiplier",
        "weather_multiplier",
        "history_multiplier",
        "raw_premium",
    }
    assert required.issubset(result.keys())

