import { useState, useEffect, useRef } from 'react';
import { useAppDate } from '../../../utils/useAppDate';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { useSystemStore } from '../../../stores/useSystemStore';
import { useShallow } from 'zustand/react/shallow';
import { EventBlock } from './EventBlock';
import { QACompletionIcon } from './QACompletionIcon';
import { QACompletionPopup } from './QACompletionPopup';
import { resolveTaskIcon, resolveTemplate, findQAEventForDate } from './qaUtils';
import { format, hourLabel, isSameDay, getOffsetNow } from '../../../utils/dateUtils';
import { isOneOffEvent } from '../../../utils/isOneOffEvent';
import { isPlannedEventDue } from '../../../engine/rollover';
import type { Event, PlannedEvent, QuickActionsCompletion } from '../../../types';
import { ONBOARDING_GLOW } from '../../../constants/onboardingKeys';
import { useGlows } from '../../../hooks/useOnboardingGlow';

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

/** Pixels per minute — 1px/min = 60px/hour */
const PX_PER_MIN = 1.0;
/** Height of one hour band in px */
const HOUR_HEIGHT = PX_PER_MIN * 60;
/**
 * Minimum visual block height — tall enough to show event name + time label.
 * Short back-to-back events will push subsequent events down to honour this.
 */
const MIN_VISUAL_H = 44;

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function extractHour(iso: string): number {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? 0 : d.getHours();
}

