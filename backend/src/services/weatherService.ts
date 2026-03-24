import { cellToLatLng } from 'h3-js';
import { config } from '../config';

export interface WeatherContext {
  weather_multiplier: number;
  aqi: number;
  rainfall_mm_per_hour: number;
  temperature_c: number;
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function deriveWeatherMultiplier(rainMmPerHour: number, temperatureC: number): number {
  if (rainMmPerHour >= 15) {
    return 1.3;
  }
  if (rainMmPerHour >= 8) {
    return 1.2;
  }
  if (temperatureC >= 44) {
    return 1.2;
  }
  if (temperatureC >= 40) {
    return 1.1;
  }
  return 1.0;
}

function decimalHexToH3(homeHexId: string | number | bigint): string {
  const raw = typeof homeHexId === 'bigint' ? homeHexId : BigInt(homeHexId);
  return raw.toString(16);
}

export async function getWeatherContext(homeHexId?: string | number | bigint): Promise<WeatherContext> {
  if (config.useMockApis) {
    return {
      weather_multiplier: 1.2,
      aqi: 150,
      rainfall_mm_per_hour: 0,
      temperature_c: 30,
    };
  }

  if (!homeHexId || !config.openWeatherApiKey) {
    return {
      weather_multiplier: 1.0,
      aqi: 0,
      rainfall_mm_per_hour: 0,
      temperature_c: 30,
    };
  }

  try {
    const h3Cell = decimalHexToH3(homeHexId);
    const [lat, lng] = cellToLatLng(h3Cell);

    const weatherUrl = `${config.openWeatherBaseUrl}/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${config.openWeatherApiKey}&units=metric`;
    const weatherResponse = await fetch(weatherUrl);
    const weatherJson = weatherResponse.ok ? await weatherResponse.json() : {};

    const rainMm = safeNumber((weatherJson as any)?.rain?.['1h']);
    const tempC = safeNumber((weatherJson as any)?.main?.temp, 30);

    const aqiUrl = `${config.openWeatherBaseUrl}/data/2.5/air_pollution?lat=${lat}&lon=${lng}&appid=${config.openWeatherApiKey}`;
    const aqiResponse = await fetch(aqiUrl);
    const aqiJson = aqiResponse.ok ? await aqiResponse.json() : {};
    const rawAqi = safeNumber((aqiJson as any)?.list?.[0]?.main?.aqi, 0);

    return {
      weather_multiplier: deriveWeatherMultiplier(rainMm, tempC),
      aqi: rawAqi,
      rainfall_mm_per_hour: rainMm,
      temperature_c: tempC,
    };
  } catch {
    return {
      weather_multiplier: 1.0,
      aqi: 0,
      rainfall_mm_per_hour: 0,
      temperature_c: 30,
    };
  }
}
