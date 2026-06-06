import { useState, useMemo, useRef, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useScheduleStore } from '../../../../stores/useScheduleStore';
import { useSystemStore } from '../../../../stores/useSystemStore';
import { OneOffEventPopup } from '../../menu/rooms/ScheduleRoom/OneOffEventPopup';
import { TimeViewFilterSettings } from '../../profile/rooms/PreferencesRoom/TimeViewFilterSettings';
import { isPlannedEventDue } from '../../../../engine/rollover';
import { localISODate, addDays } from '../../../../utils/dateUtils';
import type { Event, QuickActionsEvent } from '../../../../types/event';
import type { PlannedEvent, OccurrenceOverride } from '../../../../types/plannedEvent';

function parseMinutes(time: string): number {
  if (!time || !time.includes(':')) return 0;

  const [hoursRaw, minutesRaw] = time.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
  return hours * 60 + minutes;
}

interface CCLayout {
  planned: PlannedEvent;
  startMin: number;
  endMin: number;
  topPx: number;
  heightPx: number;
  colIndex: number;
  colCount: number;
  ghostLabel?: string;
  spanKey: string;
}

interface CCActiveLayout {
  event: Event;
  startMin: number;
  endMin: number;
  topPx: number;
  heightPx: number;
  colIndex: number;
  colCount: number;
  spanKey: string;
  ghostLabel?: string;
}

interface GapRow {
  dayIndex: number;
  topPx: number;
  heightPx: number;
  label: string;
  gapStartMin: number;
  gapEndMin: number;
}

interface GapMap {
  offsets: Map<string, number>;
  rows: GapRow[];
}

const PX_PER_MIN = 1.0;
const MIN_VISUAL_H = 15;
const HOUR_HEIGHT = 60;
const HEADER_H = 32;

function buildGapMap(
  eventBands: Array<{ startMin: number; endMin: number }>,
  visibleStartMin: number,
  visibleEndMin: number,
  dayIndex: number,
  clipTop: number,
  dayBaseY: number,
): GapMap {
  const MIN_GAP = 15;
  const COMPRESSED_H = MIN_VISUAL_H;
  const offsets = new Map<string, number>();
  const rows: GapRow[] = [];
  const sorted = [...eventBands].sort((a, b) => a.startMin - b.startMin);

  const coverage: Array<{ start: number; end: number }> = [];
  for (const band of sorted) {
    if (coverage.length === 0) {
      coverage.push({ start: band.startMin, end: band.endMin });
      continue;
    }

    const last = coverage[coverage.length - 1];
    if (band.startMin <= last.end) {
      last.end = Math.max(last.end, band.endMin);
      continue;
    }

    coverage.push({ start: band.startMin, end: band.endMin });
  }

  const gapBands: Array<{ start: number; end: number }> = [];
  let cursor = visibleStartMin;
  for (const band of coverage) {
    if (band.start > cursor) {
      gapBands.push({ start: cursor, end: band.start });
    }
    cursor = Math.max(cursor, band.end);
  }

  if (cursor < visibleEndMin) {
    gapBands.push({ start: cursor, end: visibleEndMin });
  }

  let cumulativeOffset = 0;
  for (const gap of gapBands) {
    const gapMin = gap.end - gap.start;
    if (gapMin < MIN_GAP) continue;

    const naturalH = gapMin * PX_PER_MIN;
    const compressedH = COMPRESSED_H;
    const saving = naturalH - compressedH;
    const gapTopNatural = dayBaseY + HEADER_H +
      ((gap.start - clipTop) * PX_PER_MIN) - cumulativeOffset;

    const startH = Math.floor(gap.start / 60);
    const startM = gap.start % 60;
    const endH = Math.floor(gap.end / 60);
    const endM = gap.end % 60;
    const durH = Math.floor(gapMin / 60);
    const durM = gapMin % 60;
    const timeStr =
      String(startH).padStart(2, '0') + ':' + String(startM).padStart(2, '0') +
      ' - ' +
      String(endH).padStart(2, '0') + ':' + String(endM).padStart(2, '0');
    const durStr = durH > 0
      ? durH + 'h ' + (durM > 0 ? durM + 'm ' : '')
      : durM + 'm ';
    const label = timeStr + '  ' + durStr + 'Buffer';

    rows.push({
      dayIndex,
      topPx: gapTopNatural,
      heightPx: compressedH,
      label,
      gapStartMin: gap.start,
      gapEndMin: gap.end,
    });

    offsets.set(gap.start + ':' + dayIndex, cumulativeOffset + saving);
    cumulativeOffset += saving;
  }

  return { offsets, rows };
}