function parseMinutesOfDay(time: string): number {
  if (!time) return 0;
  const parts = time.split(':').map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

// ── HOUR ROW LAYOUT ENGINE ─────────────────────────────────────────────────────
// Part 1 (UV-C): sequential back-to-back events stack vertically; row height expands.
// Part 2 (UV-C): overlapping concurrent events lay out side by side in columns.

interface DayLayout {
  ev: Event | PlannedEvent;
  topPx: number;
  heightPx: number;
  colIndex: number;
  colCount: number;
  /** How many columns this event spans to the right (1 = single column, 2 = spans into next, etc.) */
  colSpan: number;
}

interface DayLayoutResult {
  layouts: DayLayout[];
  /** slotTop[h] = Y of the top of hour h in px. slotTop[24] = total grid height. */
  slotTop: number[];
}

/**
 * Lay out all events for the day using variable-height hour slots.
 *
 * Hour slots expand when stacked short events need more than HOUR_HEIGHT px.
 * Within each slot, time is scaled linearly so the 9:00–11:00 event grows
 * to span the full (expanded 9:00 slot) + (10:00 slot).
 * A push-down pass then resolves any remaining overlap within columns.
 */
function computeDayLayout(
  events: (Event | PlannedEvent)[],
  getDisplayEnd: (ev: Event | PlannedEvent) => string,
): DayLayoutResult {
  /** Build a uniform slotTop when there are no events. */
  function uniformSlotTop(): number[] {
    const st = new Array<number>(25).fill(0);
    for (let h = 0; h < 24; h++) st[h + 1] = st[h] + HOUR_HEIGHT;
    return st;
  }

  if (events.length === 0) return { layouts: [], slotTop: uniformSlotTop() };

  const parsed = events.map((ev) => {
    const startMin = parseMinutesOfDay(
      (ev as { startTime?: string }).startTime ?? '00:00',
    );
    const rawEnd = parseMinutesOfDay(getDisplayEnd(ev));
    const endMin = rawEnd > startMin ? rawEnd : startMin + 15;
    return { ev, startMin, endMin };
  });

  // Sort by start time; longer events first on tie (ensures they win col 0)
  parsed.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const n = parsed.length;

  // ── Build overlap clusters (connected components) ─────────────────────────
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
        // A and B overlap iff A.start < B.end && B.start < A.end
        if (a.startMin < b.endMin && b.startMin < a.endMin) {
          clusterIdx[k] = clusterId;
          members.push(k);
        }
      }
    }
    clusters.push(members);
  }

  // ── Greedy column assignment within each cluster ───────────────────────────
  const colOf = new Array<number>(n).fill(0);
  const colCountOf = new Array<number>(n).fill(1);

  for (const members of clusters) {
    const sorted = [...members].sort(
      (a, b) => parsed[a].startMin - parsed[b].startMin,
    );
    const colEnds: number[] = []; // colEnds[col] = end-time of last assigned event
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
    const totalCols = colEnds.length;
    for (const idx of members) colCountOf[idx] = totalCols;
  }

  // ── Right-expansion: let events fill unused columns to their right ──────────
  // An event can expand into the next column if NO other event in that column
  // overlaps with it.  e.g. a 10:00-12:30 event in col 1 of a 3-col cluster
  // where col 2 only held 9:00-9:30 events can expand to span cols 1-2.
  const colSpanOf = new Array<number>(n).fill(1);

  for (let i = 0; i < n; i++) {
    const totalCols = colCountOf[i];
    const myCol = colOf[i];
    let span = 1;
    for (let nextCol = myCol + 1; nextCol < totalCols; nextCol++) {
      const blocked = parsed.some(
        (p, j) =>
          j !== i &&
          colOf[j] === nextCol &&
          parsed[i].startMin < p.endMin &&
          p.startMin < parsed[i].endMin,
      );
      if (blocked) break;
      span++;
    }
    colSpanOf[i] = span;
  }

  // ── Step: Compute per-hour slot heights ────────────────────────────────────
  // For each hour slot, simulate stacking the events that START in that slot
  // per column and find how much vertical space is needed.  Multi-hour events
  // only consume their within-slot portion so they don't inflate the slot.
  const slotHeight = new Array<number>(24).fill(HOUR_HEIGHT);

  for (let h = 0; h < 24; h++) {
    const slotStartMin = h * 60;
    const slotEndMin = slotStartMin + 60;
    const colBottoms = new Map<number, number>(); // col → cursor in px from slot start

    // Process events that start in this slot, in time order
    const inSlot = parsed
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => Math.floor(p.startMin / 60) === h)
      .sort((a, b) => a.p.startMin - b.p.startMin);

    for (const { p, i } of inSlot) {
      const col = colOf[i];
      const naturalOffsetPx = (p.startMin - slotStartMin) * PX_PER_MIN;
      // Only count the portion of the event that lives within this slot
      const withinSlotMin = Math.min(p.endMin, slotEndMin) - p.startMin;
      const visualH = Math.max(MIN_VISUAL_H, withinSlotMin * PX_PER_MIN);

      const cursor = Math.max(colBottoms.get(col) ?? 0, naturalOffsetPx);
      colBottoms.set(col, cursor + visualH);
    }

    // Tail: empty time between the last event that ENDS STRICTLY inside this
    // slot and the hour boundary.  Use strict < so that an event ending
    // exactly at the slot boundary (e.g. 9:00-10:00, endMin=600=slotEndMin)
    // is excluded — it fills the slot naturally and must not zero-out the
    // tail that shorter co-column events would otherwise produce.
    // e.g. 9:00-10:00 + 9:15-9:30 in the same slot:
    //   9-10 excluded (600 not < 600); 9:15-9:30 gives lastNaturalEndMin=570
    //   → tailPx = 30px → slot grows to 118px → 9-10 clearly taller than 9:30.
    let lastNaturalEndMin = -1; // -1 = no event ends strictly within this slot
    for (const { p } of inSlot) {
      if (p.endMin < slotEndMin) {
        lastNaturalEndMin = Math.max(lastNaturalEndMin, p.endMin);
      }
    }
    const tailPx = lastNaturalEndMin >= 0
      ? (slotEndMin - lastNaturalEndMin) * PX_PER_MIN
      : 0;

    let maxColBottom = 0;
    for (const bottom of colBottoms.values()) maxColBottom = Math.max(maxColBottom, bottom);
    slotHeight[h] = Math.max(HOUR_HEIGHT, maxColBottom + tailPx);
  }

  // ── Step: Cumulative slot tops ─────────────────────────────────────────────
  const slotTop = new Array<number>(25).fill(0);
  for (let h = 0; h < 24; h++) slotTop[h + 1] = slotTop[h] + slotHeight[h];

  // ── Step: Map time → Y using stretched slot coordinates ───────────────────
  function timeToY(min: number): number {
    const h = Math.min(23, Math.floor(min / 60));
    const fraction = (min - h * 60) / 60;
    return slotTop[h] + fraction * slotHeight[h];
  }

  // ── Step: Place events ─────────────────────────────────────────────────────
  const layouts: DayLayout[] = parsed.map((p, i) => {
    const topPx = timeToY(p.startMin);
    const rawH = timeToY(p.endMin) - topPx;
    return {
      ev: p.ev,
      topPx,
      heightPx: Math.max(MIN_VISUAL_H, rawH),
      colIndex: colOf[i],
      colCount: colCountOf[i],
      colSpan: colSpanOf[i],
    };
  });

  // ── Step: Push-down to resolve remaining overlap within columns ────────────
  const byCol = new Map<number, number[]>();
  layouts.forEach((l, i) => {
    if (!byCol.has(l.colIndex)) byCol.set(l.colIndex, []);
    byCol.get(l.colIndex)!.push(i);
  });
  for (const indices of byCol.values()) {
    indices.sort((a, b) => layouts[a].topPx - layouts[b].topPx);
    for (let i = 0; i < indices.length - 1; i++) {
      const cur = layouts[indices[i]];
      const nxt = layouts[indices[i + 1]];
      const curBottom = cur.topPx + cur.heightPx;
      if (curBottom > nxt.topPx) nxt.topPx = curBottom;
    }
  }

  return { layouts, slotTop };
}

