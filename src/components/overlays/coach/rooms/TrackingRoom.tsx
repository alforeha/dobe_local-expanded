// ─────────────────────────────────────────
// TrackingRoom — COACH-D
// Summary card: active events, upcoming (7d), active quests, routines.
// Tab 1 ACTIVE: activeEvents excl. quickActions + Welcome Event, color swatch from event/PE.
// Tab 2 UPCOMING: PlannedEvents due in next 7 days via isPlannedEventDue().
// Tab 3 QUESTS: active quests from progressionStore with progress bars.
// ─────────────────────────────────────────

import { useState, useMemo } from 'react';
import { useScheduleStore } from '../../../../stores/useScheduleStore';
import { useProgressionStore } from '../../../../stores/useProgressionStore';
import { localISODate, addDays } from '../../../../utils/dateUtils';
import { isPlannedEventDue } from '../../../../engine/rollover';
import { isOneOffEvent } from '../../../../utils/isOneOffEvent';
import type { Event } from '../../../../types/event';
import type { PlannedEvent } from '../../../../types/plannedEvent';
import type { Quest } from '../../../../types/act';

// ── HELPERS ───────────────────────────────────────────────────────────────────

/** Filter out the Welcome onboarding event from Active tab */
function isWelcomeEvent(e: Event): boolean {
  return e.plannedEventRef === null && e.name === 'Welcome to CAN-DO-BE';
}

function recurrenceLabel(pe: PlannedEvent): string {
  if (isOneOffEvent(pe)) return 'One-off';
  const { frequency, days, interval } = pe.recurrenceInterval;
  switch (frequency) {
    case 'daily':
      return interval === 1 ? 'Daily' : `Every ${interval} days`;
    case 'weekly': {
      const dayStr = days.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(' ');
      return interval === 1 ? `Weekly · ${dayStr}` : `Every ${interval}w · ${dayStr}`;
    }
    case 'monthly':
      return interval === 1 ? 'Monthly' : `Every ${interval} months`;
    default:
      return 'Custom';
  }
}

function stateLabel(state: Event['completionState']): string {
  if (state === 'complete') return 'Done';
  if (state === 'skipped') return 'Skipped';
  return 'Pending';
}

// Resolve display color: prefer Event.color → lookup PlannedEvent.color → fallback
function resolveColor(ev: Event, plannedEvents: Record<string, PlannedEvent>): string {
  if (ev.color) return ev.color;
  if (ev.plannedEventRef) {
    const pe = plannedEvents[ev.plannedEventRef];
    if (pe?.color) return pe.color;
  }
  return '#6366f1';
}

// ── SUMMARY CARD ──────────────────────────────────────────────────────────────

interface TrackingSummaryCardProps {
  activeCount: number;
  upcomingCount: number;
  questCount: number;
  routineCount: number;
}

function TrackingSummaryCard({
  activeCount,
  upcomingCount,
  questCount,
  routineCount,
}: TrackingSummaryCardProps) {
  return (
    <div className="shrink-0 grid grid-cols-2 gap-2 px-4 pt-3 pb-1">
      <TStatCell label="Active Events" value={String(activeCount)} />
      <TStatCell label="Upcoming (7d)" value={String(upcomingCount)} />
      <TStatCell label="Active Quests" value={String(questCount)} />
      <TStatCell label="Routines" value={String(routineCount)} />
    </div>
  );
}

function TStatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </p>
      <p className="text-base font-bold text-gray-900 dark:text-gray-100 mt-0.5">{value}</p>
    </div>
  );
}

// ── TAB PILL ──────────────────────────────────────────────────────────────────

type TrackingTab = 'active' | 'upcoming' | 'quests';