function applyGapOffset(
  topPx: number,
  startMin: number,
  dayIndex: number,
  gapRows: GapRow[],
): number {
  let offset = 0;

  for (const row of gapRows) {
    if (row.dayIndex !== dayIndex) continue;
    if (row.gapEndMin <= startMin) {
      const naturalH = (row.gapEndMin - row.gapStartMin) * PX_PER_MIN;
      offset += naturalH - row.heightPx;
    }
  }

  return topPx - offset;
}

function computeCCLayout(
  events: Array<{ planned: PlannedEvent; startsBeforeDay: boolean; endsAfterDay: boolean }>,
  dateISO: string,
  dayBaseY: number,
  clipTop: number,
  visibleStartMin: number,
  visibleEndMin: number,
): CCLayout[] {
  const effectiveEvents = events
    .flatMap((entry) => {
      const planned = entry.planned;
      const override = planned.occurrenceOverrides?.[dateISO];
      const startTime = entry.startsBeforeDay ? '00:00' : (override?.startTime ?? planned.startTime);
      const endTime = entry.endsAfterDay ? '23:59' : (override?.endTime ?? planned.endTime);
      const rawStartMin = entry.startsBeforeDay ? 0 : parseMinutes(startTime);
      let rawEndMin = entry.endsAfterDay ? 24 * 60 : parseMinutes(endTime);
      if (rawEndMin <= rawStartMin) rawEndMin = rawStartMin + 30;

      const displayStartMin = Math.max(rawStartMin, visibleStartMin);
      const displayEndMin = Math.min(rawEndMin, visibleEndMin);
      if (displayEndMin <= displayStartMin) return [];

      const topClipped = rawStartMin < visibleStartMin;
      const bottomClipped = rawEndMin > visibleEndMin;
      const ghostLabel = topClipped && bottomClipped
        ? '^ began ' + planned.startTime + ' v continues ' + planned.endTime
        : topClipped
          ? '^ began ' + planned.startTime
          : bottomClipped
            ? 'continues til ' + planned.endTime + ' v'
            : undefined;

      return [{
        planned: {
          ...planned,
          startTime,
          endTime,
        },
        startMin: displayStartMin,
        endMin: displayEndMin,
        ghostLabel,
      }];
    })
    .sort((left, right) => left.startMin - right.startMin);

  const layouts: CCLayout[] = [];
  let cluster: Array<{
    planned: PlannedEvent;
    startMin: number;
    endMin: number;
    ghostLabel?: string;
  }> = [];
  let clusterEnd = -1;

  const flushCluster = () => {
    if (cluster.length === 0) return;

    const assigned: Array<{
      planned: PlannedEvent;
      startMin: number;
      endMin: number;
      colIndex: number;
      ghostLabel?: string;
    }> = [];
    const columnEndTimes: number[] = [];

    for (const event of cluster) {
      let colIndex = columnEndTimes.findIndex((endMin) => event.startMin >= endMin);
      if (colIndex === -1) {
        colIndex = columnEndTimes.length;
        columnEndTimes.push(event.endMin);
      } else {
        columnEndTimes[colIndex] = event.endMin;
      }

      assigned.push({ ...event, colIndex });
    }

    const colCount = Math.max(1, columnEndTimes.length);
    for (const event of assigned) {
      layouts.push({
        planned: event.planned,
        startMin: event.startMin,
        endMin: event.endMin,
        topPx: dayBaseY + HEADER_H + ((event.startMin - clipTop) * PX_PER_MIN),
        heightPx: Math.max(MIN_VISUAL_H, (event.endMin - event.startMin) * PX_PER_MIN),
        colIndex: event.colIndex,
        colCount,
        ghostLabel: event.ghostLabel,
        spanKey: event.planned.id,
      });
    }

    cluster = [];
    clusterEnd = -1;
  };

  for (const event of effectiveEvents) {
    if (cluster.length === 0) {
      cluster = [event];
      clusterEnd = event.endMin;
      continue;
    }

    const overlapsCluster = event.startMin < clusterEnd;
    if (!overlapsCluster) {
      flushCluster();
      cluster = [event];
      clusterEnd = event.endMin;
      continue;
    }

    cluster.push(event);
    clusterEnd = Math.max(clusterEnd, event.endMin);
  }

  flushCluster();
  return layouts;
}

