import { cellToLatLng } from 'h3-js';
import { config } from '../config';
import { logger } from '../lib/logger';
import { GRACEFUL_DEFAULTS } from './gracefulDefaults';

export interface WeatherData {
  weather_multiplier: number;
  rain_1h: number | null;
  feels_like: number | null;
  temp: number | null;
  aqi: number | null;
}

class WeatherBudgetTracker {
  private owmCallsToday = 0;
  private lastResetUtcDate = this.getUtcDateKey();
  private readonly OWM_DAILY_LIMIT = 900;

  private getUtcDateKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private resetIfNewDay(): void {
    const today = this.getUtcDateKey();
    if (today !== this.lastResetUtcDate) {
      this.owmCallsToday = 0;
      this.lastResetUtcDate = today;
    }
  }

  canMakeOWMCall(): boolean {
    this.resetIfNewDay();
    return this.owmCallsToday < this.OWM_DAILY_LIMIT;
  }

  recordOWMCall(): void {
    this.resetIfNewDay();
    this.owmCallsToday += 1;
    if (this.owmCallsToday >= Math.floor(this.OWM_DAILY_LIMIT * 0.8)) {
      logger.warn('WeatherBudget', 'api_budget_low', {
        owm_calls_today: this.owmCallsToday,
        owm_daily_limit: this.OWM_DAILY_LIMIT,
      });
    }
  }

