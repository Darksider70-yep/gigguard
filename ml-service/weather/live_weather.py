"""Live weather data client for ML service premium enrichment."""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Dict, Tuple

import numpy as np
import requests

MOCK_WEATHER = {
    "weather_multiplier": 1.20,
    "rain_prob_7d": 0.45,
    "aqi_avg_7d": 0.30,
    "forecast_days": 7,
    "source": "mock",
}


class LiveWeatherClient:
    # Using current OpenWeather API style (2.5 forecast), no One Call dependency.
    OWM_BASE = "https://api.openweathermap.org/data/2.5/forecast"
    AQICN_BASE = "https://api.waqi.info/feed"

    def __init__(self) -> None:
        self.owm_key = os.environ.get("OPENWEATHERMAP_API_KEY", "") or os.environ.get("OPENWEATHER_API_KEY", "")
        self.aqicn_key = os.environ.get("AQICN_API_KEY", "")
        self.use_mock = os.environ.get("USE_MOCK_APIS", "false").strip().lower() == "true"
        self._cache: Dict[str, Tuple[dict, datetime]] = {}
        self.CACHE_TTL_SECONDS = 1800

    def get_weather_multiplier(self, lat: float, lng: float) -> dict:
        """Return weather multiplier and 7-day forecast features."""
        if self.use_mock or not self.owm_key:
            return dict(MOCK_WEATHER)

        cache_key = f"weather_{lat:.3f}_{lng:.3f}"
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        try:
            response = requests.get(
                self.OWM_BASE,
                params={"lat": lat, "lon": lng, "appid": self.owm_key, "units": "metric"},
                timeout=5,
            )
            response.raise_for_status()
            payload = response.json()
            points = payload.get("list", [])[:56]  # up to 7 days, 3-hour buckets
            result = self._compute_weather_features(points)
            self._set_cache(cache_key, result)
            return result
        except Exception as exc:
            print(f"[WeatherClient] OWM forecast failed: {exc}")
            return {**MOCK_WEATHER, "source": "fallback_on_error"}

    def _compute_weather_features(self, points: list) -> dict:
        daily: Dict[str, Dict[str, float]] = {}
        for point in points:
            dt_txt = str(point.get("dt_txt", ""))
            day = dt_txt[:10] if len(dt_txt) >= 10 else None
            if not day:
                continue

            pop = float(point.get("pop", 0.0) or 0.0)
            rain_3h = float((point.get("rain", {}) or {}).get("3h", 0.0) or 0.0)
            feels_like = float((point.get("main", {}) or {}).get("feels_like", 0.0) or 0.0)

            slot = daily.setdefault(day, {"rain_mm": 0.0, "max_feels_like": -999.0, "pop_sum": 0.0, "count": 0.0})
            slot["rain_mm"] += rain_3h
            slot["max_feels_like"] = max(slot["max_feels_like"], feels_like)
            slot["pop_sum"] += pop
            slot["count"] += 1.0

        rows = list(daily.values())[:7]
        rainy_days = sum(1 for row in rows if row["rain_mm"] > 10.0)
        hot_days = sum(1 for row in rows if row["max_feels_like"] > 42.0)
        rain_prob_7d = float(np.mean([row["pop_sum"] / max(row["count"], 1.0) for row in rows])) if rows else 0.2

        multiplier = 1.0
        multiplier += 0.10 * (rainy_days // 3)
        multiplier += 0.10 * (hot_days // 2)
        multiplier = float(np.clip(multiplier, 0.90, 1.30))

        return {
            "weather_multiplier": round(multiplier, 4),
            "rain_prob_7d": round(rain_prob_7d, 4),
            "aqi_avg_7d": 0.20,
            "forecast_days": len(rows),
            "rainy_days": int(rainy_days),
            "hot_days": int(hot_days),
            "source": "openweathermap",
        }

    def get_current_aqi(self, city: str) -> dict:
        """Return current AQI snapshot for city."""
        if self.use_mock or not self.aqicn_key:
            return {"aqi": 120, "pm25": 85, "source": "mock"}

        cache_key = f"aqi_{city.strip().lower()}"
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        try:
            response = requests.get(
                f"{self.AQICN_BASE}/{city}/",
                params={"token": self.aqicn_key},
                timeout=5,
            )
            response.raise_for_status()
            payload = response.json()
            if payload.get("status") != "ok":
                return {"aqi": None, "pm25": None, "source": "aqicn_error"}

            data = payload.get("data", {}) or {}
            result = {
                "aqi": data.get("aqi"),
                "pm25": ((data.get("iaqi", {}) or {}).get("pm25", {}) or {}).get("v"),
                "city": ((data.get("city", {}) or {}).get("name")),
                "source": "aqicn",
            }
            self._set_cache(cache_key, result)
            return result
        except Exception as exc:
            print(f"[WeatherClient] AQICN API failed for {city}: {exc}")
            return {"aqi": None, "pm25": None, "source": "fallback_on_error"}

    def _get_cache(self, key: str) -> dict | None:
        item = self._cache.get(key)
        if item is None:
            return None
        data, expires_at = item
        if datetime.now() > expires_at:
            del self._cache[key]
            return None
        return data

    def _set_cache(self, key: str, data: dict) -> None:
        self._cache[key] = (
            data,
            datetime.now() + timedelta(seconds=self.CACHE_TTL_SECONDS),
        )


weather_client = LiveWeatherClient()