function computeActiveLayout(
  events: Event[],
  dateISO: string,
  dayBaseY: number,
  clipTop: number,
  visibleStartMin: number,
  visibleEndMin: number,
): CCActiveLayout[] {
  const effectiveEvents = events
    .filter((event) => event.eventType !== 'quickActions')
    .filter((event) => event.startDate === dateISO || (event.startDate < dateISO && event.endDate >= dateISO))
    .flatMap((event) => {
      const startsBeforeDay = event.startDate < dateISO;
      const rawStartMin = startsBeforeDay ? 0 : parseMinutes(event.startTime);
      let rawEndMin = parseMinutes(event.endTime);

      if (!startsBeforeDay && event.endDate > dateISO) {
        rawEndMin = 24 * 60;
      }

      if (rawEndMin <= rawStartMin) rawEndMin = rawStartMin + 30;

      const displayStartMin = Math.max(rawStartMin, visibleStartMin);
      const displayEndMin = Math.min(rawEndMin, visibleEndMin);
      if (displayEndMin <= displayStartMin) return [];

      const topClipped = rawStartMin < visibleStartMin;
      const bottomClipped = rawEndMin > visibleEndMin;
      const ghostLabel = topClipped && bottomClipped
        ? '^ began ' + event.startTime + ' v continues ' + event.endTime
        : topClipped
          ? '^ began ' + event.startTime
          : bottomClipped
            ? 'continues til ' + event.endTime + ' v'
            : undefined;

      return [{
        event,
        startMin: displayStartMin,
        endMin: displayEndMin,
        ghostLabel,
      }];
    })
    .sort((left, right) => left.startMin - right.startMin);

  const layouts: CCActiveLayout[] = [];
  let cluster: Array<{ event: Event; startMin: number; endMin: number; ghostLabel?: string }> = [];
  let clusterEnd = -1;

  const flushCluster = () => {
    if (cluster.length === 0) return;

    const assigned: Array<{ event: Event; startMin: number; endMin: number; colIndex: number; ghostLabel?: string }> = [];
    const columnEndTimes: number[] = [];

    for (const entry of cluster) {
      let colIndex = columnEndTimes.findIndex((endMin) => entry.startMin >= endMin);
      if (colIndex === -1) {
        colIndex = columnEndTimes.length;
        columnEndTimes.push(entry.endMin);
      } else {
        columnEndTimes[colIndex] = entry.endMin;
      }

      assigned.push({ ...entry, colIndex });
    }

    const colCount = Math.max(1, columnEndTimes.length);
    for (const entry of assigned) {
      layouts.push({
        event: entry.event,
        startMin: entry.startMin,
        endMin: entry.endMin,
        topPx: dayBaseY + HEADER_H + ((entry.startMin - clipTop) * PX_PER_MIN),
        heightPx: Math.max(MIN_VISUAL_H, (entry.endMin - entry.startMin) * PX_PER_MIN),
        colIndex: entry.colIndex,
        colCount,
        spanKey: entry.event.id,
        ghostLabel: entry.ghostLabel,
      });
    }

    cluster = [];
    clusterEnd = -1;
  };

  for (const entry of effectiveEvents) {
    if (cluster.length === 0) {
      cluster = [entry];
      clusterEnd = entry.endMin;
      continue;
    }

    const overlapsCluster = entry.startMin < clusterEnd;
    if (!overlapsCluster) {
      flushCluster();
      cluster = [entry];
      clusterEnd = entry.endMin;
      continue;
    }

    cluster.push(entry);
    clusterEnd = Math.max(clusterEnd, entry.endMin);
  }

  flushCluster();
  return layouts;
}

