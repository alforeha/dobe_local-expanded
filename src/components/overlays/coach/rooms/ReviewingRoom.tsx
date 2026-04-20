// ─────────────────────────────────────────
// ReviewingRoom — COACH-D
// Summary card: total completed, best XP day, streak, tasks done.
// Tab 1 COMPLETED: historyEvents (complete) + today's activeEvents (complete), newest first.
// Tab 2 INCOMPLETE: historyEvents where completionState !== 'complete' AND endDate < today.
// ─────────────────────────────────────────

import { useState, useMemo } from 'react';
import { useScheduleStore } from '../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../stores/useUserStore';
import { localISODate } from '../../../../utils/dateUtils';
import type { Event } from '../../../../types/event';

// ── HELPERS ───────────────────────────────────────────────────────────────────

function formatDateShort(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function completionBadge(state: Event['completionState']): { text: string; cls: string } {
  if (state === 'complete')
    return {
      text: 'Done',
      cls: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
    };
  if (state === 'skipped')
    return {
      text: 'Skipped',
      cls: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
    };
  return {
    text: 'Expired',
    cls: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400',
  };
}

// ── SUMMARY CARD ──────────────────────────────────────────────────────────────

interface SummaryCardProps {
  totalCompleted: number;
  bestXpDate: string | null;
  bestXp: number;
  streak: number;
  tasksCompleted: number;
  onBestDayClick: (date: string) => void;
}

function SummaryCard({
  totalCompleted,
  bestXpDate,
  bestXp,
  streak,
  tasksCompleted,
  onBestDayClick,
}: SummaryCardProps) {
  return (
    <div className="shrink-0 grid grid-cols-2 gap-2 px-4 pt-3 pb-1">
      <StatCell label="Events Done" value={String(totalCompleted)} />
      {bestXpDate ? (
        <button
          type="button"
          className="rounded-lg bg-indigo-50 dark:bg-indigo-900/25 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 px-3 py-2 text-left transition-colors"
          onClick={() => onBestDayClick(bestXpDate)}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-400 dark:text-indigo-500">Best XP Day</p>
          <p className="text-base font-bold text-indigo-700 dark:text-indigo-300 mt-0.5">+{bestXp} XP</p>
          <p className="text-[10px] text-indigo-500 dark:text-indigo-400 mt-0.5">{formatDateShort(bestXpDate)}</p>
        </button>
      ) : (
        <StatCell label="Best XP Day" value="—" />
      )}
      <StatCell label="Streak" value={streak > 0 ? `${streak}d` : '—'} />
      <StatCell label="Tasks Done" value={String(tasksCompleted)} />
    </div>
  );
}

function StatCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </p>
      <p className="text-base font-bold text-gray-900 dark:text-gray-100 mt-0.5">{value}</p>
      {sub && (
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>
      )}
    </div>
  );
}

// ── TAB PILL ──────────────────────────────────────────────────────────────────

type ReviewTab = 'completed' | 'incomplete';

interface TabPillProps {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}

function TabPill({ label, active, onClick, badge }: TabPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
        active
          ? 'bg-indigo-600 text-white'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
      }`}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span
          className={`rounded-full px-1.5 py-0 text-[9px] font-bold leading-none ${
            active
              ? 'bg-white/30 text-white'
              : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ── EVENT ROW ─────────────────────────────────────────────────────────────────

function EventRow({ event, onOpen }: { event: Event; onOpen: () => void }) {
  const badge = completionBadge(event.completionState);
  return (
    <button
      type="button"
      className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/60"
      onClick={onOpen}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {event.name}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          {formatDateShort(event.startDate)}
          {event.xpAwarded > 0 && ` · +${event.xpAwarded} XP`}
        </p>
      </div>
      <span
        className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}
      >
        {badge.text}
      </span>
    </button>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────

interface ReviewingRoomProps {
  onNavigateToDayView: (date: string) => void;
  onOpenEvent: (eventId: string) => void;
}

export function ReviewingRoom({ onNavigateToDayView, onOpenEvent }: ReviewingRoomProps) {
  const historyEvents = useScheduleStore((s) => s.historyEvents);
  const activeEvents = useScheduleStore((s) => s.activeEvents);
  const user = useUserStore((s) => s.user);

  const [tab, setTab] = useState<ReviewTab>('completed');
  const today = localISODate(new Date());

  // Non-QA history events
  const historyList = useMemo(
    () =>
      Object.values(historyEvents).filter(
        (e): e is Event => e.eventType !== 'quickActions',
      ),
    [historyEvents],
  );

  // Today's completed events from activeEvents (move to history only on rollover)
  const todayCompleted = useMemo(
    () =>
      Object.values(activeEvents).filter(
        (e): e is Event => e.eventType !== 'quickActions' && e.completionState === 'complete',
      ),
    [activeEvents],
  );

  // COMPLETED tab: historyEvents complete + today active complete, newest first
  const completedList = useMemo(() => {
    const fromHistory = historyList.filter((e) => e.completionState === 'complete');
    return [...fromHistory, ...todayCompleted].sort(
      (a, b) =>
        b.startDate.localeCompare(a.startDate) || b.startTime.localeCompare(a.startTime),
    );
  }, [historyList, todayCompleted]);

  // INCOMPLETE tab: historyEvents not complete, endDate < today, newest first
  const incompleteList = useMemo(
    () =>
      historyList
        .filter((e) => e.completionState !== 'complete' && e.endDate < today)
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [historyList, today],
  );

  // Best XP day across history completed events
  const bestXpResult = useMemo(() => {
    const byDate: Record<string, number> = {};
    for (const e of historyList) {
      if (e.completionState === 'complete') {
        byDate[e.startDate] = (byDate[e.startDate] ?? 0) + e.xpAwarded;
      }
    }
    const entries = Object.entries(byDate).sort(([, a], [, b]) => b - a);
    return entries[0] ?? null;
  }, [historyList]);

  const streak = user?.progression.stats.milestones.streakCurrent ?? 0;
  const tasksCompleted = user?.progression.stats.milestones.tasksCompleted ?? 0;

  const visibleList = tab === 'completed' ? completedList : incompleteList;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Summary card */}
      <SummaryCard
        totalCompleted={completedList.length}
        bestXpDate={bestXpResult ? bestXpResult[0] : null}
        bestXp={bestXpResult ? bestXpResult[1] : 0}
        streak={streak}
        tasksCompleted={tasksCompleted}
        onBestDayClick={onNavigateToDayView}
      />

      {/* Tab bar */}
      <div className="shrink-0 flex gap-2 px-4 pt-2 pb-2 border-b border-gray-100 dark:border-gray-800">
        <TabPill
          label="Completed"
          active={tab === 'completed'}
          onClick={() => setTab('completed')}
          badge={completedList.length}
        />
        <TabPill
          label="Incomplete"
          active={tab === 'incomplete'}
          onClick={() => setTab('incomplete')}
          badge={incompleteList.length}
        />
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700/60">
        {visibleList.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
            {tab === 'completed' ? 'No completed events yet.' : 'No incomplete past events.'}
          </p>
        )}
        {visibleList.map((event) => (
          <EventRow key={event.id} event={event} onOpen={() => onOpenEvent(event.id)} />
        ))}
      </div>
    </div>
  );
}
