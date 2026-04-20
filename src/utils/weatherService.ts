export interface WeatherSummaryDay {
  date: string;
  icon: string;
  high: number;
  low: number;
}

export interface WeatherDay extends WeatherSummaryDay {
  uvIndex: number;
  windSpeed: number;
  precipitationChance: number;
  humidity: number;
  sunrise: string;
  sunset: string;
}

interface OpenMeteoDaily {
  time: string[];
  weathercode: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  uv_index_max: number[];
  wind_speed_10m_max: number[];
  precipitation_probability_max: number[];
  relative_humidity_2m_mean: number[];
  sunrise: string[];
  sunset: string[];
}

interface OpenMeteoResponse {
  daily?: OpenMeteoDaily;
}

const WEATHER_ICON_MAP: Record<number, string> = {
  0: 'weather-clear',
  1: 'weather-partly-cloudy',
  2: 'weather-partly-cloudy',
  3: 'weather-overcast',
  45: 'weather-fog',
  48: 'weather-fog',
  51: 'weather-drizzle',
  53: 'weather-drizzle',
  55: 'weather-drizzle',
  56: 'weather-snow',
  57: 'weather-snow',
  61: 'weather-rain',
  63: 'weather-rain',
  65: 'weather-rain',
  66: 'weather-snow',
  67: 'weather-snow',
  71: 'weather-snow',
  73: 'weather-snow',
  75: 'weather-snow',
  77: 'weather-snow',
  80: 'weather-showers',
  81: 'weather-showers',
  82: 'weather-showers',
  85: 'weather-snow',
  86: 'weather-snow',
  95: 'weather-thunderstorm',
  96: 'weather-thunderstorm',
  99: 'weather-thunderstorm',
};

function iconForWeatherCode(code: number): string {
  return WEATHER_ICON_MAP[code] ?? 'weather-unknown';
}

export async function fetchWeatherSummaryForDate(
  lat: number,
  lng: number,
  dateISO: string,
): Promise<WeatherSummaryDay | null> {
  const forecast = await fetchWeatherForecast(lat, lng, 1);
  const day = forecast.find((entry) => entry.date === dateISO) ?? null;
  if (!day) return null;

  return {
    date: day.date,
    icon: day.icon,
    high: day.high,
    low: day.low,
  };
}

export async function fetchWeatherForecast(
  lat: number,
  lng: number,
  days = 7,
): Promise<WeatherDay[]> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily: [
      'weathercode',
      'temperature_2m_max',
      'temperature_2m_min',
      'uv_index_max',
      'wind_speed_10m_max',
      'precipitation_probability_max',
      'relative_humidity_2m_mean',
      'sunrise',
      'sunset',
    ].join(','),
    forecast_days: String(days),
    temperature_unit: 'fahrenheit',
    timezone: 'auto',
    wind_speed_unit: 'mph',
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Weather request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as OpenMeteoResponse;
  const daily = payload.daily;
  if (!daily) return [];

  return daily.time.map((date, index) => ({
    date,
    icon: iconForWeatherCode(daily.weathercode[index] ?? -1),
    high: Math.round(daily.temperature_2m_max[index] ?? 0),
    low: Math.round(daily.temperature_2m_min[index] ?? 0),
    uvIndex: Math.round((daily.uv_index_max[index] ?? 0) * 10) / 10,
    windSpeed: Math.round(daily.wind_speed_10m_max[index] ?? 0),
    precipitationChance: Math.round(daily.precipitation_probability_max[index] ?? 0),
    humidity: Math.round(daily.relative_humidity_2m_mean[index] ?? 0),
    sunrise: daily.sunrise[index] ?? '',
    sunset: daily.sunset[index] ?? '',
  }));
}