function findExpandedMatch(
  expandedCardId: string | null,
  filteredDays: Array<{
    dateISO: string;
    label: string;
    events: Array<{ planned: PlannedEvent; startsBeforeDay: boolean; endsAfterDay: boolean }>;
  }>,
  todayISO: string,
  todayActiveEvents: Event[],
  allDaySavings: Record<string, number>,
  clipTop: number,
  daySectionH: number,
  visibleStartMin: number,
  visibleEndMin: number,
) {
  if (!expandedCardId) return null;

  let dayBaseY = 0;

  for (let dayIndex = 0; dayIndex < filteredDays.length; dayIndex += 1) {
    const day = filteredDays[dayIndex];
    const isToday = day.dateISO === todayISO;
    if (isToday) {
      const activeLayouts = computeActiveLayout(
        todayActiveEvents,
        day.dateISO,
        dayBaseY,
        clipTop,
        visibleStartMin,
        visibleEndMin,
      );
      const match = activeLayouts.find(
        (layout) => layout.spanKey === expandedCardId,
      );
      if (match) {
        return {
          kind: 'active' as const,
          event: match.event,
          dateISO: day.dateISO,
          label: day.label,
        };
      }
      dayBaseY += daySectionH - (allDaySavings[day.dateISO] ?? 0);
      continue;
    }

    const layouts = computeCCLayout(
      day.events,
      day.dateISO,
      dayBaseY,
      clipTop,
      visibleStartMin,
      visibleEndMin,
    );
    const match = layouts.find(
      (layout) => layout.spanKey === expandedCardId,
    );
    if (match) {
      return {
        kind: 'planned' as const,
        planned: match.planned,
        dateISO: day.dateISO,
        label: day.label,
      };
    }

    dayBaseY += daySectionH - (allDaySavings[day.dateISO] ?? 0);
  }

  return null;
}

function useFiveDayPlanned() {
  const plannedEvents = useScheduleStore((s) => s.plannedEvents);

  return useMemo(() => {
    const today = new Date();

    return Array.from({ length: 5 }, (_, index) => {
      const dateISO = localISODate(addDays(today, index));
      const previousDateISO = localISODate(addDays(today, index - 1));
      const events = Object.values(plannedEvents).flatMap((planned) => {
        const effectiveStart = planned.occurrenceOverrides?.[dateISO]?.startTime
          ?? planned.startTime;
        const effectiveEnd = planned.occurrenceOverrides?.[dateISO]?.endTime
          ?? planned.endTime;
        const isOvernight = parseMinutes(effectiveEnd) <= parseMinutes(effectiveStart);

        if (!isOvernight) {
          return isPlannedEventDue(planned, dateISO)
            && planned.occurrenceOverrides?.[dateISO]?.suppressed !== true
            ? [{ planned, startsBeforeDay: false, endsAfterDay: false }]
            : [];
        }

        const dueYesterday = isPlannedEventDue(planned, previousDateISO)
          && planned.occurrenceOverrides?.[previousDateISO]?.suppressed !== true;
        const dueToday = isPlannedEventDue(planned, dateISO)
          && planned.occurrenceOverrides?.[dateISO]?.suppressed !== true;
        const overnightEntries: Array<{
          planned: PlannedEvent;
          startsBeforeDay: boolean;
          endsAfterDay: boolean;
        }> = [];

        if (dueYesterday) {
          overnightEntries.push({ planned, startsBeforeDay: true, endsAfterDay: false });
        }

        if (dueToday) {
          overnightEntries.push({ planned, startsBeforeDay: false, endsAfterDay: true });
        }

        return overnightEntries;
      });

      return {
        dateISO,
        label: new Date(dateISO + 'T00:00:00').toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }),
        events,
      };
    });
  }, [plannedEvents]);
}

export function ControlCenterRoom() {
  const [showOneOff, setShowOneOff] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const prefsPanelRef = useRef<HTMLDivElement>(null);
  const pillButtonRef = useRef<HTMLButtonElement>(null);
  const todayISO = useMemo(() => localISODate(new Date()), []);


  

  const settings = useSystemStore((s) => s.settings);
  const { activeEvents } = useScheduleStore(
    useShallow((s) => ({ activeEvents: s.activeEvents })),
  );

  const startHour = useMemo(() => {
    const t = settings?.timePreferences?.dayView?.startTime ?? '06:00';
    return parseInt(t.split(':')[0], 10);
  }, [settings]);

const endHour = useMemo(() => {
  const t = settings?.timePreferences?.dayView?.endTime ?? '22:00';
  const parts = t.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] ?? '0', 10);
  return m > 0 ? h + 1 : h;
}, [settings]);

  const visibleHours = useMemo(
    () => Array.from(
      { length: endHour - startHour },
      (_, i) => i + startHour,
    ),
    [startHour, endHour],
  );

  const clipTop = useMemo(
    () => startHour * 60,
    [startHour],
  );

  const visibleStartMin = useMemo(
    () => startHour * 60,
    [startHour],
  );