  getStatus(): {
    owm_calls_today: number;
    owm_daily_limit: number;
    owm_remaining: number;
    owm_pct_used: number;
  } {
    this.resetIfNewDay();
    return {
      owm_calls_today: this.owmCallsToday,
      owm_daily_limit: this.OWM_DAILY_LIMIT,
      owm_remaining: Math.max(this.OWM_DAILY_LIMIT - this.owmCallsToday, 0),
      owm_pct_used: Math.round((this.owmCallsToday / this.OWM_DAILY_LIMIT) * 100),
    };
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

class WeatherService {
  async getWeatherMultiplier(lat: number, lng: number): Promise<number> {
    if (config.USE_MOCK_APIS) {
      return 1.2;
    }

    if (!weatherBudget.canMakeOWMCall()) {
      logger.warn('WeatherService', 'owm_budget_exhausted', {
        endpoint: 'forecast',
        lat,
        lng,
      });
      return GRACEFUL_DEFAULTS.WEATHER_MULTIPLIER;
    }

    try {
      const url =
        `${config.OPENWEATHERMAP_BASE_URL}/forecast` +
        `?lat=${lat}&lon=${lng}` +
        `&appid=${config.OPENWEATHERMAP_API_KEY}&units=metric`;
      weatherBudget.recordOWMCall();
      const res = await fetchWithTimeout(url, GRACEFUL_DEFAULTS.OWM_TIMEOUT_MS);
      if (!res.ok) {
        throw new Error(`OWM returned ${res.status}`);
      }
      const data = await res.json();
      return this.computeWeatherMultiplier(Array.isArray(data.list) ? data.list : []);
    } catch (err) {
      logger.warn('WeatherService', 'owm_forecast_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return GRACEFUL_DEFAULTS.WEATHER_MULTIPLIER;
    }
  }

  private computeWeatherMultiplier(points: any[]): number {
    const perDay = new Map<string, { rainMm: number; hot: boolean }>();

    for (const point of points.slice(0, 56)) {
      const dtTxt = String(point?.dt_txt ?? '');
      const day = dtTxt.length >= 10 ? dtTxt.slice(0, 10) : '';
      if (!day) continue;

      const rainMm = Number(point?.rain?.['3h'] ?? 0);
      const feelsLike = Number(point?.main?.feels_like ?? 0);
      const existing = perDay.get(day) ?? { rainMm: 0, hot: false };
      existing.rainMm += Number.isFinite(rainMm) ? rainMm : 0;
      existing.hot = existing.hot || feelsLike > 42;
      perDay.set(day, existing);
    }

    const daily = Array.from(perDay.values()).slice(0, 7);
    let multiplier = 1.0;
    const rainyDays = daily.filter((d) => d.rainMm > 10).length;
    const hotDays = daily.filter((d) => d.hot).length;

    if (rainyDays >= 3) {
      multiplier += 0.1;
    }
    if (rainyDays >= 5) {
      multiplier += 0.1;
    }
    if (hotDays >= 2) {
      multiplier += 0.1;
    }
    return Math.min(Math.max(multiplier, 0.9), 1.3);
  }

  async getCurrentConditions(lat: number, lng: number): Promise<WeatherData> {
    if (config.USE_MOCK_APIS) {
      return {
        weather_multiplier: 1.2,
        rain_1h: 17.2,
        feels_like: 32.1,
        temp: 28.5,
        aqi: null,
      };
    }

    if (!weatherBudget.canMakeOWMCall()) {
      logger.warn('WeatherService', 'owm_budget_exhausted', {
        endpoint: 'current',
        lat,
        lng,
      });
      return {
        weather_multiplier: GRACEFUL_DEFAULTS.WEATHER_MULTIPLIER,
        rain_1h: null,
        feels_like: null,
        temp: null,
        aqi: null,
      };
    }

    try {
      const url =
        `${config.OPENWEATHERMAP_BASE_URL}/weather` +
        `?lat=${lat}&lon=${lng}` +
        `&appid=${config.OPENWEATHERMAP_API_KEY}&units=metric`;
      weatherBudget.recordOWMCall();
      const res = await fetchWithTimeout(url, GRACEFUL_DEFAULTS.OWM_TIMEOUT_MS);
      if (!res.ok) {
        throw new Error(`OWM current returned ${res.status}`);
      }
      const data = await res.json();
      return {
        weather_multiplier: GRACEFUL_DEFAULTS.WEATHER_MULTIPLIER,
        rain_1h: data?.rain?.['1h'] ?? null,
        feels_like: data?.main?.feels_like ?? null,
        temp: data?.main?.temp ?? null,
        aqi: null,
      };
    } catch (err) {
      logger.warn('WeatherService', 'owm_current_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        weather_multiplier: GRACEFUL_DEFAULTS.WEATHER_MULTIPLIER,
        rain_1h: null,
        feels_like: null,
        temp: null,
        aqi: null,
      };
    }
  }

  async getAQI(city: string): Promise<number | null> {
    if (config.USE_MOCK_APIS) {
      return 150;
    }

    try {
      const url = `${config.AQICN_BASE_URL}/${encodeURIComponent(city)}/?token=${config.AQICN_API_KEY}`;
      const res = await fetchWithTimeout(url, GRACEFUL_DEFAULTS.AQICN_TIMEOUT_MS);
      if (!res.ok) {
        throw new Error(`AQICN returned ${res.status}`);
      }
      const data = await res.json();
      if (data.status !== 'ok') {
        return null;
      }
      return data.data?.iaqi?.pm25?.v ?? null;
    } catch (err) {
      logger.warn('WeatherService', 'aqicn_failed', {
        city,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
}

function parseHexId(hexId: string | number | bigint): string {
  if (typeof hexId === 'bigint') {
    return hexId.toString(16);
  }

  if (typeof hexId === 'number') {
    return BigInt(hexId).toString(16);
  }

  const value = hexId.trim();
  if (value.startsWith('0x')) {
    return value.slice(2);
  }
  return BigInt(value).toString(16);
}

export const weatherService = new WeatherService();
export const weatherBudget = new WeatherBudgetTracker();

// Backward-compatible helper used by older routes/tests.
export async function getWeatherContext(homeHexId?: string | number | bigint): Promise<{
  weather_multiplier: number;
  aqi: number;
  rainfall_mm_per_hour: number;
  temperature_c: number;
}> {
  if (!homeHexId) {
    return {
      weather_multiplier: 1.0,
      aqi: 0,
      rainfall_mm_per_hour: 0,
      temperature_c: 30,
    };
  }

  const [lat, lng] = cellToLatLng(parseHexId(homeHexId));
  const current = await weatherService.getCurrentConditions(lat, lng);

  return {
    weather_multiplier: current.weather_multiplier,
    aqi: current.aqi ?? 0,
    rainfall_mm_per_hour: current.rain_1h ?? 0,
    temperature_c: current.temp ?? 30,
  };
}
