import type {
  Event,
  QuickActionsEvent,
  QuickActionsWeatherSnapshot,
} from '../types/event';
import type { WeatherDay, WeatherSummaryDay } from './weatherService';

function weatherSummaryForDate(
  date: string,
  snapshot: QuickActionsWeatherSnapshot,
): WeatherSummaryDay {
  return {
    date,
    icon: snapshot.icon,
    high: snapshot.high,
    low: snapshot.low,
    ...(snapshot.precipitation !== undefined ? { precipitation: snapshot.precipitation } : {}),
  };
}

function resolveQaDate(quickActions: QuickActionsEvent): string | null {
  if (quickActions.id.startsWith('qa-')) {
    return quickActions.id.slice(3);
  }

  return quickActions.date || null;
}

export function buildStoredWeatherMap(
  activeEvents: Record<string, Event | QuickActionsEvent>,
  historyEvents: Record<string, Event | QuickActionsEvent>,
): Map<string, WeatherSummaryDay> {
  const weatherByDate = new Map<string, WeatherSummaryDay>();

  for (const event of [...Object.values(historyEvents), ...Object.values(activeEvents)]) {
    if (!isQuickActionsEvent(event) || !event.weatherSnapshot) continue;

    const date = resolveQaDate(event);
    if (!date || weatherByDate.has(date)) continue;

    weatherByDate.set(date, weatherSummaryForDate(date, event.weatherSnapshot));
  }

  return weatherByDate;
}

function isQuickActionsEvent(event: Event | QuickActionsEvent): event is QuickActionsEvent {
  return event.eventType === 'quickActions' && 'date' in event;
}

export function mergeWeatherForDates(
  liveWeather: WeatherDay[],
  storedWeatherByDate: Map<string, WeatherSummaryDay>,
  dateIsos: string[],
  todayISO: string,
): WeatherSummaryDay[] {
  const liveWeatherByDate = new Map(liveWeather.map((entry) => [entry.date, entry]));

  return dateIsos.flatMap((dateISO) => {
    const liveEntry = liveWeatherByDate.get(dateISO);
    if (liveEntry) return [liveEntry];

    if (dateISO < todayISO) {
      const storedEntry = storedWeatherByDate.get(dateISO);
      if (storedEntry) return [storedEntry];
    }

    return [];
  });
}
