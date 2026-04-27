import { useRef, useState, useLayoutEffect, useEffect, useMemo } from 'react';
import { useAppDate } from '../../../utils/useAppDate';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { useSystemStore } from '../../../stores/useSystemStore';
import { useResourceStore } from '../../../stores/useResourceStore';
import { useShallow } from 'zustand/react/shallow';
import { WeekEventCard } from './WeekEventCard';
import { IconDisplay } from '../../shared/IconDisplay';
import { format, getOffsetNow, isSameDay } from '../../../utils/dateUtils';
import { isPlannedEventDue } from '../../../engine/rollover';
import { getResourceIndicatorsForDate } from '../../../utils/resourceSchedule';
import type { Event, PlannedEvent } from '../../../types';
import type { WeatherSummaryDay } from '../../../utils/weatherService';

const HOUR_HEIGHT_PX = 60;
const MIN_EVENT_HEIGHT = 24;
const GRID_HEIGHT = 24 * HOUR_HEIGHT_PX;

function parseMinutes(time: string): number {
  if (!time) return 0;
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
}

interface LayoutItem {
  ev: Event | PlannedEvent;
  topPx: number;
  heightPx: number;
  colIndex: number;
  colCount: number;
  colSpan: number;
}

function computeWeekDayLayout(events: Array<Event | PlannedEvent>): LayoutItem[] {
  if (events.length === 0) return [];

  const parsed = events.map((ev) => {
    const startMin = parseMinutes((ev as { startTime?: string }).startTime ?? '00:00');
    const rawEnd = parseMinutes((ev as { endTime?: string }).endTime ?? '01:00');
    const endMin = rawEnd > startMin ? rawEnd : startMin + 15;
    return { ev, startMin, endMin };
  });

  parsed.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const n = parsed.length;
  const clusterIdx = new Array<number>(n).fill(-1);
  const clusters: number[][] = [];

  for (let i = 0; i < n; i++) {
    if (clusterIdx[i] !== -1) continue;
    const clusterId = clusters.length;
    const members: number[] = [i];
    clusterIdx[i] = clusterId;
    for (let qi = 0; qi < members.length; qi++) {
      const a = parsed[members[qi]];
      for (let k = 0; k < n; k++) {
        if (clusterIdx[k] !== -1) continue;
        const b = parsed[k];
        if (a.startMin < b.endMin && b.startMin < a.endMin) {
          clusterIdx[k] = clusterId;
          members.push(k);
        }
      }
    }
    clusters.push(members);
  }

  const colOf = new Array<number>(n).fill(0);
  const colCountOf = new Array<number>(n).fill(1);

  for (const members of clusters) {
    const sorted = [...members].sort((a, b) => parsed[a].startMin - parsed[b].startMin);
    const colEnds: number[] = [];
    for (const idx of sorted) {
      const s = parsed[idx].startMin;
      let col = colEnds.findIndex((et) => et <= s);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(0);
      }
      colOf[idx] = col;
      colEnds[col] = parsed[idx].endMin;
    }
    for (const idx of members) colCountOf[idx] = colEnds.length;
  }

  const spanOf = new Array<number>(n).fill(1);
  for (const members of clusters) {
    const totalCols = colCountOf[members[0]];
    for (const idx of members) {
      let span = 1;
      for (let c = colOf[idx] + 1; c < totalCols; c++) {
        const blocked = members.some(
          (j) => j !== idx && colOf[j] === c &&
            parsed[j].startMin < parsed[idx].endMin &&
            parsed[idx].startMin < parsed[j].endMin,
        );
        if (blocked) break;
        span++;
      }
      spanOf[idx] = span;
    }
  }

  return parsed.map((p, i) => {
    const topPx = (p.startMin / 60) * HOUR_HEIGHT_PX;
    const durationMin = p.endMin - p.startMin;
    const heightPx = Math.max(MIN_EVENT_HEIGHT, (durationMin / 60) * HOUR_HEIGHT_PX);
    return { ev: p.ev, topPx, heightPx, colIndex: colOf[i], colCount: colCountOf[i], colSpan: spanOf[i] };
  });
}