// ── MULTI-DAY BANNERS (Part 3 — UV-C) ─────────────────────────────────────────
// Events spanning multiple days are shown in a banner strip above the hour grid.
// Three cases:
//   'spanning'  — started before today, ends after today (all-day banner)
//   'continued' — started before today, ends today (show endTime)
//   'overnight' — future PlannedEvent that was due yesterday and crosses midnight

// ── PROPS ─────────────────────────────────────────────────────────────────────

interface DayViewBodyProps {
  date: Date;
  onEventOpen: (eventId: string) => void;
  /** Optional — opens OneOffEventPopup for future one-off planned events */
  onEditPlanned?: (plannedId: string) => void;
}

export function DayViewBody({ date, onEventOpen, onEditPlanned }: DayViewBodyProps) {
  const [openCompletion, setOpenCompletion] = useState<QuickActionsCompletion | null>(null);
  const welcomeEventGlows = useGlows(ONBOARDING_GLOW.WELCOME_EVENT_CARD);

  // Tick every minute so the time indicator stays accurate
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Track scroll container height so the grid can fill it when content is shorter
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerH, setContainerH] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerH(el.clientHeight));
    ro.observe(el);
    setContainerH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // ── Time range preference ─────────────────────────────────────────────────
  const timePreferences = useSystemStore((s) => s.settings?.timePreferences);
  const startHour = parseInt((timePreferences?.dayView?.startTime ?? '06:00').split(':')[0]);
  const endHour   = parseInt((timePreferences?.dayView?.endTime   ?? '23:00').split(':')[0]);
  const visibleHours = HOURS.filter((h) => h >= startHour && h <= endHour);

  const { activeEvents, historyEvents, plannedEvents, tasks, taskTemplates } = useScheduleStore(
    useShallow((s) => ({
      activeEvents: s.activeEvents,
      historyEvents: s.historyEvents,
      plannedEvents: s.plannedEvents,
      tasks: s.tasks,
      taskTemplates: s.taskTemplates,
    })),
  );

  const dateIso = format(date, 'iso');
  // const yesterdayIso = format(addDays(date, -1), 'iso');
  const today = useAppDate();
  const isPast = date < today;
  const isToday = isSameDay(date, today);
  const isFuture = date > today;

  // Scroll to current time when viewing today
  useEffect(() => {
    if (!isToday || containerH === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    const now = getOffsetNow();
    const h = now.getHours();
    const m = now.getMinutes();
    const range = endHour - startHour;
    if (range <= 0) return;
    const fraction = Math.max(0, Math.min(1, (h - startHour + m / 60) / range));
    el.scrollTop = Math.max(0, fraction * el.scrollHeight - el.clientHeight / 3);
  }, [isToday, containerH, date]); // eslint-disable-line react-hooks/exhaustive-deps

  // QA completions for this date — read-only display only
  // Uses robust finder that handles UTC vs local date key mismatch
  const qaEvent = findQAEventForDate(activeEvents, historyEvents, dateIso);
  const qaCompletions: QuickActionsCompletion[] = qaEvent?.completions ?? [];

  // Group QA completions by hour slot for rendering
  const qaByHour = new Map<number, QuickActionsCompletion[]>();
  for (const c of qaCompletions) {
    const h = extractHour(c.completedAt);
    if (!qaByHour.has(h)) qaByHour.set(h, []);
    qaByHour.get(h)!.push(c);
  }

  // ── Collect events ────────────────────────────────────────────────────────
  // dayEvents: events that START on this date — shown in the hour grid.
  // multi-day carry/continuation is projected into the hour grid as clipped cards.
  // continuesOverride: maps eventId → '23:59' for events continuing to next day.
  // labelOverride: maps eventId → label string shown inside the EventBlock.

  const dayEvents: (Event | PlannedEvent)[] = [];
  const continuesOverride = new Map<string, string>();
  const labelOverride = new Map<string, string>();

  // --- Unified event projection and deduplication logic for all days ---
  // Map: dateISO -> Set of covered plannedEventRefs (materialized events)
  const coveredPlannedRefsByDate = new Map<string, Set<string>>();
  const addCoveredPlannedRef = (dateISO: string, plannedEventRef: string | null) => {
    if (!plannedEventRef) return;
    const nextSet = coveredPlannedRefsByDate.get(dateISO) ?? new Set<string>();
    nextSet.add(plannedEventRef);
    coveredPlannedRefsByDate.set(dateISO, nextSet);
  };

  // Project materialized events (active/history)
  const allMaterialized = [
    ...Object.values(activeEvents),
    ...Object.values(historyEvents),
  ];
  for (const e of allMaterialized) {
    const ev = e as Event;
    if (ev.eventType === 'quickActions') continue;
    const dateISO = format(date, 'iso');
    if (ev.startDate > dateISO || ev.endDate < dateISO) continue;
    const startsToday = ev.startDate === dateISO;
    const endsToday = ev.endDate === dateISO;
    const isMultiDay = ev.startDate !== ev.endDate;
    // const isOvernight = parseMinutesOfDay(ev.endTime) < parseMinutesOfDay(ev.startTime);

    addCoveredPlannedRef(dateISO, ev.plannedEventRef ?? null);

    if (!isMultiDay) {
      if (startsToday) dayEvents.push(ev);
    } else if (startsToday) {
      dayEvents.push(ev);
      continuesOverride.set(ev.id, '23:59');
      labelOverride.set(ev.id, '↓ continues');
    } else if (endsToday) {
      dayEvents.push({ ...ev, startTime: '00:00' });
      labelOverride.set(ev.id, `↑ started ${ev.startDate}`);
    } else if (ev.startDate < dateISO && ev.endDate > dateISO) {
      dayEvents.push({ ...ev, startTime: '00:00', endTime: '23:59' });
      labelOverride.set(ev.id, '⬛ all day');
    }
  }

  // Project planned events (future/planned recurrences)
  const allPlanned = Object.values(plannedEvents);
  for (const planned of allPlanned) {
    const isOvernight = parseMinutesOfDay(planned.endTime) < parseMinutesOfDay(planned.startTime);
    const dateISO = format(date, 'iso');
    const previousDate = format(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1), 'iso');
    const dueToday = isPlannedEventDue(planned, dateISO);
    const dueYesterday = isPlannedEventDue(planned, previousDate);
    const yesterdayIsDieDate = planned.dieDate === previousDate;
    const coveredPlannedRefs = coveredPlannedRefsByDate.get(dateISO);

    if (isOvernight) {
      // Deduplicate morning and evening blocks separately
      // Check for materialized morning and evening blocks
      let hasMaterializedMorning = false;
      let hasMaterializedEvening = false;
      if (coveredPlannedRefs && coveredPlannedRefs.has(planned.id)) {
        for (const evRaw of allMaterialized) {
          const ev = evRaw as Event;
          if (
            ev && typeof ev === 'object' &&
            'plannedEventRef' in ev &&
            ev.plannedEventRef === planned.id &&
            'startTime' in ev &&
            'startDate' in ev && 'endDate' in ev &&
            ev.startDate <= dateISO && ev.endDate >= dateISO
          ) {
            // Suppress planned morning block if a materialized event started previous day at planned.startTime and ends today at planned.endTime
            if (
              ev.startDate === previousDate &&
              ev.endDate === dateISO &&
              ev.startTime === planned.startTime &&
              ev.endTime === planned.endTime
            ) {
              hasMaterializedMorning = true;
            }
            // Only count as materialized evening if this matches the planned startTime and starts today
            if (ev.startTime === planned.startTime && ev.startDate === dateISO) {
              hasMaterializedEvening = true;
            }
          }
        }
      }
      // Project morning block if not covered, and avoid duplicate 'carry' block
      if ((dueYesterday || yesterdayIsDieDate) && !hasMaterializedMorning) {
        dayEvents.push({
          ...planned,
          id: `planned-${planned.id}:${dateISO}:morning`,
          startTime: '00:00',
          endTime: planned.endTime,
        });
        labelOverride.set(`planned-${planned.id}:${dateISO}:morning`, '↑ started yesterday');
      }
      // Project evening block if not covered
      if (dueToday && !hasMaterializedEvening) {
        dayEvents.push({
          ...planned,
          id: `planned-${planned.id}:${dateISO}:evening`,
          startTime: planned.startTime,
          endTime: '23:59',
        });
        labelOverride.set(`planned-${planned.id}:${dateISO}:evening`, '↓ continues');
      }
    } else {
      // Non-overnight planned event: only show if not covered
      if (dueToday && !(coveredPlannedRefs?.has(planned.id))) {
        dayEvents.push(planned);
      }
    }
  }

  // ── Display end-time resolver (passed to layout engine) ──────────────────
  function getDisplayEnd(ev: Event | PlannedEvent): string {
    return (
      continuesOverride.get(ev.id) ??
      (ev as { endTime?: string }).endTime ??
      '01:00'
    );
  }

  const { layouts: dayLayouts, slotTop } = computeDayLayout(dayEvents, getDisplayEnd);

  // Clip the rendered grid to [startHour, endHour]
  const clipTopRaw       = slotTop[startHour];
  const clipBottomRaw    = slotTop[Math.min(endHour + 1, 24)];
  const visibleHeightRaw = clipBottomRaw - clipTopRaw;

  // Scale the visible range up to fill the container when it's shorter than the available height.
  const yScale = containerH > 0 && containerH > visibleHeightRaw ? containerH / visibleHeightRaw : 1;
  const scaledSlotTop     = slotTop.map((y) => y * yScale);
  const clipOffsetPx      = scaledSlotTop[startHour];
  const scaledVisibleHeight = visibleHeightRaw * yScale;
  const scaledLayouts = dayLayouts.map((l) => ({
    ...l,
    topPx: l.topPx * yScale,
    heightPx: l.heightPx * yScale,
  }));

  const now = getOffsetNow();
  const nowHour = isToday ? now.getHours() : 0;
  const nowMinutes = isToday ? now.getMinutes() : 0;
  const nowTimeLabel = isToday
    ? `${String(nowHour).padStart(2, '0')}:${String(nowMinutes).padStart(2, '0')}`
    : '';
  // Y of the current time in the clipped + stretched coordinate space
  const nowY = isToday
    ? scaledSlotTop[nowHour] + (nowMinutes / 60) * (scaledSlotTop[nowHour + 1] - scaledSlotTop[nowHour]) - clipOffsetPx
    : -1;

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="flex">
        {/* Hour label gutter */}
        <div className="relative w-12 shrink-0" style={{ height: scaledVisibleHeight }}>
          {visibleHours.map((h) => (
            <div
              key={h}
              className="absolute w-full flex items-center justify-center text-gray-400 dark:text-gray-500 leading-none"
              style={{
                top: scaledSlotTop[h] - clipOffsetPx,
                height: scaledSlotTop[h + 1] - scaledSlotTop[h],
                fontSize: '16px',
                fontFamily: '"Gill Sans Nova", "Gill Sans Ultra Bold", "Gill Sans MT", "Gill Sans", sans-serif',
                fontWeight: 900,
              }}
            >
              {hourLabel(h)}
            </div>
          ))}
        </div>

        {/* Event area */}
        <div className={`relative flex-1 ${isPast ? 'opacity-40' : ''}`} style={{ height: scaledVisibleHeight }}>
          {/* Hour dividers + half-hour ticks */}
          {visibleHours.map((h) => (
            <div key={h}>
              <div
                className="absolute right-0 border-t border-gray-100 dark:border-gray-700"
                style={{ top: scaledSlotTop[h] - clipOffsetPx, left: '-3rem' }}
              />
              <div
                className="absolute right-0 border-t border-gray-50 dark:border-gray-800"
                style={{ top: (scaledSlotTop[h] + scaledSlotTop[h + 1]) / 2 - clipOffsetPx }}
              />
            </div>
          ))}

          {/* Elapsed time overlay for today */}
          {isToday && nowY > 0 && (
            <div
              className="absolute left-0 right-0 bg-gray-400/20 dark:bg-gray-900/40 pointer-events-none z-[5]"
              style={{ top: 0, height: nowY }}
            />
          )}

          {/* Current time indicator */}
          {nowY >= 0 && (
            <div
              className="absolute right-0 z-20 pointer-events-none"
              style={{ top: nowY, left: '-3rem' }}
            >
              {/* Line renders first (bottom of stacking), chip on top centered on the line */}
              <div className="relative border-t-2 border-purple-500" />
              <div className="absolute left-1.5 top-0 -translate-y-1/2 px-2 py-1.5 rounded border border-purple-500 bg-white dark:bg-gray-900 text-purple-600 dark:text-purple-400 font-semibold leading-none whitespace-nowrap" style={{ fontSize: '13px' }}>
                {nowTimeLabel}
              </div>
            </div>
          )}

          {/* Event blocks */}
          {scaledLayouts.map((layout) => {
            const ev = layout.ev;
            const isRealEvent = 'startDate' in ev;
            const isPlanned = !isRealEvent;
            const eventId = ev.id;
            const plannedEv = isPlanned ? (ev as PlannedEvent) : null;
            const isFutureOneOff =
              isFuture && plannedEv !== null && isOneOffEvent(plannedEv) && !!onEditPlanned;
            const isInteractive = (!isPlanned && (isPast || isToday)) || isFutureOneOff;
            const handleOpen = isInteractive
              ? isFutureOneOff
                ? () => onEditPlanned!(eventId)
                : () => onEventOpen(eventId)
              : undefined;
            const resolvedColor = isPlanned
              ? (ev as PlannedEvent).color
              : (ev as Event).color
                ? (ev as Event).color!
                : (ev as Event).plannedEventRef
                  ? (plannedEvents[(ev as Event).plannedEventRef!]?.color ?? '#9333ea')
                  : '#9333ea';
            const taskTotal = isPlanned
              ? (ev as PlannedEvent).taskList.length
              : (ev as Event).tasks.length;
            const taskDone = isPlanned
              ? 0
              : (ev as Event).tasks.filter(
                  (id) => tasks[id]?.completionState === 'complete',
                ).length;
            const evCompletionState = isPlanned ? undefined : (ev as Event).completionState;
            const mdLabel = labelOverride.get(ev.id);
            const displayEnd =
              continuesOverride.get(ev.id) ??
              (ev as { endTime?: string }).endTime ??
              '';
            const evIcon = isPlanned
              ? (ev as PlannedEvent).icon
              : (ev as Event).icon
                ?? ((ev as Event).plannedEventRef
                  ? plannedEvents[(ev as Event).plannedEventRef!]?.icon
                  : undefined);
            const welcomeGlow =
              welcomeEventGlows &&
              !isPlanned &&
              (ev as Event).plannedEventRef === null &&
              ev.name === 'Welcome to CAN-DO-BE';

            return (
              <EventBlock
                key={eventId}
                eventId={eventId}
                name={'name' in ev ? ev.name : '\u2014'}
                color={resolvedColor}
                startDate={'startDate' in ev ? ev.startDate : undefined}
                startTime={'startTime' in ev ? ev.startTime : ''}
                endDate={'endDate' in ev ? ev.endDate : undefined}
                endTime={displayEnd}
                icon={evIcon}
                heightPx={layout.heightPx}
                taskCount={taskTotal}
                taskComplete={taskDone}
                completionState={evCompletionState}
                topOffset={layout.topPx - clipOffsetPx}
                colIndex={layout.colIndex}
                colCount={layout.colCount}
                colSpan={layout.colSpan}
                multiDayLabel={mdLabel}
                interactive={isInteractive}
                onOpen={handleOpen}
                muted={isToday && (() => {
                  const [h=0,m=0] = (displayEnd).split(':').map(Number);
                  return (h * 60 + m) <= (nowHour * 60 + nowMinutes);
                })()}
                glow={welcomeGlow}
              />
            );
          })}

          {/* QA completion badges */}
          {Array.from(qaByHour.entries()).flatMap(([h, completions]) =>
            completions.map((c, idx) => {
              const task = tasks[c.taskRef];
              const tmpl = task?.templateRef ? resolveTemplate(task.templateRef, taskTemplates) : null;
              const iconKey = resolveTaskIcon(tmpl);
              return (
                <QACompletionIcon
                  key={`${c.taskRef}-${c.completedAt}`}
                  iconKey={iconKey}
                  offsetIndex={idx}
                  topPx={scaledSlotTop[h + 1] - 32 - clipOffsetPx}
                  onClick={() => setOpenCompletion(c)}
                />
              );
            })
          )}
        </div>
      </div>

      {openCompletion && (
        <QACompletionPopup
          completion={openCompletion}
          onClose={() => setOpenCompletion(null)}
        />
      )}
    </div>
  );
}
