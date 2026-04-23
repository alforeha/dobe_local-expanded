import { useEffect, useMemo, useState } from 'react';
import { IconDisplay } from '../../shared/IconDisplay';
import { useResourceStore } from '../../../stores/useResourceStore';
import { useAppDate } from '../../../utils/useAppDate';
import { format } from '../../../utils/dateUtils';
import { getResourceIndicatorsForDate, type ResourceIndicator } from '../../../utils/resourceSchedule';
import type { WeatherSummaryDay } from '../../../utils/weatherService';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface DayViewHeaderProps {
  date: Date;
  weather: WeatherSummaryDay | null;
  hasLocation: boolean;
  weatherLoading: boolean;
  onWeatherOpen?: () => void;
  onResourceOpen?: () => void;
  onBack: () => void;
  onForward: () => void;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function relativeLabel(appDate: Date, date: Date): string {
  const diff = daysBetween(appDate, date);
  if (diff === 0) return 'Today';
  return diff < 0 ? `${Math.abs(diff)} days ago` : `${diff} days away`;
}

export function DayViewHeader({ date, weather, hasLocation, weatherLoading, onWeatherOpen, onResourceOpen, onBack, onForward }: DayViewHeaderProps) {
  const appDate = useAppDate();
  const resourceMap = useResourceStore((s) => s.resources);
  const resources = useMemo(() => Object.values(resourceMap), [resourceMap]);
  const dateISO = format(date, 'iso');
  const [openIndicatorKey, setOpenIndicatorKey] = useState<string | null>(null);
  const isToday = dateISO === format(appDate, 'iso');
  const resourceIndicators = getResourceIndicatorsForDate(dateISO, resources);
  const visibleIndicators = resourceIndicators.length > 5 ? resourceIndicators.slice(0, 4) : resourceIndicators.slice(0, 5);
  const hiddenCount = Math.max(0, resourceIndicators.length - visibleIndicators.length);
  const activeIndicator = visibleIndicators.find((indicator) => `${indicator.resourceId}:${indicator.label}` === openIndicatorKey) ?? null;

  const showWeatherButton = Boolean(weather) || (isToday && !weatherLoading);

  useEffect(() => {
    setOpenIndicatorKey(null);
  }, [dateISO]);

  function indicatorKey(indicator: ResourceIndicator): string {
    return `${indicator.resourceId}:${indicator.label}`;
  }

  return (
    <div className={`flex shrink-0 items-stretch border-b ${isToday ? 'border-purple-200 bg-purple-50 dark:border-purple-700/60 dark:bg-purple-900/20' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'}`}>
      <button
        type="button"
        aria-label="Previous day"
        onClick={onBack}
        className={`flex w-[15%] items-center justify-center rounded-l-full text-xl transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${isToday ? 'text-purple-500 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'}`}
      >
        {'<'}
      </button>

      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2">
        <div className="min-w-0">
          <div className={`text-sm font-semibold ${isToday ? 'text-purple-700 dark:text-purple-300' : 'text-gray-800 dark:text-gray-100'}`}>
            {DAY_NAMES[date.getDay()]} {MONTH_NAMES[date.getMonth()]} {date.getDate()}
          </div>
          <div className={`text-xs ${isToday ? 'text-purple-600 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'}`}>{relativeLabel(appDate, date)}</div>
        </div>

        <div className="flex self-stretch items-center gap-4 text-xs text-gray-500 dark:text-gray-300">
          <div className="relative flex items-center gap-1 self-stretch">
            {resourceIndicators.length > 0 && (
              <>
                {visibleIndicators.map((indicator, index) => (
                  <button
                    key={`${indicator.resourceId}:${indicator.iconKey}:${index}`}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      const key = indicatorKey(indicator);
                      setOpenIndicatorKey((current) => (current === key ? null : key));
                    }}
                    className="rounded-md p-0.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                    aria-label={`${indicator.label} for ${indicator.resourceName}`}
                  >
                    <IconDisplay
                      iconKey={indicator.iconKey}
                      size={20}
                      className="h-5 w-5 object-contain"
                      alt=""
                    />
                  </button>
                ))}
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={onResourceOpen}
                    className="flex items-center self-center rounded-full border border-gray-300 px-1 text-[10px] leading-4 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
                    aria-label="Open resource reminders"
                  >
                    +{hiddenCount}
                  </button>
                )}
                {activeIndicator && (
                  <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-xl border border-gray-200 bg-white p-2 text-left shadow-lg dark:border-gray-700 dark:bg-gray-900">
                    <div className="text-xs font-semibold text-gray-800 dark:text-gray-100">{activeIndicator.label}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">{activeIndicator.resourceName}</div>
                  </div>
                )}
              </>
            )}
          </div>

          {showWeatherButton && (
            <button
              type="button"
              onClick={onWeatherOpen}
              className="flex items-center gap-1 self-stretch whitespace-nowrap rounded-md border border-gray-200 px-2 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {weather ? (
                <>
                  <IconDisplay iconKey={weather.icon} size={16} className="h-4 w-4 object-contain" alt="" />
                  <span>{`${weather.high}\u00b0 / ${weather.low}\u00b0`}</span>
                </>
              ) : weatherLoading ? (
                <span className="text-gray-400 dark:text-gray-500">...</span>
              ) : (
                <span>{hasLocation ? 'Forecast' : 'Set location'}</span>
              )}
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        aria-label="Next day"
        onClick={onForward}
        className={`flex w-[15%] items-center justify-center rounded-r-full text-xl transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${isToday ? 'text-purple-500 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'}`}
      >
        {'>'}
      </button>
    </div>
  );
}