interface WeekDayBlockProps {
  date: Date;
  weather: WeatherSummaryDay | null;
  onDaySelect?: (date: Date) => void;
}

interface WeekProjectedEvent extends Event {
  renderId?: string;
  multiDayLabel?: string;
}

interface WeekProjectedPlannedEvent extends PlannedEvent {
  renderId?: string;
  multiDayLabel?: string;
}

export function WeekDayBlock({ date, weather, onDaySelect }: WeekDayBlockProps) {
  const { activeEvents, historyEvents, plannedEvents } = useScheduleStore(useShallow((s) => ({
    activeEvents: s.activeEvents,
    historyEvents: s.historyEvents,
    plannedEvents: s.plannedEvents,
  })));
  const resourceMap = useResourceStore((s) => s.resources);
  const resources = useMemo(() => Object.values(resourceMap), [resourceMap]);

  const today = useAppDate();
  const isPast = date < today;
  const isToday = isSameDay(date, today);
  const isFuture = date > today;
  const dateIso = format(date, 'iso');
  const [openIndicatorKey, setOpenIndicatorKey] = useState<string | null>(null);
  const resourceIndicators = getResourceIndicatorsForDate(dateIso, resources).slice(0, 2);
  const activeIndicator = resourceIndicators.find((indicator) => `${indicator.resourceId}:${indicator.label}` === openIndicatorKey) ?? null;

  const dayEvents: Array<WeekProjectedEvent | WeekProjectedPlannedEvent> = [];
  const projectEventForDay = (raw: Event | unknown) => {
    if (!raw || typeof raw !== 'object' || !('startDate' in raw) || !('endDate' in raw) || !('name' in raw)) return;
    const event = raw as Event;
    if (event.startDate > dateIso || event.endDate < dateIso) return;

    const startsToday = event.startDate === dateIso;
    const endsToday = event.endDate === dateIso;
    const isMultiDay = event.startDate !== event.endDate;

      dayEvents.push({
        ...event,
        renderId: `${event.id}:${dateIso}`,
        startTime: event.startDate < dateIso ? '00:00' : event.startTime,
        endTime: event.endDate > dateIso ? '23:59' : event.endTime,
        multiDayLabel: !isMultiDay
        ? undefined
        : startsToday
          ? 'continues'
          : endsToday
            ? `started ${event.startDate}`
            : 'all day',
    });
  };

  Object.values(activeEvents).forEach((e) => projectEventForDay(e));
  Object.values(historyEvents).forEach((e) => projectEventForDay(e));

  if (isFuture) {
    Object.values(plannedEvents).forEach((pe) => {
      const isOvernight = parseMinutes(pe.endTime) < parseMinutes(pe.startTime);
      const previousDate = format(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1), 'iso');
      const dueToday = isPlannedEventDue(pe, dateIso);
      const dueYesterday = isPlannedEventDue(pe, previousDate);
      const yesterdayIsDieDate = pe.dieDate === previousDate;

      // Deduplication logic for overnight routines
      let hasMaterializedMorning = false;
      let hasMaterializedEvening = false;
      if (isOvernight) {
        // Check all active/history events for this planned id on this date
        const allEvents = [...Object.values(activeEvents), ...Object.values(historyEvents)];
        for (const evRaw of allEvents) {
          const ev = evRaw as Event;
          if (
            ev && typeof ev === 'object' &&
            'plannedEventRef' in ev &&
            ev.plannedEventRef === pe.id &&
            'startTime' in ev &&
            'startDate' in ev && 'endDate' in ev &&
            ev.startDate <= dateIso && ev.endDate >= dateIso
          ) {
            // Suppress planned morning block if a materialized event started previous day at planned.startTime and ends today at planned.endTime
            if (
              ev.startDate === previousDate &&
              ev.endDate === dateIso &&
              ev.startTime === pe.startTime &&
              ev.endTime === pe.endTime
            ) {
              hasMaterializedMorning = true;
            }
            // Only count as materialized evening if this matches the planned startTime and starts today
            if (ev.startTime === pe.startTime && ev.startDate === dateIso) {
              hasMaterializedEvening = true;
            }
          }
        }
        // Project morning block if not covered
        if (dueYesterday || yesterdayIsDieDate) {
          if (!hasMaterializedMorning) {
            dayEvents.push({
              ...pe,
              renderId: `${pe.id}:${dateIso}:carry`,
              startTime: '00:00',
              endTime: pe.endTime,
              multiDayLabel: `started ${previousDate}`,
            });
          }
        }
        // Project evening block if not covered
        if (dueToday) {
          if (!hasMaterializedEvening) {
            dayEvents.push({
              ...pe,
              renderId: `${pe.id}:${dateIso}:start`,
              startTime: pe.startTime,
              endTime: '23:59',
              multiDayLabel: 'continues',
            });
          }
        }
      } else if (dueToday) {
        dayEvents.push({
          ...pe,
          startTime: pe.startTime,
          endTime: pe.endTime,
        });
      }
    });
  }

  const gridRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(GRID_HEIGHT);
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    setContainerHeight(el.clientHeight);
    const ro = new ResizeObserver(() => setContainerHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [nowPct, setNowPct] = useState(() => {
    const n = getOffsetNow();
    return ((n.getHours() * 60 + n.getMinutes()) / (24 * 60)) * 100;
  });
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => {
      const n = getOffsetNow();
      setNowPct(((n.getHours() * 60 + n.getMinutes()) / (24 * 60)) * 100);
    }, 60_000);
    return () => clearInterval(id);
  }, [isToday]);

  const layouts = computeWeekDayLayout(dayEvents);
  const timePreferences = useSystemStore((s) => s.settings?.timePreferences);
  const startHour = parseInt((timePreferences?.weekView?.startTime ?? '06:00').split(':')[0]);
  const endHour = parseInt((timePreferences?.weekView?.endTime ?? '22:00').split(':')[0]);
  const visibleHours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const clipOffsetPx = startHour * HOUR_HEIGHT_PX;
  const visibleGridH = (endHour - startHour + 1) * HOUR_HEIGHT_PX;
  const visibleScale = containerHeight > 0 ? containerHeight / visibleGridH : 1;
  const visibleNowPct = isToday
    ? Math.max(0, Math.min(100, (((nowPct / 100) * GRID_HEIGHT) - clipOffsetPx) / visibleGridH * 100))
    : 0;

  function resolveColor(ev: Event | PlannedEvent): string {
    if ('color' in ev && (ev as PlannedEvent).color) return (ev as PlannedEvent).color;
    const evt = ev as Event;
    if (evt.color) return evt.color;
    if (evt.plannedEventRef) return plannedEvents[evt.plannedEventRef]?.color ?? '#9333ea';
    return '#9333ea';
  }

  return (
    <div
      className={`flex h-full min-w-[240px] flex-1 flex-col rounded-lg border bg-white transition-colors dark:bg-gray-800 ${isToday ? 'border-purple-400' : 'border-gray-200 dark:border-gray-700'} ${isPast ? 'opacity-40' : ''} ${onDaySelect ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700' : ''}`}
      role={onDaySelect ? 'button' : undefined}
      tabIndex={onDaySelect ? 0 : undefined}
      onClick={() => onDaySelect?.(date)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onDaySelect?.(date); }}
    >
      <div className="relative flex items-center justify-between gap-2 border-b border-gray-100 px-2 py-1 dark:border-gray-700">
        <span className={`text-xs font-semibold ${isToday ? 'text-purple-600' : 'text-gray-700 dark:text-gray-200'}`}>
          {date.toLocaleDateString(undefined, { weekday: 'short' })} {format(date, 'short')}
        </span>

        <div className="flex min-h-3 items-center gap-1 text-[10px] text-gray-500 dark:text-gray-300">
          {resourceIndicators.map((indicator) => (
            <button
              key={`${indicator.resourceId}:${indicator.iconKey}:${indicator.label}`}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                const key = `${indicator.resourceId}:${indicator.label}`;
                setOpenIndicatorKey((current) => (current === key ? null : key));
              }}
              className="rounded-sm p-0.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label={`${indicator.label} for ${indicator.resourceName}`}
            >
              <IconDisplay iconKey={indicator.iconKey} size={12} className="h-3 w-3 object-contain" alt="" />
            </button>
          ))}
          {weather && <IconDisplay iconKey={weather.icon} size={12} className="h-3 w-3 object-contain" alt="" />}
          {weather && <span>{`${weather.high}°`}</span>}
        </div>
        {activeIndicator && (
          <div
            className="absolute right-2 top-full z-20 mt-1 w-52 rounded-xl border border-gray-200 bg-white p-2 text-left shadow-lg dark:border-gray-700 dark:bg-gray-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="text-xs font-semibold text-gray-800 dark:text-gray-100">{activeIndicator.label}</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">{activeIndicator.resourceName}</div>
          </div>
        )}
      </div>

      <div ref={gridRef} className="relative flex-1 w-full overflow-hidden">
        {visibleHours.map((h) => (
          <div
            key={h}
            className="absolute left-0 right-0 border-t border-gray-100 dark:border-gray-700/50"
            style={{ top: `${((h - startHour) / (endHour - startHour + 1)) * 100}%` }}
          />
        ))}

        {layouts.map((layout) => {
          const ev = layout.ev;
          const multiDayLabel = typeof (ev as { multiDayLabel?: unknown }).multiDayLabel === 'string'
            ? (ev as { multiDayLabel?: string }).multiDayLabel
            : undefined;
          const color = resolveColor(ev);
          const widthPercent = (layout.colSpan / layout.colCount) * 100;
          const leftPercent = (layout.colIndex / layout.colCount) * 100;
          const endMin = (ev as { endTime?: string }).endTime
            ? (() => { const [h = 0, m = 0] = ((ev as { endTime?: string }).endTime ?? '').split(':').map(Number); return h * 60 + m; })()
            : null;
          const isPastEvent = isToday && endMin !== null && endMin <= (nowPct / 100) * 24 * 60;
          const rawTopPx = layout.topPx;
          const rawBottomPx = layout.topPx + layout.heightPx;
          const clippedTopRaw = Math.max(clipOffsetPx, rawTopPx);
          const clippedBottomRaw = Math.min(clipOffsetPx + visibleGridH, rawBottomPx);
          const clippedTopPx = Math.max(0, (clippedTopRaw - clipOffsetPx) * visibleScale);
          const clippedHeightPx = Math.max(
            MIN_EVENT_HEIGHT * visibleScale,
            (clippedBottomRaw - clippedTopRaw) * visibleScale,
          );

          return (
            <WeekEventCard
              key={('renderId' in ev && typeof ev.renderId === 'string') ? ev.renderId : ev.id}
              name={'name' in ev ? ev.name : '-'}
              multiDayLabel={multiDayLabel}
              color={color}
              topPx={clippedTopPx}
              heightPx={clippedHeightPx}
              leftPercent={leftPercent}
              widthPercent={widthPercent}
              muted={isPastEvent}
            />
          );
        })}

        {isToday && (
          <div
            className="absolute left-0 right-0 z-[5] bg-gray-400/20 pointer-events-none dark:bg-gray-900/40"
            style={{ top: 0, height: `${visibleNowPct}%` }}
          />
        )}

        {isToday && (
          <div
            className="absolute left-0 right-0 z-10 h-0.5 bg-purple-500 pointer-events-none"
            style={{ top: `${visibleNowPct}%` }}
          />
        )}
      </div>
    </div>
  );
}