const visibleEndMin = useMemo(() => {
  const t = settings?.timePreferences?.dayView?.endTime ?? '22:00';
  const parts = t.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1] ?? '0', 10);
}, [settings]);

  const gridHeight = useMemo(
    () => (endHour - startHour) * HOUR_HEIGHT,
    [startHour, endHour],
  );

  const daySectionH = useMemo(
    () => gridHeight + HEADER_H,
    [gridHeight],
  );

  const prefLabel = useMemo(() => {
    const pref = settings?.timePreferences?.dayView;

    if (!pref) return 'Preferences';
    return pref.startTime + ' - ' + pref.endTime;
  }, [settings]);

  useEffect(() => {
    if (!showPrefs) return undefined;

    const handleMouseDown = (event: MouseEvent) => {
      if (
        !prefsPanelRef.current?.contains(event.target as Node) &&
        !pillButtonRef.current?.contains(event.target as Node)
      ) {
        setShowPrefs(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [showPrefs]);

  function writeOverride(planned: PlannedEvent, dateISO: string, override: OccurrenceOverride) {
    useScheduleStore.getState().setPlannedEvent({
      ...planned,
      occurrenceOverrides: {
        ...planned.occurrenceOverrides,
        [dateISO]: override,
      },
    });
  }

  const fiveDayData = useFiveDayPlanned();
  const filteredDays = useMemo(
    () => (selectedDay
      ? fiveDayData.filter((day) => day.dateISO === selectedDay)
      : fiveDayData),
    [fiveDayData, selectedDay],
  );
  const todayActiveEvents = useMemo(
    () => Object.values(activeEvents).filter(
      (event): event is Event =>
        'startDate' in event &&
        (event as Event).eventType !== 'quickActions' &&
        (event as Event).startDate === todayISO,
    ),
    [activeEvents, todayISO],
  );
const { allPlannedLayouts, allActiveLayouts, allGapRows, allDaySavings, dayCounts } = useMemo(() => {
    const nextPlannedLayouts: CCLayout[] = [];
    const nextActiveLayouts: CCActiveLayout[] = [];
    const nextGapRows: GapRow[] = [];
  const nextDaySavings: Record<string, number> = {};
    const nextDayCounts: Record<string, number> = {};
  let cumulativeDayBaseY = 0;

    filteredDays.forEach((day, dayIndex) => {
      const isToday = day.dateISO === todayISO;

      const carryoverActives = (Object.values(activeEvents) as Array<Event | QuickActionsEvent>).filter(
        (e): e is Event =>
          'startDate' in e &&
          (e as Event).eventType !== 'quickActions' &&
          (e as Event).startDate < day.dateISO &&
          (e as Event).endDate >= day.dateISO,
      );

      if (isToday) {
        const layouts = computeActiveLayout(
          todayActiveEvents,
          day.dateISO,
          cumulativeDayBaseY,
          clipTop,
          visibleStartMin,
          visibleEndMin,
        );
        const carryLayouts = carryoverActives.length > 0
          ? computeActiveLayout(
              carryoverActives,
              day.dateISO,
              cumulativeDayBaseY,
              clipTop,
              visibleStartMin,
              visibleEndMin,
            )
          : [];
        const gapMap = buildGapMap(
          [...layouts, ...carryLayouts].map((layout) => ({
            startMin: layout.startMin,
            endMin: layout.endMin,
          })),
          visibleStartMin,
          visibleEndMin,
          dayIndex,
          clipTop,
          cumulativeDayBaseY,
        );
        const daySavings = gapMap.rows.reduce(
          (sum, row) => sum + ((row.gapEndMin - row.gapStartMin) * PX_PER_MIN - row.heightPx),
          0,
        );
        nextDaySavings[day.dateISO] = daySavings;
        const adjustedLayouts = layouts.map((layout) => ({
          ...layout,
          topPx: applyGapOffset(layout.topPx, layout.startMin, dayIndex, gapMap.rows),
        }));
        const adjustedCarryLayouts = carryLayouts.map((layout) => ({
          ...layout,
          topPx: applyGapOffset(layout.topPx, layout.startMin, dayIndex, gapMap.rows),
        }));
        nextGapRows.push(...gapMap.rows);
        nextActiveLayouts.push(...adjustedLayouts, ...adjustedCarryLayouts);
        nextDayCounts[day.dateISO] = layouts.length + carryLayouts.length;
        cumulativeDayBaseY += daySectionH - daySavings;
        return;
      }

      const layouts = computeCCLayout(
        day.events,
        day.dateISO,
        cumulativeDayBaseY,
        clipTop,
        visibleStartMin,
        visibleEndMin,
      );
      const carryLayouts = carryoverActives.length > 0
        ? computeActiveLayout(
            carryoverActives,
            day.dateISO,
            cumulativeDayBaseY,
            clipTop,
            visibleStartMin,
            visibleEndMin,
          )
        : [];
      const gapMap = buildGapMap(
        [...layouts, ...carryLayouts].map((layout) => ({
          startMin: layout.startMin,
          endMin: layout.endMin,
        })),
        visibleStartMin,
        visibleEndMin,
        dayIndex,
        clipTop,
        cumulativeDayBaseY,
      );
      const daySavings = gapMap.rows.reduce(
        (sum, row) => sum + ((row.gapEndMin - row.gapStartMin) * PX_PER_MIN - row.heightPx),
        0,
      );
      nextDaySavings[day.dateISO] = daySavings;
      const adjustedLayouts = layouts.map((layout) => ({
        ...layout,
        topPx: applyGapOffset(layout.topPx, layout.startMin, dayIndex, gapMap.rows),
      }));
      const adjustedCarryLayouts = carryLayouts.map((layout) => ({
        ...layout,
        topPx: applyGapOffset(layout.topPx, layout.startMin, dayIndex, gapMap.rows),
      }));
      nextGapRows.push(...gapMap.rows);
      nextPlannedLayouts.push(...adjustedLayouts);
      nextActiveLayouts.push(...adjustedCarryLayouts);
      nextDayCounts[day.dateISO] = layouts.length + carryLayouts.length;
      cumulativeDayBaseY += daySectionH - daySavings;
    });

    return {
      allPlannedLayouts: nextPlannedLayouts,
      allActiveLayouts: nextActiveLayouts,
      allGapRows: nextGapRows,
      allDaySavings: nextDaySavings,
      dayCounts: nextDayCounts,
    };
  }, [activeEvents, clipTop, daySectionH, filteredDays, todayISO, todayActiveEvents, visibleEndMin, visibleStartMin]);
  const compressedDaySectionH = (day: { dateISO: string }) => (
    daySectionH - (allDaySavings[day.dateISO] ?? 0)
  );
  const dayBaseYs = useMemo(
    () => filteredDays.map((_, dayIndex) => {
      let y = 0;

      for (let j = 0; j < dayIndex; j += 1) {
        y += daySectionH - (allDaySavings[filteredDays[j].dateISO] ?? 0);
      }

      return y;
    }),
    [allDaySavings, daySectionH, filteredDays],
  );
  const expandedMatch = findExpandedMatch(
    expandedCardId,
    filteredDays,
    todayISO,
    todayActiveEvents as Event[],
    allDaySavings,
    clipTop,
    daySectionH,
    visibleStartMin,
    visibleEndMin,
  );

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-800">
<div className="relative">
          <button
            ref={pillButtonRef}
            type="button"
            onClick={() => setShowPrefs((prev) => !prev)}
            className="rounded-full border border-purple-300 dark:border-purple-700 bg-white dark:bg-gray-800 px-3 py-1 text-xs text-purple-600 dark:text-purple-300 cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-950/20"
          >
            <span className="select-none">
              {prefLabel}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowOneOff(true)}
          className="shrink-0 text-xs rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          + One-Off
        </button>

        <select
          onChange={(e) => setSelectedDay(e.target.value || null)}
          value={selectedDay ?? ''}
          className="ml-auto text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-gray-600 dark:text-gray-300"
        >
          <option value="">All days</option>
          {fiveDayData.map((day) => (
            <option key={day.dateISO} value={day.dateISO}>{day.label}</option>
          ))}
        </select>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div className="flex-1 h-full overflow-y-auto">
          <div
            className="relative w-full"
            style={{
              height: filteredDays.reduce(
                (sum, day) => sum + compressedDaySectionH(day),
                0,
              ),
            }}
          >
            {filteredDays.map((day, dayIndex) => (
              <div
                key={day.dateISO + '-header'}
                className="absolute left-0 right-0 z-10 bg-white dark:bg-gray-900 flex items-center justify-between px-3 border-t-2 border-b-2 border-purple-400 dark:border-purple-600"
                style={{ top: dayBaseYs[dayIndex], height: HEADER_H }}
              >
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {day.label}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {dayCounts[day.dateISO] > 0
                    ? dayCounts[day.dateISO] + ' event' + (dayCounts[day.dateISO] !== 1 ? 's' : '')
                    : 'No events'}
                </span>
              </div>
            ))}

{filteredDays.flatMap((day, dayIndex) => visibleHours.filter((hour) => {
  const hourMin = hour * 60;
  return !allGapRows.some(
    (row) => row.dayIndex === dayIndex &&
    hourMin > row.gapStartMin &&
    hourMin < row.gapEndMin
  );
}).map((hour) => (
            <div
                key={day.dateISO + '-hour-' + hour}
                className="absolute left-0 right-0"
                style={{
                  top: applyGapOffset(
                    dayBaseYs[dayIndex] + HEADER_H + ((hour - startHour) * HOUR_HEIGHT),
                    hour * 60,
                    dayIndex,
                    allGapRows,
                  ),
                }}
              >
                <div className="absolute left-0 right-0 border-t border-gray-100 dark:border-gray-700" />
                <span
                  className="absolute left-1 text-[10px] text-gray-300 dark:text-gray-600 leading-none"
                  style={{ top: 2 }}
                >
                  {hour < 12 ? hour + 'a' : hour === 12 ? '12p' : (hour - 12) + 'p'}
                </span>
              </div>
            )))}

            {allGapRows.map((row, i) => (
<div
  key={'gap-' + row.dayIndex + '-' + i}
  className="absolute left-0 right-0 flex items-center z-[2] bg-white dark:bg-gray-900 border-t border-b border-purple-100 dark:border-purple-900/30"
  style={{ top: row.topPx, height: row.heightPx }}
>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 px-2 truncate">
                  {row.label}
                </span>
              </div>
            ))}

            {allPlannedLayouts.map((layout) => {
              const cardId = layout.spanKey + ':' + layout.topPx + ':' + layout.colIndex;
              const isSelected = expandedCardId === layout.spanKey;

              return (
                <div
                  key={cardId}
                  className="absolute overflow-hidden rounded-sm shadow-sm cursor-pointer bg-white dark:bg-gray-800"
                  title={layout.ghostLabel ?? undefined}
                  style={{
                    top: layout.topPx,
                    height: layout.heightPx,
                    minHeight: layout.heightPx,
                    borderLeft: '4px solid ' + layout.planned.color,
                    left: 'calc(2.5rem + ' + (layout.colIndex / layout.colCount) + ' * (100% - 2.5rem))',
                    width: 'calc((100% - 2.5rem) / ' + layout.colCount + ' - 2px)',
                    zIndex: isSelected ? 20 : 5,
                    outline: isSelected ? '2px solid ' + layout.planned.color : 'none',
                  }}
                  onClick={() => setExpandedCardId(expandedCardId === layout.spanKey ? null : layout.spanKey)}
                >
                  {layout.heightPx <= 20 ? (
                    <div className="flex h-full items-center justify-between gap-1 overflow-hidden px-1">
                      <p className="min-w-0 flex-1 truncate text-[10px] text-gray-500 dark:text-gray-400">
                        {layout.planned.name}
                      </p>
                      <p className="shrink-0 text-[10px]" style={{ color: layout.planned.color }}>
                        {layout.planned.startTime + '-' + layout.planned.endTime}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col justify-start overflow-hidden p-1">
                      <p className="text-xs font-semibold truncate" style={{ color: layout.planned.color }}>
                        {layout.planned.name}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {layout.planned.startTime + ' - ' + layout.planned.endTime}
                      </p>
                      {layout.ghostLabel && (
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 italic">
                          {layout.ghostLabel}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {allActiveLayouts.map((layout) => {
              const cardId = layout.spanKey + ':' + layout.topPx + ':' + layout.colIndex;
              const isSelected = expandedCardId === layout.spanKey;
              const eventColor = layout.event.color ?? '#9333ea';

              return (
                <div
                  key={cardId}
                  className="absolute overflow-hidden rounded-sm shadow-sm cursor-pointer bg-white dark:bg-gray-800"
                  style={{
                    top: layout.topPx,
                    height: layout.heightPx,
                    minHeight: layout.heightPx,
                    borderLeft: '4px solid ' + eventColor,
                    left: 'calc(2.5rem + ' + (layout.colIndex / layout.colCount) + ' * (100% - 2.5rem))',
                    width: 'calc((100% - 2.5rem) / ' + layout.colCount + ' - 2px)',
                    zIndex: isSelected ? 20 : 5,
                    outline: isSelected ? '2px solid ' + eventColor : 'none',
                  }}
                  onClick={() => setExpandedCardId(expandedCardId === layout.spanKey ? null : layout.spanKey)}
                >
                  {layout.heightPx <= 20 ? (
                    <div className="flex h-full items-center justify-between gap-1 overflow-hidden px-1">
                      <p className="min-w-0 flex-1 truncate text-[10px] text-gray-500 dark:text-gray-400">
                        {layout.event.name}
                      </p>
                      <p className="shrink-0 text-[10px]" style={{ color: eventColor }}>
                        {layout.event.startTime + '-' + layout.event.endTime}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col justify-start overflow-hidden p-1">
                      <p className="text-xs font-semibold truncate" style={{ color: eventColor }}>
                        {layout.event.name}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {layout.event.startTime + ' - ' + layout.event.endTime}
                      </p>
                      {layout.ghostLabel && (
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 italic">
                          {layout.ghostLabel}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {expandedMatch && (
          <div className="absolute inset-0 z-20 flex flex-col bg-white dark:bg-gray-900">
            <div
              className="shrink-0 flex items-center justify-between px-3 py-2 border-t-2 border-b-2 border-purple-400 dark:border-purple-600"
              style={{
                borderLeft: '4px solid ' + (
                  expandedMatch.kind === 'active'
                    ? (expandedMatch.event.color ?? '#9333ea')
                    : expandedMatch.planned.color
                ),
              }}
            >
              <div className="flex flex-col min-w-0">
                <span
                  className="text-sm font-semibold truncate"
                  style={{
                    color: expandedMatch.kind === 'active'
                      ? (expandedMatch.event.color ?? '#9333ea')
                      : expandedMatch.planned.color,
                  }}
                >
                  {expandedMatch.kind === 'active'
                    ? expandedMatch.event.name
                    : expandedMatch.planned.name}
                </span>
                <span className="text-xs text-gray-400">
                  {expandedMatch.kind === 'active'
                    ? expandedMatch.event.startTime + ' - ' + expandedMatch.event.endTime
                    : expandedMatch.planned.startTime + ' - ' + expandedMatch.planned.endTime}
                </span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mt-0.5">
                  {expandedMatch.label}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setExpandedCardId(null)}
                className="shrink-0 px-2 text-lg leading-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                X
              </button>
            </div>
            <div className="flex-1" />
            <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-t border-gray-100 dark:border-gray-700">
              {expandedMatch.kind === 'active' ? (
                <>
                  <button
                    type="button"
                    onClick={() => console.log('open active event', expandedMatch.event.id)}
                    className="text-xs rounded-lg border border-purple-300 dark:border-purple-700 px-3 py-1 text-purple-600 dark:text-purple-300"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => console.log('delete active event', expandedMatch.event.id)}
                    className="text-xs rounded-lg border border-red-200 dark:border-red-800 px-3 py-1 text-red-400"
                  >
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => console.log('open planned event', expandedMatch.planned.id)}
                    className="text-xs rounded-lg border border-purple-300 dark:border-purple-700 px-3 py-1 text-purple-600 dark:text-purple-300"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      writeOverride(expandedMatch.planned, expandedMatch.dateISO, { suppressed: true });
                      setExpandedCardId(null);
                    }}
                    className="text-xs rounded-lg border border-orange-200 dark:border-orange-800 px-3 py-1 text-orange-400"
                  >
                    Suppress
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {showPrefs && (
          <div
            ref={prefsPanelRef}
            className="absolute inset-x-0 top-0 z-30 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg overflow-y-auto max-h-full pb-4"
          >
            <div className="px-3 pt-3">
              <TimeViewFilterSettings />
            </div>
          </div>
        )}
      </div>

      {showOneOff && (
        <OneOffEventPopup
          editEvent={null}
          onClose={() => setShowOneOff(false)}
        />
      )}
    </div>
  );
}