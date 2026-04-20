import { useMemo } from 'react';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { useResourceStore } from '../../../stores/useResourceStore';
import { useShallow } from 'zustand/react/shallow';
import { useSystemStore } from '../../../stores/useSystemStore';
import { ExplorerDayBlock, type ExplorerDayEventBlock } from './ExplorerDayBlock';
import { useAppDate } from '../../../utils/useAppDate';
import { getWeekDays, format } from '../../../utils/dateUtils';
import { isPlannedEventDue } from '../../../engine/rollover';
import { getResourceIconsForDate } from '../../../utils/resourceSchedule';
import type { Event, PlannedEvent } from '../../../types';
import type { WeatherSummaryDay } from '../../../utils/weatherService';

const ROW_HEIGHT_PX = 200;
const HEADER_HEIGHT_PX = 24;
const MIN_BLOCK_HEIGHT_PX = 8;
interface ExplorerWeekRowProps {
  weekStart: Date;
  weather: WeatherSummaryDay[];
  onSelect?: () => void;
}

function parseMinutes(time: string): number {
  if (!time) return 0;
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
}

interface ColorBlock {
  id: string;
  color: string;
  day: number;
  startTime: string;
  endTime: string;
  markerKey: 'morning' | 'night' | 'rainbow' | null;
}

interface PositionedColorBlock extends ColorBlock {
  colIndex: number;
  colCount: number;
}

function computeExplorerBlockLayout(blocks: ColorBlock[]): PositionedColorBlock[] {
  if (blocks.length === 0) return [];

  const byDay = new Map<number, ColorBlock[]>();
  for (const block of blocks) {
    const dayBlocks = byDay.get(block.day) ?? [];
    dayBlocks.push(block);
    byDay.set(block.day, dayBlocks);
  }

  const positioned: PositionedColorBlock[] = [];

  for (const [day, dayBlocks] of byDay.entries()) {
    const sorted = [...dayBlocks].sort((a, b) => {
      const startDiff = parseMinutes(a.startTime) - parseMinutes(b.startTime);
      if (startDiff !== 0) return startDiff;
      return parseMinutes(b.endTime) - parseMinutes(a.endTime);
    });

    const parsed = sorted.map((block) => {
      const startMin = parseMinutes(block.startTime);
      const endMin = Math.max(startMin + 15, parseMinutes(block.endTime));
      return { block, startMin, endMin };
    });

    const colOf = new Array(parsed.length).fill(0);
    const clusterOf = new Array(parsed.length).fill(-1);
    const clusterIds: number[][] = [];

    for (let i = 0; i < parsed.length; i++) {
      if (clusterOf[i] !== -1) continue;
      const clusterId = clusterIds.length;
      const members = [i];
      clusterOf[i] = clusterId;
      for (let q = 0; q < members.length; q++) {
        const current = parsed[members[q]];
        for (let j = 0; j < parsed.length; j++) {
          if (clusterOf[j] !== -1) continue;
          const candidate = parsed[j];
          if (current.startMin < candidate.endMin && candidate.startMin < current.endMin) {
            clusterOf[j] = clusterId;
            members.push(j);
          }
        }
      }
      clusterIds.push(members);
    }

    const colCountOf = new Array(parsed.length).fill(1);
    for (const members of clusterIds) {
      const memberOrder = [...members].sort((a, b) => parsed[a].startMin - parsed[b].startMin);
      const colEnds: number[] = [];
      for (const index of memberOrder) {
        const column = colEnds.findIndex((endMin) => endMin <= parsed[index].startMin);
        const nextColumn = column === -1 ? colEnds.length : column;
        colOf[index] = nextColumn;
        colEnds[nextColumn] = parsed[index].endMin;
      }
      for (const index of members) colCountOf[index] = colEnds.length;
    }

    parsed.forEach(({ block }, index) => {
      positioned.push({
        ...block,
        day,
        colIndex: colOf[index],
        colCount: colCountOf[index],
      });
    });
  }

  return positioned;
}

