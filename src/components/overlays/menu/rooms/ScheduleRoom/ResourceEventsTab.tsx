// ─────────────────────────────────────────
// ResourceEventsTab — virtual resource events computed at render time. K.
// D97: no PlannedEvents stored — events are derived from resource meta.
// Grouped by type, sorted by date (soonest first) within each group.
// ─────────────────────────────────────────

import { useMemo } from 'react';
import { useResourceStore } from '../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../stores/useUserStore';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import type {
  AccountResource,
  ContactResource,
  DocResource,
  HomeResource,
  VehicleResource,
  ResourceRecurrenceRule,
  RecurrenceDayOfWeek,
} from '../../../../../types/resource';
import { normalizeRecurrenceMode } from '../../../../../types/resource';
import type { Task } from '../../../../../types/task';
import { IconDisplay } from '../../../../shared/IconDisplay';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ResourceEvent {
  key: string;
  resourceId: string;
  resourceIcon: string;
  label: string;
  date: string;     // YYYY-MM-DD
  daysAway: number; // 0 = today
}

interface EventGroup {
  header: string;
  events: ResourceEvent[];
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function todayMidnight(): Date {
  return new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
}

function daysUntilDate(isoDate: string): number {
  const today = todayMidnight();
  const target = new Date(isoDate.slice(0, 10) + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function formatShortDate(isoDate: string): string {
  const d = new Date(isoDate.slice(0, 10) + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Next annual occurrence of a birthday stored as YYYY-MM-DD.
 *  Uses strictly-past comparison so a birthday TODAY shows as daysAway=0.
 *  No upper-bound cap — show all upcoming birthdays within the next year. */
function nextAnnualDate(birthday: string): { date: string; days: number } | null {
  const parts = birthday.slice(0, 10).split('-');
  if (parts.length < 3) return null;
  const today = todayMidnight();
  const yr = today.getFullYear();
  let next = new Date(`${yr}-${parts[1]}-${parts[2]}T00:00:00`);
  // Advance to next year only if the date has already *passed* (strictly < today)
  if (next < today) next = new Date(`${yr + 1}-${parts[1]}-${parts[2]}T00:00:00`);
  const days = Math.round((next.getTime() - today.getTime()) / 86_400_000);
  return { date: next.toISOString().slice(0, 10), days };
}

/** Next occurrence of a RecurrenceRule. */
function computeNextOccurrence(rule: ResourceRecurrenceRule): { date: string; days: number } {
  const today = todayMidnight();
  const seed = new Date(rule.seedDate + 'T00:00:00');

  if (seed >= today) {
    const days = Math.round((seed.getTime() - today.getTime()) / 86_400_000);
    return { date: rule.seedDate, days };
  }

  const interval = Math.max(1, rule.interval);

  switch (rule.frequency) {
    case 'daily': {
      const periodMs = interval * 86_400_000;
      const elapsed = Math.floor((today.getTime() - seed.getTime()) / periodMs);
      const next = new Date(seed.getTime() + (elapsed + 1) * periodMs);
      const days = Math.round((next.getTime() - today.getTime()) / 86_400_000);
      return { date: next.toISOString().slice(0, 10), days };
    }
    case 'weekly': {
      if (rule.days.length > 0) {
        const DOW_ORDER = ['sun','mon','tue','wed','thu','fri','sat'];
        const todayDow = today.getDay();
        const diffs = rule.days
          .map((d: RecurrenceDayOfWeek) => DOW_ORDER.indexOf(d))
          .filter((i: number) => i >= 0)
          .map((dow: number) => (dow - todayDow + 7) % 7);
        if (diffs.length > 0) {
          const minDiff = Math.min(...diffs);
          const next = new Date(today);
          next.setDate(next.getDate() + minDiff);
          return { date: next.toISOString().slice(0, 10), days: minDiff };
        }
      }
      const periodMs = interval * 7 * 86_400_000;
      const elapsed = Math.floor((today.getTime() - seed.getTime()) / periodMs);
      const next = new Date(seed.getTime() + (elapsed + 1) * periodMs);
      const days = Math.round((next.getTime() - today.getTime()) / 86_400_000);
      return { date: next.toISOString().slice(0, 10), days };
    }
    case 'monthly': {
      const seedDay = seed.getDate();
      const next = new Date(today);
      next.setDate(seedDay);
      if (next < today) next.setMonth(next.getMonth() + interval);
      next.setDate(seedDay);
      const days = Math.round((next.getTime() - today.getTime()) / 86_400_000);
      return { date: next.toISOString().slice(0, 10), days };
    }
    case 'yearly': {
      const next = new Date(seed);
      while (next < today) next.setFullYear(next.getFullYear() + interval);
      const days = Math.round((next.getTime() - today.getTime()) / 86_400_000);
      return { date: next.toISOString().slice(0, 10), days };
    }
    default:
      return { date: today.toISOString().slice(0, 10), days: 0 };
  }
}

const sortByDays = (a: ResourceEvent, b: ResourceEvent) => a.daysAway - b.daysAway;

// ── Component ──────────────────────────────────────────────────────────────────

export function ResourceEventsTab() {
  const resources = useResourceStore((s) => s.resources);
  const user      = useUserStore((s) => s.user);
  const tasks     = useScheduleStore((s) => s.tasks) as Record<string, Task>;

  // Resource IDs that have any pending GTD task queued
  const gtdResourceIds = useMemo(() => {
    const gtdTaskIds = new Set(user?.lists.gtdList ?? []);
    const ids = new Set<string>();
    for (const t of Object.values(tasks)) {
      if (t.completionState === 'pending' && t.resourceRef && gtdTaskIds.has(t.id)) {
        ids.add(t.resourceRef);
      }
    }
    return ids;
  }, [user, tasks]);

  const groups = useMemo<EventGroup[]>(() => {
    const birthdays:     ResourceEvent[] = [];
    const vehicleEvents: ResourceEvent[] = [];
    const accountEvents: ResourceEvent[] = [];
    const docEvents:     ResourceEvent[] = [];
    const choreEvents:   ResourceEvent[] = [];

    for (const resource of Object.values(resources)) {
      const rIcon = resource.icon;

      // ── Contacts: birthdays ─────────────────────────────────────────────────
      if (resource.type === 'contact') {
        const contact = resource as ContactResource;
        const bd = contact.birthday;
        if (bd) {
          const next = nextAnnualDate(bd);
          // No upper-bound cap for birthdays — show the full coming year
          if (next && next.days >= 0) {
            birthdays.push({
              key: `birthday-${resource.id}`,
              resourceId: resource.id,
              resourceIcon: rIcon,
              label: `${resource.name}'s Birthday`,
              date: next.date,
              daysAway: next.days,
            });
          }
        }
      }

      // ── Vehicles: insurance, service, maintenance tasks ─────────────────────
      if (resource.type === 'vehicle') {
        const vehicle = resource as VehicleResource;

        if (vehicle.insuranceExpiry) {
          const d = daysUntilDate(vehicle.insuranceExpiry);
          if (d >= 0) {
            vehicleEvents.push({
              key: `veh-ins-${resource.id}`,
              resourceId: resource.id,
              resourceIcon: rIcon,
              label: `${resource.name} Insurance`,
              date: vehicle.insuranceExpiry.slice(0, 10),
              daysAway: d,
            });
          }
        }

        if (vehicle.serviceNextDate) {
          const d = daysUntilDate(vehicle.serviceNextDate);
          if (d >= 0) {
            vehicleEvents.push({
              key: `veh-svc-${resource.id}`,
              resourceId: resource.id,
              resourceIcon: rIcon,
              label: `${resource.name} Service Due`,
              date: vehicle.serviceNextDate.slice(0, 10),
              daysAway: d,
            });
          }
        }

        for (const task of vehicle.maintenanceTasks ?? []) {
          if (normalizeRecurrenceMode(task.recurrenceMode) === 'never') continue;
          const next = computeNextOccurrence(task.recurrence);
          vehicleEvents.push({
            key: `veh-task-${resource.id}-${task.id}`,
            resourceId: resource.id,
            resourceIcon: task.icon || rIcon,
            label: `${resource.name}: ${task.name}`,
            date: next.date,
            daysAway: next.days,
          });
        }
      }

      // ── Accounts: due dates + account tasks ────────────────────────────────
      if (resource.type === 'account') {
        const account = resource as AccountResource;
        if (account.dueDate) {
          const d = daysUntilDate(account.dueDate);
          if (d >= 0) {
            accountEvents.push({
              key: `acct-due-${resource.id}`,
              resourceId: resource.id,
              resourceIcon: rIcon,
              label: `${resource.name} Payment Due`,
              date: account.dueDate.slice(0, 10),
              daysAway: d,
            });
          }
        }
        for (const task of account.accountTasks ?? []) {
          if (task.kind === 'transaction-log') continue;
          if (normalizeRecurrenceMode(task.recurrenceMode) === 'never') continue;
          const next = computeNextOccurrence(task.recurrence);
          accountEvents.push({
            key: `acct-task-${resource.id}-${task.id}`,
            resourceId: resource.id,
            resourceIcon: task.icon || rIcon,
            label: `${resource.name}: ${task.name}`,
            date: next.date,
            daysAway: next.days,
          });
        }
      }

      // ── Docs: expiry dates ──────────────────────────────────────────────────
      if (resource.type === 'doc') {
        const doc = resource as DocResource;
        if (doc.expiryDate) {
          const d = daysUntilDate(doc.expiryDate);
          if (d >= 0) {
            docEvents.push({
              key: `doc-exp-${resource.id}`,
              resourceId: resource.id,
              resourceIcon: rIcon,
              label: `${resource.name} Expires`,
              date: doc.expiryDate.slice(0, 10),
              daysAway: d,
            });
          }
        }
      }

      // ── Homes: chores ───────────────────────────────────────────────────────
      if (resource.type === 'home') {
        const home = resource as HomeResource;
        for (const chore of home.chores ?? []) {
          if (normalizeRecurrenceMode(chore.recurrenceMode) === 'never') continue;
          const next = computeNextOccurrence(chore.recurrence);
          choreEvents.push({
            key: `chore-${resource.id}-${chore.id}`,
            resourceId: resource.id,
            resourceIcon: chore.icon || rIcon,
            label: `${resource.name}: ${chore.name}`,
            date: next.date,
            daysAway: next.days,
          });
        }
      }
    }

    birthdays.sort(sortByDays);
    vehicleEvents.sort(sortByDays);
    accountEvents.sort(sortByDays);
    docEvents.sort(sortByDays);
    choreEvents.sort(sortByDays);

    return [
      { header: '🎂 Birthdays',   events: birthdays     },
      { header: '🚗 Vehicles',    events: vehicleEvents  },
      { header: '💳 Accounts',    events: accountEvents  },
      { header: '📄 Docs',        events: docEvents      },
      { header: '🏠 Home Chores', events: choreEvents    },
    ].filter((g) => g.events.length > 0);
  }, [resources]);

  if (groups.length === 0) {
    return (
      <p className="text-center text-gray-400 text-sm py-10">
        No upcoming resource events.
      </p>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
      {groups.map((group) => (
        <div key={group.header}>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
            {group.header}
          </h3>
          <div className="space-y-1">
            {group.events.map((ev) => {
              const hasGtd = gtdResourceIds.has(ev.resourceId);
              const urgency =
                ev.daysAway === 0 ? 'text-red-500' :
                ev.daysAway <= 7  ? 'text-amber-500' :
                'text-gray-400 dark:text-gray-500';

              return (
                <div
                  key={ev.key}
                  className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg px-3 py-2"
                >
                  <IconDisplay iconKey={ev.resourceIcon} size={16} className="h-4 w-4 shrink-0 object-contain" alt="" />
                  <span className="flex-1 text-sm text-gray-700 dark:text-gray-200 truncate min-w-0">
                    {ev.label}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                    {formatShortDate(ev.date)}
                  </span>
                  <span className={`text-xs font-medium shrink-0 ${urgency}`}>
                    {ev.daysAway === 0 ? 'today' : `${ev.daysAway}d`}
                  </span>
                  {hasGtd && (
                    <span
                      className="text-xs text-green-500 shrink-0"
                      title="GTD task queued"
                    >
                      ✓
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