interface TabPillProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function TabPill({ label, active, onClick }: TabPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
        active
          ? 'bg-purple-600 text-white'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
      }`}
    >
      {label}
    </button>
  );
}

// ── ACTIVE TAB ────────────────────────────────────────────────────────────────

interface ActiveTabProps {
  events: Event[];
  plannedEvents: Record<string, PlannedEvent>;
  onOpen: (id: string) => void;
}

function ActiveTab({ events, plannedEvents, onOpen }: ActiveTabProps) {
  if (events.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
        No active events.
      </p>
    );
  }
  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
      {events.map((ev) => {
        const color = resolveColor(ev, plannedEvents);
        return (
          <button
            key={ev.id}
            type="button"
            className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/60"
            onClick={() => onOpen(ev.id)}
          >
            {/* Color swatch */}
            <span
              className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {ev.name}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {ev.startTime} – {ev.endTime}
              </p>
            </div>
            {/* State indicator dot using event color */}
            <span
              className="shrink-0 h-2 w-2 rounded-full"
              style={{ backgroundColor: color }}
              title={stateLabel(ev.completionState)}
            />
          </button>
        );
      })}
    </div>
  );
}

// ── UPCOMING TAB ──────────────────────────────────────────────────────────────

interface UpcomingEntry {
  pe: PlannedEvent;
  nextDate: string;
}

function UpcomingTab({ entries }: { entries: UpcomingEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
        No upcoming events in the next 7 days.
      </p>
    );
  }
  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
      {entries.map(({ pe, nextDate }) => (
        <div key={`${pe.id}-${nextDate}`} className="flex items-center gap-3 px-4 py-2.5">
          <span
            className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: pe.color }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {pe.name}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {new Date(nextDate + 'T00:00:00').toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
              {' · '}
              {recurrenceLabel(pe)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── QUESTS TAB ────────────────────────────────────────────────────────────────

interface QuestRowProps {
  actName: string;
  chainName: string;
  quest: Quest;
}

function QuestRow({ actName, chainName, quest }: QuestRowProps) {
  return (
    <div className="px-4 py-2.5">
      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
        {actName} · {chainName}
      </p>
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5 truncate">
        {quest.name}
      </p>
      {/* Progress bar */}
      <div className="mt-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
        <div
          className="bg-purple-500 h-1.5 rounded-full transition-all"
          style={{ width: `${quest.progressPercent}%` }}
        />
      </div>
      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
        {quest.progressPercent}% complete
      </p>
    </div>
  );
}

function QuestsTab({
  entries,
}: {
  entries: Array<{ actName: string; chainName: string; quest: Quest; key: string }>;
}) {
  if (entries.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
        No active quests.
      </p>
    );
  }
  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
      {entries.map(({ actName, chainName, quest, key }) => (
        <QuestRow key={key} actName={actName} chainName={chainName} quest={quest} />
      ))}
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────

interface TrackingRoomProps {
  onOpenEvent: (eventId: string) => void;
}

export function TrackingRoom({ onOpenEvent }: TrackingRoomProps) {
  const activeEvents = useScheduleStore((s) => s.activeEvents);
  const plannedEvents = useScheduleStore((s) => s.plannedEvents);
  const acts = useProgressionStore((s) => s.acts);

  const [tab, setTab] = useState<TrackingTab>('active');

  const today = localISODate(new Date());

  // ── ACTIVE tab data ────────────────────────────────────────────────────────
  const activeList = useMemo(() =>
    Object.values(activeEvents).filter(
      (e): e is Event =>
        e.eventType !== 'quickActions' && !isWelcomeEvent(e as Event),
    ),
    [activeEvents],
  );

  // ── UPCOMING tab data — PlannedEvents due in next 7 days ──────────────────
  // For each PE, find earliest occurrence date in [tomorrow, today+7].
  // Deduplicate by PE id (show each PE once with its next date).
  const upcomingEntries = useMemo<UpcomingEntry[]>(() => {
    const peList = Object.values(plannedEvents);
    const result: UpcomingEntry[] = [];
    const todayDate = new Date(today + 'T00:00:00');

    for (const pe of peList) {
      for (let i = 1; i <= 7; i++) {
        const candidate = addDays(todayDate, i);
        const candidateISO = localISODate(candidate);
        if (isPlannedEventDue(pe, candidateISO)) {
          result.push({ pe, nextDate: candidateISO });
          break; // earliest occurrence per PE only
        }
      }
    }

    return result.sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  }, [plannedEvents, today]);

  // ── QUESTS tab data ────────────────────────────────────────────────────────
  const questEntries = useMemo(() => {
    const result: Array<{ actName: string; chainName: string; quest: Quest; key: string }> = [];
    for (const act of Object.values(acts)) {
      for (let ci = 0; ci < act.chains.length; ci++) {
        const chain = act.chains[ci]!;
        for (let qi = 0; qi < chain.quests.length; qi++) {
          const quest = chain.quests[qi]!;
          if (quest.completionState === 'active') {
            result.push({
              actName: act.name,
              chainName: chain.name,
              quest,
              key: `${act.id}-${ci}-${qi}`,
            });
          }
        }
      }
    }
    return result;
  }, [acts]);

  // ── Summary card counts ────────────────────────────────────────────────────
  const routineCount = useMemo(
    () => Object.values(plannedEvents).filter((pe) => pe.activeState === 'active' && !isOneOffEvent(pe)).length,
    [plannedEvents],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Summary card */}
      <TrackingSummaryCard
        activeCount={activeList.length}
        upcomingCount={upcomingEntries.length}
        questCount={questEntries.length}
        routineCount={routineCount}
      />

      {/* Tab bar */}
      <div className="shrink-0 flex gap-2 px-4 pt-2 pb-2 border-b border-gray-100 dark:border-gray-800">
        <TabPill label="Active" active={tab === 'active'} onClick={() => setTab('active')} />
        <TabPill label="Upcoming" active={tab === 'upcoming'} onClick={() => setTab('upcoming')} />
        <TabPill label="Quests" active={tab === 'quests'} onClick={() => setTab('quests')} />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'active' && (
          <ActiveTab events={activeList} plannedEvents={plannedEvents} onOpen={onOpenEvent} />
        )}
        {tab === 'upcoming' && <UpcomingTab entries={upcomingEntries} />}
        {tab === 'quests' && <QuestsTab entries={questEntries} />}
      </div>
    </div>
  );
}