export function ExplorerWeekRow({ weekStart, weather, onSelect }: ExplorerWeekRowProps) {
  const days = getWeekDays(weekStart);
  const today = useAppDate();
  const todayISO = format(today, 'iso');
  const resourceMap = useResourceStore((s) => s.resources);
  const resources = useMemo(() => Object.values(resourceMap), [resourceMap]);
  const timePreferences = useSystemStore((s) => s.settings?.timePreferences);
  const weatherByDate = useMemo(() => new Map(weather.map((entry) => [entry.date, entry])), [weather]);

  const [rangeStartH, rangeStartM] = (timePreferences?.explorerView?.startTime ?? '00:00').split(':').map(Number);
  const [rangeEndH, rangeEndM] = (timePreferences?.explorerView?.endTime ?? '23:59').split(':').map(Number);
  const rangeStartMin = (rangeStartH ?? 0) * 60 + (rangeStartM ?? 0);
  const rangeEndMin = (rangeEndH ?? 23) * 60 + (rangeEndM ?? 59);
  const rangeMinutes = Math.max(1, rangeEndMin - rangeStartMin + 1);

  const visibleDays = useMemo(
    () => timePreferences?.explorerView?.visibleDays ?? [0, 1, 2, 3, 4, 5, 6],
    [timePreferences?.explorerView?.visibleDays],
  );
  const visibleDaySet = useMemo(() => new Set(visibleDays), [visibleDays]);

  const { activeEvents, historyEvents, plannedEvents } = useScheduleStore(useShallow((s) => ({
    activeEvents: s.activeEvents,
    historyEvents: s.historyEvents,
    plannedEvents: s.plannedEvents,
  })));

  const blocks = useMemo(() => {
    const next: ColorBlock[] = [];
    const coveredPlannedRefsByDate = new Map<string, Set<string>>();

    const addCoveredPlannedRef = (dateISO: string, plannedEventRef: string | null) => {
      if (!plannedEventRef) return;
      const nextSet = coveredPlannedRefsByDate.get(dateISO) ?? new Set<string>();
      nextSet.add(plannedEventRef);
      coveredPlannedRefsByDate.set(dateISO, nextSet);
    };

    const addBlock = (
      id: string,
      color: string,
      day: number,
      startTime: string,
      endTime: string,
      markerKey: ColorBlock['markerKey'],
    ) => {
      if (day < 0 || day > 6) return;
      next.push({
        id,
        color,
        day,
        startTime,
        endTime,
        markerKey,
      });
    };

    const projectEventForDay = (raw: Event | unknown, day: Date, dayIndex: number) => {
      if (!raw || typeof raw !== 'object' || !('startDate' in raw) || !('endDate' in raw)) return;
        const event = raw as Event;
        const dateISO = format(day, 'iso');
        if (event.startDate > dateISO || event.endDate < dateISO) return;

      const color = event.color ?? (event.plannedEventRef ? plannedEvents[event.plannedEventRef]?.color ?? '#9333ea' : '#9333ea');
      addCoveredPlannedRef(dateISO, event.plannedEventRef);
      const startsToday = event.startDate === dateISO;
      const endsToday = event.endDate === dateISO;
        const isMultiDay = event.startDate !== event.endDate;
        const startTime = event.startDate < dateISO ? '00:00' : event.startTime ?? '00:00';
        const endTime = event.endDate > dateISO ? '23:59' : event.endTime ?? '23:59';
      const markerKey: ColorBlock['markerKey'] = !isMultiDay
        ? (startTime === '00:00' && endTime === '23:59' ? 'rainbow' : null)
        : startsToday
          ? 'night'
          : endsToday
            ? 'morning'
            : 'rainbow';

      addBlock(`${event.id}:${dateISO}`, color, dayIndex, startTime, endTime, markerKey);
    };

    const eventSources = [...Object.values(activeEvents), ...Object.values(historyEvents)];
    for (const rawEvent of eventSources) {
      days.forEach((day, dayIndex) => {
        projectEventForDay(rawEvent, day, dayIndex);
      });
    }

    for (const planned of Object.values(plannedEvents)) {
      days.forEach((day, dayIndex) => {
        const dateISO = format(day, 'iso');
        if (dateISO < todayISO) return;
        const coveredPlannedRefs = coveredPlannedRefsByDate.get(dateISO);
        if (coveredPlannedRefs?.has(planned.id)) return;

        const projectedBlocks = projectPlannedBlocksForDay(planned, day, dayIndex);
        next.push(...projectedBlocks);
      });
    }

    return next;
  }, [activeEvents, historyEvents, plannedEvents, days, todayISO]);
  const positionedBlocks = useMemo(() => computeExplorerBlockLayout(blocks), [blocks]);
  const eventBlocksByDay = useMemo(() => {
    const byDay = new Map<number, ExplorerDayEventBlock[]>();

    for (const block of positionedBlocks) {
      if (!visibleDaySet.has(block.day)) continue;

      const rawStartMin = parseMinutes(block.startTime);
      const rawEndMin = parseMinutes(block.endTime);
      const blockStartMin = Math.max(rangeStartMin, Math.min(rangeEndMin, rawStartMin));
      const blockEndMin = Math.max(blockStartMin, Math.min(rangeEndMin, Math.max(rawEndMin, blockStartMin + 15)));
      const eventAreaTopPx = HEADER_HEIGHT_PX;
      const eventAreaBottomPx = ROW_HEIGHT_PX;
      const eventAreaHeightPx = Math.max(1, eventAreaBottomPx - eventAreaTopPx);
      const rawTopPx = eventAreaTopPx + ((blockStartMin - rangeStartMin) / rangeMinutes) * eventAreaHeightPx;
      const bottomPx = eventAreaTopPx + ((blockEndMin - rangeStartMin) / rangeMinutes) * eventAreaHeightPx;
      const unclampedHeightPx = Math.max(
        MIN_BLOCK_HEIGHT_PX,
        bottomPx - rawTopPx,
      );
      const heightPx = Math.min(unclampedHeightPx, eventAreaHeightPx);
      const topPx = Math.max(
        eventAreaTopPx,
        Math.min(rawTopPx, eventAreaBottomPx - heightPx),
      );

      const dayBlocks = byDay.get(block.day) ?? [];
      dayBlocks.push({
          id: block.id,
          color: block.color,
          markerKey: block.markerKey,
          topPx,
          heightPx,
          leftPercent: (block.colIndex / block.colCount) * 100,
          widthPercent: (1 / block.colCount) * 100,
        });
      byDay.set(block.day, dayBlocks);
    }

    return byDay;
  }, [positionedBlocks, rangeEndMin, rangeMinutes, rangeStartMin, visibleDaySet]);

  return (
    <div
      className="relative flex min-w-0 cursor-pointer overflow-hidden border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
      style={{ height: `${ROW_HEIGHT_PX}px` }}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect?.(); }}
    >
      {days.filter((_, i) => visibleDaySet.has(i)).map((day) => {
        const dateISO = format(day, 'iso');
        return (
          <ExplorerDayBlock
            key={dateISO}
            date={day}
            resourceIcons={getResourceIconsForDate(dateISO, resources).slice(0, 1)}
            weather={weatherByDate.get(dateISO) ?? null}
            eventBlocks={eventBlocksByDay.get(days.indexOf(day)) ?? []}
          />
        );
      })}
    </div>
  );
}

