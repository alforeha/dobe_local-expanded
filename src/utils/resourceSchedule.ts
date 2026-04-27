import {
  isAccount,
  isContact,
  isDoc,
  isHome,
  isInventory,
  isVehicle,
  normalizeRecurrenceMode,
  type HomeChore,
  type Resource,
  type ResourceRecurrenceRule,
  type ResourceType,
} from '../types';

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function getLastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function isChoreOnDate(chore: HomeChore, dateISO: string): boolean {
  if (normalizeRecurrenceMode(chore.recurrenceMode) === 'never') return false;
  return isRuleOnDate(chore.recurrence, dateISO);
}

function isIntermittentOnDate(
  recurrenceMode: 'recurring' | 'never' | undefined,
  rule: ResourceRecurrenceRule | undefined,
  dateISO: string,
): boolean {
  if (normalizeRecurrenceMode(recurrenceMode) !== 'never') return false;
  return rule?.seedDate === dateISO;
}

function isRuleOnDate(rule: ResourceRecurrenceRule, dateISO: string, excludeSeedDate = false): boolean {
  if (!rule?.seedDate) return false;
  if (rule.seedDate > dateISO) return false;
  if (excludeSeedDate && rule.seedDate === dateISO) return false;
  if (rule.endsOn && rule.endsOn < dateISO) return false;

  const target = new Date(`${dateISO}T00:00:00`);
  const seed = new Date(`${rule.seedDate}T00:00:00`);
  const interval = Math.max(1, rule.interval || 1);

  switch (rule.frequency) {
    case 'daily': {
      const diffDays = daysBetween(seed, target);
      return diffDays >= 0 && diffDays % interval === 0;
    }
    case 'weekly': {
      const diffDays = daysBetween(seed, target);
      const diffWeeks = Math.floor(diffDays / 7);
      if (diffWeeks < 0 || diffWeeks % interval !== 0) return false;
      const weekdayKey = WEEKDAY_KEYS[target.getDay()];
      return rule.days.length === 0 ? target.getDay() === seed.getDay() : rule.days.includes(weekdayKey);
    }
    case 'monthly': {
      const monthDiff =
        (target.getFullYear() - seed.getFullYear()) * 12 +
        (target.getMonth() - seed.getMonth());
      if (monthDiff < 0 || monthDiff % interval !== 0) return false;
      const requestedDay = rule.monthlyDay ?? seed.getDate();
      const resolvedDay = Math.min(requestedDay, getLastDayOfMonth(target.getFullYear(), target.getMonth()));
      return target.getDate() === resolvedDay;
    }
    case 'yearly': {
      const yearDiff = target.getFullYear() - seed.getFullYear();
      return (
        yearDiff >= 0 &&
        yearDiff % interval === 0 &&
        target.getMonth() === seed.getMonth() &&
        target.getDate() === seed.getDate()
      );
    }
    default:
      return false;
  }
}

export function getResourceIconsForDate(dateISO: string, resources: Resource[]): string[] {
  return [...new Set(getResourceIndicatorsForDate(dateISO, resources).map((indicator) => indicator.iconKey))];
}

export interface ResourceIndicator {
  iconKey: string;
  resourceId: string;
  resourceName: string;
  resourceType: ResourceType;
  label: string;
}

function makeIndicator(resource: Resource, iconKey: string, label: string): ResourceIndicator {
  return {
    iconKey,
    resourceId: resource.id,
    resourceName: resource.name,
    resourceType: resource.type,
    label,
  };
}

export function getResourceIndicatorsForDate(dateISO: string, resources: Resource[]): ResourceIndicator[] {
  const indicators: ResourceIndicator[] = [];

  for (const resource of resources) {
    if (isContact(resource) && resource.birthday && resource.birthday.slice(5) === dateISO.slice(5)) {
      indicators.push(makeIndicator(resource, 'birthday', `Birthday — ${resource.displayName}`));
    }

    if (isHome(resource)) {
      for (const chore of resource.chores ?? []) {
        if (isChoreOnDate(chore, dateISO)) {
          indicators.push(makeIndicator(resource, chore.icon || 'chore', chore.name || 'Chore due'));
        }
        if (isIntermittentOnDate(chore.recurrenceMode, chore.recurrence, dateISO)) {
          indicators.push(makeIndicator(resource, chore.icon || 'chore', chore.name || 'Intermittent task'));
        }
      }
    }

    if (isVehicle(resource)) {
      if (resource.serviceNextDate === dateISO) indicators.push(makeIndicator(resource, 'vehicle', 'Service due'));
      if (resource.insuranceExpiry === dateISO) indicators.push(makeIndicator(resource, 'document', 'Insurance expiry'));
      for (const task of resource.maintenanceTasks ?? []) {
        if (normalizeRecurrenceMode(task.recurrenceMode) === 'recurring') {
          if (isRuleOnDate(task.recurrence, dateISO, true)) {
            indicators.push(makeIndicator(resource, task.icon || 'vehicle', task.name || 'Intermittent task'));
          }
        } else if (isIntermittentOnDate(task.recurrenceMode, task.recurrence, dateISO)) {
          indicators.push(makeIndicator(resource, task.icon || 'vehicle', task.name || 'Intermittent task'));
        }
      }
    }

    if (isAccount(resource)) {
      if (resource.dueDate === dateISO) {
        indicators.push(makeIndicator(resource, 'account', 'Due date'));
      }
      for (const task of resource.accountTasks ?? []) {
        if (normalizeRecurrenceMode(task.recurrenceMode) === 'recurring') {
          if (isRuleOnDate(task.recurrence, dateISO, true)) {
            indicators.push(makeIndicator(resource, task.icon || 'account', task.name || 'Intermittent task'));
          }
        } else if (isIntermittentOnDate(task.recurrenceMode, task.recurrence, dateISO)) {
          indicators.push(makeIndicator(resource, task.icon || 'account', task.name || 'Intermittent task'));
        }
      }
    }

    if (isInventory(resource)) {
      const itemSource = (resource.containers ?? []).flatMap((container) => container.items).length > 0
        ? (resource.containers ?? []).flatMap((container) => container.items)
        : resource.items;

      for (const item of itemSource) {
        for (const task of item.recurringTasks ?? []) {
          if (isIntermittentOnDate(task.recurrenceMode, task.recurrence, dateISO)) {
            indicators.push(makeIndicator(resource, 'task', task.taskTemplateRef || 'Intermittent task'));
          }
        }
      }

      for (const container of resource.containers ?? []) {
        if (isIntermittentOnDate(container.carryTask?.recurrenceMode, container.carryTask?.recurrence, dateISO)) {
          indicators.push(makeIndicator(resource, container.icon || 'inventory', container.carryTask?.name || `Carry ${container.name}`));
        }
      }
    }

    if (isDoc(resource) && resource.expiryDate === dateISO) {
      indicators.push(makeIndicator(resource, 'doc', 'Expiry date'));
    }
  }

  return indicators;
}
