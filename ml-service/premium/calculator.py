"""Formula-based premium calculator."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List


@dataclass(frozen=True)
class CoverageTier:
    """Coverage tier metadata."""

    arm: int
    premium: float
    coverage: float


class PremiumCalculator:
    """Premium calculation and premium-to-coverage mapping logic."""

    TIERS: List[Dict[str, float]] = [
        {"arm": 0, "premium": 29.0, "coverage": 290.0},
        {"arm": 1, "premium": 44.0, "coverage": 440.0},
        {"arm": 2, "premium": 65.0, "coverage": 640.0},
        {"arm": 3, "premium": 89.0, "coverage": 890.0},
    ]

    def calculate(
        self,
        zone_multiplier: float,
        weather_multiplier: float,
        history_multiplier: float,
    ) -> Dict[str, float]:
        """Compute formula premium and return full breakdown."""
        base_rate = 35.0
        raw_premium = (
            base_rate
            * float(zone_multiplier)
            * float(weather_multiplier)
            * float(history_multiplier)
        )
        premium = round(raw_premium, 2)
        return {
            "premium": premium,
            "base_rate": base_rate,
            "zone_multiplier": float(zone_multiplier),
            "weather_multiplier": float(weather_multiplier),
            "history_multiplier": float(history_multiplier),
            "raw_premium": raw_premium,
        }

    def get_coverage_for_premium(self, premium: float) -> Dict[str, float]:
        """Map premium to the nearest predefined policy tier."""
        premium_value = float(premium)
        tier = min(
            self.TIERS,
            key=lambda item: (abs(item["premium"] - premium_value), item["premium"]),
        )
        return dict(tier)