function projectPlannedBlocksForDay(
  planned: PlannedEvent,
  day: Date,
  dayIndex: number,
): ColorBlock[] {
  const dateISO = format(day, 'iso');

  if (planned.dieDate && planned.seedDate <= dateISO && planned.dieDate >= dateISO) {
    const startsToday = planned.seedDate === dateISO;
    const endsToday = planned.dieDate === dateISO;
    const startTime = planned.seedDate < dateISO ? '00:00' : planned.startTime;
    const endTime = planned.dieDate > dateISO ? '23:59' : planned.endTime;
    const markerKey: ColorBlock['markerKey'] = startsToday
      ? 'night'
      : endsToday
        ? 'morning'
        : 'rainbow';

    return [{
      id: `planned-${planned.id}:${dateISO}`,
      color: planned.color,
      day: dayIndex,
      startTime,
      endTime,
      markerKey,
    }];
  }

  const previousDate = format(new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1), 'iso');
  const dueToday = isPlannedEventDue(planned, dateISO);
  const dueYesterday = isPlannedEventDue(planned, previousDate);
  const isOvernight = parseMinutes(planned.endTime) < parseMinutes(planned.startTime);
  const projected: ColorBlock[] = [];

  if (dueYesterday && isOvernight) {
    projected.push({
      id: `planned-${planned.id}:${dateISO}:carry`,
      color: planned.color,
      day: dayIndex,
      startTime: '00:00',
      endTime: planned.endTime,
      markerKey: 'morning',
    });
  }

  if (dueToday) {
    const startTime = planned.startTime;
    const endTime = isOvernight ? '23:59' : planned.endTime;
    const markerKey: ColorBlock['markerKey'] = startTime === '00:00' && endTime === '23:59'
      ? 'rainbow'
      : null;

    projected.push({
      id: `planned-${planned.id}:${dateISO}:${isOvernight ? 'start' : 'single'}`,
      color: planned.color,
      day: dayIndex,
      startTime,
      endTime,
      markerKey: isOvernight ? 'night' : markerKey,
    });
  }

  return projected;
}
