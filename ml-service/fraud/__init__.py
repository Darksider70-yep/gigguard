"""Fraud scoring package."""

from __future__ import annotations

__all__ = ["FraudScorer"]


def __getattr__(name: str):
    if name == "FraudScorer":
        from fraud.isolation_forest import FraudScorer

        return FraudScorer
    raise AttributeError(f"module 'fraud' has no attribute {name!r}")

