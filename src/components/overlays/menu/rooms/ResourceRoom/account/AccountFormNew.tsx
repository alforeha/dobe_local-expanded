import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { taskTemplateLibrary } from '../../../../../../coach';
import { CUSTOM_ITEM_TEMPLATE_PREFIX, getItemTaskTemplateMeta } from '../../../../../../coach/ItemLibrary';
import type {
  AccountKind,
  AccountResource,
  AccountTask,
  AlbumEntry,
  ContactResource,
  HomeResource,
  InventoryItemTemplate,
  InventoryResource,
  Resource,
  ResourceRecurrenceRule,
  VehicleResource,
} from '../../../../../../types/resource';
import {
  getRelationshipOptions,
  isInventory,
  makeDefaultRecurrenceRule,
  normalizeRecurrenceMode,
  type RecurrenceDayOfWeek,
  toRecurrenceRule,
} from '../../../../../../types/resource';
import type { QuickActionsEvent } from '../../../../../../types/event';
import type { Task } from '../../../../../../types/task';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useScheduleStore } from '../../../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { awardStat, awardXP } from '../../../../../../engine/awardPipeline';
import { generateGTDItems } from '../../../../../../engine/resourceEngine';
import { getAppDate, getAppNowISO } from '../../../../../../utils/dateUtils';
import { getCustomTemplatePool, getLibraryTemplatePool } from '../../../../../../utils/resolveTaskTemplate';
import { getUserInventoryItemTemplates, mergeInventoryItemTemplates } from '../../../../../../utils/inventoryItems';
import { TextInput } from '../../../../../shared/inputs/TextInput';
import { NumberInput } from '../../../../../shared/inputs/NumberInput';
import { IconPicker } from '../../../../../shared/IconPicker';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { ResourceFormShell, type ResourceFormTab } from '../../../../../shared/ResourceFormShell';
import { ResourceLinksTabNew } from '../../../../../shared/ResourceLinksTabNew';
import { AlbumViewer } from '../../../../../shared/AlbumViewer';
import { AlbumEntryEditor } from '../../../../../shared/AlbumEntryEditor';
import { TaskTypeConfigEditor } from '../../../../../shared/TaskTypeConfigEditor';
import { TaskTypeInputRenderer } from '../../../../../overlays/event/TaskTypeInputRenderer';
import type { InputFields, TaskTemplate, TaskType } from '../../../../../../types/taskTemplate';

interface AccountFormNewProps {
  existing?: AccountResource;
  onSaved: () => void;
  onCancel: () => void;
}

interface TaskDraft {
  id: string;
  icon: string;
  name: string;
  kind?: 'account-task' | 'transaction-log';
  taskType?: string;
  inputFields?: Partial<InputFields>;
  anticipatedValue: number | '';
  evidenceRequired?: boolean;
  recurrenceMode: 'recurring' | 'never';
  recurrence: ResourceRecurrenceRule;
  reminderLeadDays: number;
}

interface TransactionLogExecuteDraft {
  amount: number | '';
  note: string;
}

interface TransactionLogLinkedAccountMeta {
  linkedAccountId: string;
  linkedAccountName: string;
  linkedAccountIcon: string;
  direction: 'deposit' | 'withdrawal';
}

interface ExecuteCompletionSummary {
  taskId: string;
  taskName: string;
  amountText: string | null;
  note: string | null;
  linkedAccountName: string | null;
  linkedAccountIcon: string | null;
}

interface AllowanceTaskSourceOption {
  value: string;
  label: string;
  icon: string;
  detail?: string;
  seed: Omit<TaskDraft, 'id' | 'kind'>;
}

interface ExecuteTaskInputProps {
  taskId: string;
  executionTemplate: TaskTemplate;
  executionTask: Task;
  onCompleteTask: (taskId: string, result: Partial<InputFields>) => void;
  onResultChangeTask: (taskId: string, result: Partial<InputFields>) => void;
}

function ExecuteTaskInput({
  taskId,
  executionTemplate,
  executionTask,
  onCompleteTask,
  onResultChangeTask,
}: ExecuteTaskInputProps) {
  const handleComplete = useCallback((result: Partial<InputFields>) => {
    onCompleteTask(taskId, result);
  }, [onCompleteTask, taskId]);

  const handleResultChange = useCallback((result: Partial<InputFields>) => {
    onResultChangeTask(taskId, result);
  }, [onResultChangeTask, taskId]);

  return (
    <TaskTypeInputRenderer
      taskType={executionTemplate.taskType}
      template={executionTemplate}
      task={executionTask}
      onComplete={handleComplete}
      onResultChange={handleResultChange}
    />
  );
}

const tabs: ResourceFormTab[] = [
  { key: 'details', label: 'Details' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'links', label: 'Links' },
  { key: 'album', label: 'Album' },
  { key: 'log', label: 'Log' },
];

type ResourceDraftTaskType = Extract<TaskType, 'CHECK' | 'COUNTER' | 'DURATION' | 'TIMER' | 'RATING' | 'TEXT' | 'CONSUME'> | 'USE';

const RESOURCE_TASK_TYPE_OPTIONS: Array<{ value: ResourceDraftTaskType; label: string }> = [
  { value: 'CHECK', label: 'Check' },
  { value: 'COUNTER', label: 'Counter' },
  { value: 'DURATION', label: 'Duration' },
  { value: 'TIMER', label: 'Timer' },
  { value: 'RATING', label: 'Rating' },
  { value: 'TEXT', label: 'Text' },
  { value: 'CONSUME', label: 'Consume' },
  { value: 'USE', label: 'Use' },
];

const KIND_OPTIONS: { value: AccountKind; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'bill', label: 'Bill' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'income', label: 'Income' },
  { value: 'debt', label: 'Debt' },
  { value: 'allowance', label: 'Allowance' },
];

const SELECT_CLS =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

const SMALL_INPUT_CLS =
  'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

const KIND_BUTTON_CLS =
  'rounded-md border px-3 py-2 text-sm font-medium transition-colors';

const AUTO_LINK_RELATIONSHIP_BY_KIND: Partial<Record<AccountKind, string>> = {
  bill: 'bill',
  subscription: 'subscription',
  debt: 'debt',
  allowance: 'allowance',
  income: 'income',
};

const AUTO_LINK_RELATIONSHIPS = new Set(Object.values(AUTO_LINK_RELATIONSHIP_BY_KIND));
const DOW_LABELS: Array<{ key: RecurrenceDayOfWeek; label: string }> = [
  { key: 'sun', label: 'Su' },
  { key: 'mon', label: 'Mo' },
  { key: 'tue', label: 'Tu' },
  { key: 'wed', label: 'We' },
  { key: 'thu', label: 'Th' },
  { key: 'fri', label: 'Fr' },
  { key: 'sat', label: 'Sa' },
];

function makeTransactionLogTask(): TaskDraft {
  return {
    id: uuidv4(),
    icon: 'finance',
    name: 'Transaction Log',
    kind: 'transaction-log',
    taskType: 'TEXT',
    inputFields: { prompt: 'Add transaction details', maxLength: null },
    anticipatedValue: '',
    recurrenceMode: 'never',
    recurrence: makeDefaultRecurrenceRule(),
    reminderLeadDays: -1,
  };
}

function makeBlankTaskDraft(): TaskDraft {
  return {
    id: uuidv4(),
    icon: '',
    name: '',
    kind: 'account-task',
    taskType: 'CHECK',
    inputFields: { label: 'Done' },
    anticipatedValue: '',
    recurrenceMode: 'never',
    recurrence: makeDefaultRecurrenceRule(),
    reminderLeadDays: 7,
  };
}

function cloneRecurrenceRule(rule: ResourceRecurrenceRule): ResourceRecurrenceRule {
  return {
    ...rule,
    days: [...rule.days],
  };
}

function buildTaskDraftSeed(
  name: string,
  icon: string,
  recurrenceMode: TaskDraft['recurrenceMode'] = 'never',
  recurrence: ResourceRecurrenceRule = makeDefaultRecurrenceRule(),
  reminderLeadDays = 7,
  anticipatedValue: number | '' = '',
  taskType: string = 'CHECK',
): Omit<TaskDraft, 'id' | 'kind'> {
  return {
    icon,
    name,
    taskType,
    inputFields: buildTaskInputFields(taskType, name),
    anticipatedValue,
    evidenceRequired: false,
    recurrenceMode,
    recurrence: cloneRecurrenceRule(recurrence),
    reminderLeadDays,
  };
}

function makeTaskDraftFromSeed(seed: Omit<TaskDraft, 'id' | 'kind'>): TaskDraft {
  return {
    id: uuidv4(),
    kind: 'account-task',
    icon: seed.icon,
    name: seed.name,
    taskType: seed.taskType,
    inputFields: seed.inputFields,
    anticipatedValue: seed.anticipatedValue,
    evidenceRequired: seed.evidenceRequired,
    recurrenceMode: seed.recurrenceMode,
    recurrence: cloneRecurrenceRule(seed.recurrence),
    reminderLeadDays: seed.reminderLeadDays,
  };
}

function toTaskDraft(task: AccountTask): TaskDraft {
  return {
    id: task.id,
    icon: task.icon ?? '',
    name: task.name,
    kind: task.kind ?? 'account-task',
    taskType: task.taskType ?? (task.kind === 'transaction-log' ? 'TEXT' : 'CHECK'),
    inputFields: task.inputFields ?? buildTaskInputFields(task.taskType ?? (task.kind === 'transaction-log' ? 'TEXT' : 'CHECK'), task.name),
    anticipatedValue: task.anticipatedValue ?? '',
    evidenceRequired: task.evidenceRequired ?? false,
    recurrenceMode: normalizeRecurrenceMode(task.recurrenceMode),
    recurrence: toRecurrenceRule(task.recurrence),
    reminderLeadDays: task.reminderLeadDays ?? 7,
  };
}

function finaliseTaskDrafts(taskDrafts: TaskDraft[], ensureTransactionLog: boolean, defaultSeedYear: number): AccountTask[] {
  const finalTasks: AccountTask[] = taskDrafts
    .filter((task) => task.name.trim().length > 0)
    .map((task) => {
      const recurrenceMode = normalizeRecurrenceMode(task.recurrenceMode);
      const recurrence = normalizeTaskRecurrenceForSave(task.recurrence, defaultSeedYear);
      return {
        id: task.id,
        icon: task.icon.trim(),
        name: task.name.trim(),
        kind: task.kind ?? 'account-task',
        taskType: task.kind === 'transaction-log'
          ? 'TEXT'
          : normaliseResourceTaskTypeForSave(task.taskType),
        inputFields: task.inputFields,
        anticipatedValue: task.anticipatedValue === '' ? undefined : task.anticipatedValue,
        evidenceRequired: task.evidenceRequired === true ? true : undefined,
        recurrenceMode,
        recurrence,
        reminderLeadDays: task.reminderLeadDays,
      };
    });

  if (ensureTransactionLog && !finalTasks.some((task) => task.kind === 'transaction-log')) {
    finalTasks.unshift({
      id: uuidv4(),
      icon: 'finance',
      name: 'Transaction Log',
      kind: 'transaction-log',
      taskType: 'TEXT',
      inputFields: { prompt: 'Add transaction details', maxLength: null },
      anticipatedValue: undefined,
      recurrenceMode: 'never',
      recurrence: makeDefaultRecurrenceRule(),
      reminderLeadDays: -1,
    });
  }

  return finalTasks;
}

function formatAmountWithTicker(value: number, ticker = '$'): string {
  return `${ticker || '$'}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  })}`;
}

function formatCompactAmount(value: number, prefix = ''): string {
  return `${prefix}${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function getTransactionAmountPrefix(kind: AccountKind, cryptoTicker?: string): string {
  if (kind === 'bill' || kind === 'subscription' || kind === 'debt' || kind === 'allowance') return '- ';
  if (kind === 'income') return '+ ';
  return `${cryptoTicker?.trim() || '$'} `;
}

function formatBankBalancePill(amount: number, ticker: string, unit: AccountResource['cryptoUnit']): string {
  if (unit === 'sats') {
    return `${Math.round(amount).toLocaleString()} SAT`;
  }

  return `${ticker}${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  })}`;
}

function formatBankBalanceAdjustment(amount: number, ticker: string, unit: AccountResource['cryptoUnit']): string {
  const sign = amount >= 0 ? '+' : '-';
  const absoluteAmount = Math.abs(amount);

  if (unit === 'sats') {
    return `${sign}${Math.round(absoluteAmount).toLocaleString()} SAT`;
  }

  return `${sign}${ticker}${absoluteAmount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  })}`;
}

function normalizeResourceDraftTaskType(taskType?: string | null): ResourceDraftTaskType {
  switch (taskType) {
    case 'CHECK':
    case 'COUNTER':
    case 'DURATION':
    case 'TIMER':
    case 'RATING':
    case 'TEXT':
    case 'CONSUME':
    case 'USE':
      return taskType;
    default:
      return 'CHECK';
  }
}

function normaliseResourceTaskTypeForSave(taskType?: string | null): TaskType {
  const draftType = normalizeResourceDraftTaskType(taskType);
  return draftType === 'USE' ? 'TEXT' : draftType;
}

function buildTaskInputFields(taskType: string, title: string, inputFields?: Partial<InputFields> | null): Partial<InputFields> {
  const normalizedTaskType = normalizeResourceDraftTaskType(taskType);

  switch (normalizedTaskType) {
    case 'COUNTER':
      return { target: 1, unit: 'count', step: 1, ...(inputFields ?? {}) };
    case 'DURATION': {
      const durationFields = (inputFields ?? {}) as {
        targetDuration?: number;
        unit?: 'seconds' | 'minutes' | 'hours';
      };
      return {
        targetDuration: durationFields.targetDuration ?? 300,
        unit: durationFields.unit ?? 'seconds',
      };
    }
    case 'TIMER':
      return { countdownFrom: 300, ...(inputFields ?? {}) };
    case 'RATING':
      return { scale: 5, label: title || 'Rate this', ...(inputFields ?? {}) };
    case 'TEXT':
      return { prompt: title || 'Add details', maxLength: null, ...(inputFields ?? {}) };
    case 'CONSUME': {
      const consumeFields = (inputFields ?? {}) as { label?: string; entries?: Array<{ itemTemplateRef: string; quantity: number }> };
      return {
        label: consumeFields.label ?? (title || 'Consume items'),
        entries: consumeFields.entries?.length ? consumeFields.entries : [{ itemTemplateRef: '', quantity: 1 }],
      };
    }
    case 'USE':
      return { prompt: title ? `How will you use ${title}?` : 'Describe the procedure steps', maxLength: null, ...(inputFields ?? {}) };
    case 'CHECK':
    default:
      return { label: title || 'Done', ...(inputFields ?? {}) };
  }
}

function getDayOfMonth(isoDate: string): number {
  const parsed = Number(isoDate.split('-')[2] ?? 1);
  return Math.min(31, Math.max(1, parsed || 1));
}

function getMonthOfYear(isoDate: string): number {
  const parsed = Number(isoDate.split('-')[1] ?? 1);
  return Math.min(12, Math.max(1, parsed || 1));
}

function getYearOfDate(isoDate?: string | null): number | null {
  if (!isoDate) return null;
  const parsed = Number(isoDate.split('-')[0] ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function buildSeedDateFromParts(year: number, month: number, day: number): string {
  const safeMonth = Math.min(12, Math.max(1, month || 1));
  const safeDay = Math.min(getDaysInMonth(year, safeMonth), Math.max(1, day || 1));
  return `${String(year).padStart(4, '0')}-${String(safeMonth).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function normalizeTaskRecurrenceForSave(rule: ResourceRecurrenceRule, defaultSeedYear: number): ResourceRecurrenceRule {
  if (rule.frequency !== 'yearly') return rule;
  return {
    ...rule,
    seedDate: buildSeedDateFromParts(defaultSeedYear, getMonthOfYear(rule.seedDate), getDayOfMonth(rule.seedDate)),
  };
}

function describeCollapsedTaskRecurrence(task: TaskDraft): string {
  if (!task.recurrence?.frequency) return 'On demand';
  if (normalizeRecurrenceMode(task.recurrenceMode) === 'never') return 'On demand';

  switch (task.recurrence.frequency) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    case 'yearly':
      return 'Yearly';
    default:
      return 'On demand';
  }
}

function resolveInventoryTaskDisplay(
  taskTemplateRef: string,
  itemTemplateRef: string,
  templates: InventoryItemTemplate[],
): { name: string; icon: string } {
  if (itemTemplateRef.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX)) {
    const template = templates.find((entry) => entry.id === itemTemplateRef);
    const customTask = template?.customTaskTemplates?.find((entry) => entry.name.trim() === taskTemplateRef);
    if (customTask) {
      return {
        name: customTask.name,
        icon: customTask.icon || 'task',
      };
    }
  }

  const coachTask = taskTemplateLibrary.find((template) => template.id === taskTemplateRef);
  if (coachTask) {
    return {
      name: coachTask.name,
      icon: coachTask.icon || 'task',
    };
  }

  const itemTaskMeta = getItemTaskTemplateMeta(taskTemplateRef);
  if (itemTaskMeta) {
    return {
      name: itemTaskMeta.name,
      icon: itemTaskMeta.icon || 'task',
    };
  }

  return {
    name: taskTemplateRef,
    icon: 'task',
  };
}

function collectExistingResourceTaskOptions(
  resources: Record<string, Resource>,
  inventoryTemplates: InventoryItemTemplate[],
  currentAccountId?: string,
): AllowanceTaskSourceOption[] {
  const options: AllowanceTaskSourceOption[] = [];

  for (const resource of Object.values(resources)) {
    if (resource.type === 'home') {
      const home = resource as HomeResource;
      for (const chore of home.chores ?? []) {
        options.push({
          value: `resource:${home.id}:home:${chore.id}`,
          label: `${home.name} - ${chore.name}`,
          icon: chore.icon || home.icon || 'home',
          detail: 'Existing home chore',
          seed: buildTaskDraftSeed(
            chore.name,
            chore.icon || home.icon || 'home',
            normalizeRecurrenceMode(chore.recurrenceMode),
            chore.recurrence,
            chore.reminderLeadDays ?? 7,
          ),
        });
      }
      continue;
    }

    if (resource.type === 'vehicle') {
      const vehicle = resource as VehicleResource;
      for (const task of vehicle.maintenanceTasks ?? []) {
        options.push({
          value: `resource:${vehicle.id}:vehicle:${task.id}`,
          label: `${vehicle.name} - ${task.name}`,
          icon: task.icon || vehicle.icon || 'vehicle',
          detail: 'Existing vehicle task',
          seed: buildTaskDraftSeed(
            task.name,
            task.icon || vehicle.icon || 'vehicle',
            normalizeRecurrenceMode(task.recurrenceMode),
            task.recurrence,
            task.reminderLeadDays,
          ),
        });
      }
      continue;
    }

    if (resource.type === 'account') {
      const account = resource as AccountResource;
      if (account.id === currentAccountId) continue;
      for (const task of [...(account.accountTasks ?? []), ...(account.allowanceTasks ?? [])]) {
        if (task.kind === 'transaction-log') continue;
        options.push({
          value: `resource:${account.id}:account:${task.id}`,
          label: `${account.name} - ${task.name}`,
          icon: task.icon || account.icon || 'finance',
          detail: 'Existing account task',
          seed: buildTaskDraftSeed(
            task.name,
            task.icon || account.icon || 'finance',
            normalizeRecurrenceMode(task.recurrenceMode),
            task.recurrence,
            task.reminderLeadDays ?? 7,
            task.anticipatedValue ?? '',
          ),
        });
      }
      continue;
    }

    if (isInventory(resource)) {
      const inventory = resource as InventoryResource;
      for (const item of inventory.items ?? []) {
        for (const task of item.recurringTasks ?? []) {
          const display = resolveInventoryTaskDisplay(task.taskTemplateRef, item.itemTemplateRef, inventoryTemplates);
          options.push({
            value: `resource:${inventory.id}:inventory:${item.id}:${task.id}`,
            label: `${inventory.name} - ${display.name}`,
            icon: display.icon || inventory.icon || 'task',
            detail: 'Existing inventory task',
            seed: buildTaskDraftSeed(
              display.name,
              display.icon || inventory.icon || 'task',
              normalizeRecurrenceMode(task.recurrenceMode),
              task.recurrence,
              task.reminderLeadDays ?? 7,
            ),
          });
        }
      }

      for (const container of inventory.containers ?? []) {
        for (const item of container.items ?? []) {
          for (const task of item.recurringTasks ?? []) {
            const display = resolveInventoryTaskDisplay(task.taskTemplateRef, item.itemTemplateRef, inventoryTemplates);
            options.push({
              value: `resource:${inventory.id}:inventory:${container.id}:${item.id}:${task.id}`,
              label: `${inventory.name} - ${display.name}`,
              icon: display.icon || inventory.icon || 'task',
              detail: `Existing inventory task${container.name ? ` \u00B7 ${container.name}` : ''}`,
              seed: buildTaskDraftSeed(
                display.name,
                display.icon || inventory.icon || 'task',
                normalizeRecurrenceMode(task.recurrenceMode),
                task.recurrence,
                task.reminderLeadDays ?? 7,
              ),
            });
          }
        }
      }
    }
  }

  return options.sort((left, right) => left.label.localeCompare(right.label));
}

function formatCompletionDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

function formatDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function addMonthsToIsoDate(isoDate: string, monthsToAdd: number): string | null {
  const [yearPart, monthPart, dayPart] = isoDate.split('-').map(Number);
  if (!yearPart || !monthPart || !dayPart) return null;

  const firstOfTargetMonth = new Date(yearPart, monthPart - 1 + monthsToAdd, 1);
  if (Number.isNaN(firstOfTargetMonth.getTime())) return null;

  const lastDayOfTargetMonth = new Date(firstOfTargetMonth.getFullYear(), firstOfTargetMonth.getMonth() + 1, 0).getDate();
  const adjustedDate = new Date(firstOfTargetMonth.getFullYear(), firstOfTargetMonth.getMonth(), Math.min(dayPart, lastDayOfTargetMonth));
  return Number.isNaN(adjustedDate.getTime()) ? null : adjustedDate.toISOString().slice(0, 10);
}

function computeDebtMinimumPayment(
  debtMode: 'loan' | 'credit',
  startingBalance: number | '',
  currentBalance: number | '',
  minPaymentPercent: number | '',
  debtRate: number | '',
  debtTerm: number | '',
): number | null {
  if (debtMode === 'credit') {
    if (currentBalance === '') return null;
    const percent = minPaymentPercent === '' ? 2 : minPaymentPercent;
    return currentBalance * (percent / 100);
  }

  if (startingBalance === '' || debtRate === '' || debtTerm === '' || debtTerm <= 0) return null;

  const principal = startingBalance;
  const monthlyRate = debtRate / 12 / 100;
  const months = debtTerm;
  if (monthlyRate === 0) return principal / months;
  const factor = (1 + monthlyRate) ** months;
  return principal * ((monthlyRate * factor) / (factor - 1));
}

function simulateDebtPayoff(
  startingBalance: number | '',
  currentBalance: number | '',
  debtRate: number | '',
  minimumPayment: number | null,
  myPayment: number | '',
): { totalInterest: number; months: number; effectivePayment: number; usingCustomPayment: boolean } | null {
  if (startingBalance === '' || minimumPayment == null) return null;

  const monthlyRate = (debtRate === '' ? 0 : debtRate) / 12 / 100;
  const initialBalance = currentBalance !== '' ? currentBalance : startingBalance;
  const monthlyInterest = initialBalance * monthlyRate;
  const usingCustomPayment = myPayment !== '' && myPayment > monthlyInterest && myPayment > minimumPayment;
  const effectivePayment = usingCustomPayment
    ? myPayment
    : minimumPayment;

  let balance = initialBalance;
  let totalInterest = 0;
  let months = 0;

  while (balance > 0.000001 && months < 600) {
    const interest = balance * monthlyRate;
    const principal = Math.min(effectivePayment - interest, balance);
    if (principal <= 0) return null;
    totalInterest += interest;
    balance -= principal;
    months += 1;
  }

  if (months === 0) return null;

  return {
    totalInterest,
    months,
    effectivePayment,
    usingCustomPayment,
  };
}

function simulateCreditPayoff(
  currentBalance: number | '',
  debtRate: number | '',
  myPayment: number | '',
): { totalInterest: number; months: number; effectivePayment: number } | null {
  if (currentBalance === '' || myPayment === '') return null;

  const monthlyRate = (debtRate === '' ? 0 : debtRate) / 12 / 100;
  const monthlyInterest = currentBalance * monthlyRate;
  if (myPayment <= monthlyInterest) return null;

  let balance = currentBalance;
  let totalInterest = 0;
  let months = 0;

  while (balance > 0.000001 && months < 600) {
    const interest = balance * monthlyRate;
    const principal = Math.min(myPayment - interest, balance);
    if (principal <= 0) break;
    totalInterest += interest;
    balance -= principal;
    months += 1;
  }

  if (months === 0 || balance > 0.000001) return null;

  return {
    totalInterest,
    months,
    effectivePayment: myPayment,
  };
}

export function AccountFormNew({ existing, onSaved, onCancel }: AccountFormNewProps) {
  const initialKind = existing?.kind === 'crypto' ? 'bank' : (existing?.kind ?? 'bank');
  const initialDebtExpectedPayment = existing?.accountTasks?.find((task) => task.kind === 'transaction-log')?.anticipatedValue ?? '';
  const initialDebtMode: 'loan' | 'credit' = existing?.debtTerm ? 'loan' : 'credit';
  const [activeTab, setActiveTab] = useState('details');
  const [iconKey, setIconKey] = useState<string>(existing?.icon ?? 'finance');
  const [displayName, setDisplayName] = useState(existing?.name ?? '');
  const [balance, setBalance] = useState<number | ''>(existing?.balance ?? '');
  const [debtStartingBalance, setDebtStartingBalance] = useState<number | ''>(existing?.debtStartingBalance ?? '');
  const [debtExpectedPayment, setDebtExpectedPayment] = useState<number | ''>(initialDebtExpectedPayment);
  const [debtMode, setDebtMode] = useState<'loan' | 'credit'>(initialDebtMode);
  const [kind, setKind] = useState<AccountKind>(initialKind);
  const [pendingKind, setPendingKind] = useState<AccountKind | null>(existing ? initialKind : null);
  const [showKindChangeConfirm, setShowKindChangeConfirm] = useState(false);
  const [isKindConfirmed, setIsKindConfirmed] = useState(Boolean(existing));
  const [cryptoTicker, setCryptoTicker] = useState(existing?.cryptoTicker ?? '');
  const [cryptoUnit, setCryptoUnit] = useState<AccountResource['cryptoUnit']>(existing?.cryptoUnit ?? 'whole');
  const [institution, setInstitution] = useState(existing?.institution ?? '');
  const [pullFromAccountId, setPullFromAccountId] = useState(existing?.pullFromAccountId ?? '');
  const [minPaymentPercent, setMinPaymentPercent] = useState<number | ''>(existing?.minPaymentPercent ?? 2);
  const [debtRate, setDebtRate] = useState<number | ''>(existing?.debtRate ?? '');
  const [debtTerm, setDebtTerm] = useState<number | ''>(existing?.debtTerm ?? '');
  const [debtStartDate, setDebtStartDate] = useState(existing?.debtStartDate ?? '');
  const [accountTasks, setAccountTasks] = useState<TaskDraft[]>(
    existing?.accountTasks?.map(toTaskDraft) ?? [makeTransactionLogTask()],
  );
  const [allowanceTasks, setAllowanceTasks] = useState<TaskDraft[]>(
    existing?.allowanceTasks?.map(toTaskDraft) ?? [],
  );
  const [allowanceContactId, setAllowanceContactId] = useState(existing?.allowanceContactId ?? '');
  const [allowanceStartDate, setAllowanceStartDate] = useState(existing?.allowanceStartDate ?? '');
  const [allowanceEndDate, setAllowanceEndDate] = useState(existing?.allowanceEndDate ?? '');
  const [expandedAccountTaskId, setExpandedAccountTaskId] = useState<string | null>(null);
  const [expandedAllowanceTaskId, setExpandedAllowanceTaskId] = useState<string | null>(null);
  const [taskEditorTabs, setTaskEditorTabs] = useState<Record<string, 'schedule' | 'action'>>({});
  const [showAllowanceTaskSources, setShowAllowanceTaskSources] = useState(false);
  const [selectedAllowanceResourceTask, setSelectedAllowanceResourceTask] = useState('');
  const [selectedAllowanceLibraryTask, setSelectedAllowanceLibraryTask] = useState('');
  const [selectedAllowanceUserTemplate, setSelectedAllowanceUserTemplate] = useState('');
  const [album, setAlbum] = useState<AlbumEntry[]>(existing?.album ?? []);
  const [linksCleared, setLinksCleared] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AlbumEntry | null>(null);
  const [isCreatingEntry, setIsCreatingEntry] = useState(false);
  const [executingTaskIds, setExecutingTaskIds] = useState<Record<string, boolean>>({});
  const [taskExecutionDrafts, setTaskExecutionDrafts] = useState<Record<string, Partial<InputFields>>>({});
  const [transactionLogExecuteDrafts, setTransactionLogExecuteDrafts] = useState<Record<string, TransactionLogExecuteDraft>>({});
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [executeCompletionSummary, setExecuteCompletionSummary] = useState<ExecuteCompletionSummary | null>(null);
  const [gtdPushFeedbackTaskId, setGtdPushFeedbackTaskId] = useState<string | null>(null);
  const [isEditingBalance, setIsEditingBalance] = useState(false);
  const [pendingBalance, setPendingBalance] = useState<number | ''>('');

  const resources = useResourceStore((s) => s.resources);
  const setResource = useResourceStore((s) => s.setResource);
  const addResourceLink = useResourceStore((s) => s.addResourceLink);
  const removeResourceLink = useResourceStore((s) => s.removeResourceLink);
  const userTaskTemplates = useScheduleStore((s) => s.taskTemplates);
  const activeEvents = useScheduleStore((s) => s.activeEvents);
  const historyEvents = useScheduleStore((s) => s.historyEvents);
  const scheduleTasks = useScheduleStore((s) => s.tasks);
  const setScheduleTask = useScheduleStore((s) => s.setTask);
  const setActiveEvent = useScheduleStore((s) => s.setActiveEvent);
  const setUser = useUserStore((s) => s.setUser);
  const user = useUserStore((s) => s.user);

  const currentExisting = existing ? (resources[existing.id] as typeof existing | undefined) : undefined;
  const contactOptions = Object.values(resources).filter((resource): resource is ContactResource => resource.type === 'contact');
  const bankAccountOptions = Object.values(resources).filter(
    (resource): resource is AccountResource =>
      resource.type === 'account' && resource.id !== existing?.id && resource.kind === 'bank',
  );
  const inventoryTemplates = mergeInventoryItemTemplates(getUserInventoryItemTemplates(user), undefined);
  const existingResourceTaskOptions = collectExistingResourceTaskOptions(resources, inventoryTemplates, existing?.id);
  const libraryTaskOptions: AllowanceTaskSourceOption[] = getLibraryTemplatePool()
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((template) => ({
      value: template.id ?? template.name,
      label: template.name,
      icon: template.icon || 'task',
      detail: 'Built-in library',
      seed: buildTaskDraftSeed(template.name, template.icon || 'task'),
    }));
  const userTemplateOptions: AllowanceTaskSourceOption[] = getCustomTemplatePool(userTaskTemplates).map(({ ref, template }) => ({
    value: ref,
    label: template.name,
    icon: template.icon || 'task',
    detail: 'User template',
    seed: buildTaskDraftSeed(template.name, template.icon || 'task'),
  }));

  const canSave = displayName.trim().length > 0 && isKindConfirmed && !showKindChangeConfirm;
  const isChangingKind = showKindChangeConfirm;
  const isSelectingKind = !isKindConfirmed || showKindChangeConfirm;
  const supportsPullFrom = kind === 'bill' || kind === 'subscription' || kind === 'debt' || kind === 'allowance';
  const supportsPushTo = kind === 'income';
  const pendingAutoLinkId = pullFromAccountId || undefined;
  const pendingAutoLinkRelationship = AUTO_LINK_RELATIONSHIP_BY_KIND[kind] ?? 'direct transaction';
  const normalizedTicker = (cryptoTicker.trim() || '$').toUpperCase();
  const amountTicker = kind === 'bank' ? normalizedTicker : '$';
  const transactionAmountPrefix = getTransactionAmountPrefix(kind, cryptoTicker);
  const currentBalanceValue = typeof balance === 'number' ? balance : null;
  const isOpeningBalance = currentBalanceValue == null || currentBalanceValue === 0;
  const balanceDifference = pendingBalance === '' ? null : pendingBalance - (currentBalanceValue ?? 0);
  const bankBalancePillLabel = currentBalanceValue == null
    ? 'Set balance'
    : formatBankBalancePill(currentBalanceValue, normalizedTicker, cryptoUnit);
  const debtBalancePillLabel = currentBalanceValue == null
    ? 'Set current balance'
    : formatAmountWithTicker(currentBalanceValue, '$');
  const accountSeedYear = useMemo(() => (
    getYearOfDate(kind === 'debt' ? debtStartDate : kind === 'allowance' ? allowanceStartDate : null)
    ?? getYearOfDate(existing?.createdAt)
    ?? new Date().getFullYear()
  ), [allowanceStartDate, debtStartDate, existing?.createdAt, kind]);
  const amountFieldLabel =
    kind === 'bill' || kind === 'subscription' || kind === 'income'
      ? 'Expected Amount'
      : kind === 'debt'
        ? 'Starting Balance'
        : 'Balance';
  const minimumPayment =
    kind === 'debt'
      ? computeDebtMinimumPayment(debtMode, debtStartingBalance, balance, minPaymentPercent, debtRate, debtTerm)
      : null;
  const debtPayoffSimulation =
    kind === 'debt' && debtMode === 'loan'
      ? simulateDebtPayoff(debtStartingBalance, balance, debtRate, minimumPayment, debtExpectedPayment)
      : null;
  const creditMonthlyRate = (debtRate === '' ? 0 : debtRate) / 12 / 100;
  const creditMonthlyInterest = currentBalanceValue == null ? null : currentBalanceValue * creditMonthlyRate;
  const creditPayoffSimulation =
    kind === 'debt' && debtMode === 'credit'
      ? simulateCreditPayoff(balance, debtRate, debtExpectedPayment)
      : null;
  const estimatedInterest =
    debtMode === 'credit'
      ? creditPayoffSimulation?.totalInterest ?? null
      : debtPayoffSimulation?.totalInterest ?? null;
  const estimatedEndDate = kind === 'debt' && (debtMode === 'credit' ? creditPayoffSimulation : debtPayoffSimulation)
    ? addMonthsToIsoDate(
        debtMode === 'loan' ? (debtStartDate || new Date().toISOString().slice(0, 10)) : new Date().toISOString().slice(0, 10),
        (debtMode === 'credit' ? creditPayoffSimulation : debtPayoffSimulation)?.months ?? 0,
      )
    : null;
  const showCustomPaymentEstimateNote = kind === 'debt' && debtPayoffSimulation?.usingCustomPayment === true;
  const showCreditPaymentWarning =
    kind === 'debt' &&
    debtMode === 'credit' &&
    debtExpectedPayment !== '' &&
    creditMonthlyInterest != null &&
    debtExpectedPayment <= creditMonthlyInterest;

  const transactionLogTask = accountTasks.find((task) => task.kind === 'transaction-log');
  const anyExpandedTaskId = expandedAccountTaskId ?? expandedAllowanceTaskId;
  const hasExpandedTask = anyExpandedTaskId != null;
  const previousActiveTabRef = useRef(activeTab);
  const transactionResourceTaskId =
    existing && transactionLogTask
      ? `resource-task:${existing.id}:account-task:${transactionLogTask.id}`
      : null;
  const showLoggedAmounts = transactionLogTask?.anticipatedValue !== '';

  const transactionCompletions = useMemo(() => {
    if (!transactionResourceTaskId) return [];

    const qaEvents = [...Object.values(activeEvents), ...Object.values(historyEvents)]
      .filter((event): event is QuickActionsEvent => event.eventType === 'quickActions');

    return qaEvents
      .flatMap((event) =>
        event.completions
          .map((completion) => {
            const task = scheduleTasks[completion.taskRef];
            if (!task) return null;
            const resultFields = task.resultFields as Record<string, unknown>;
            if (resultFields.resourceTaskId !== transactionResourceTaskId) return null;
            return {
              key: `${event.id}:${completion.taskRef}:${completion.completedAt}`,
              completedAt: completion.completedAt,
              value: typeof resultFields.value === 'string' ? resultFields.value : '',
              note: typeof resultFields.note === 'string' ? resultFields.note : '',
              amount: typeof resultFields.amount === 'number' ? resultFields.amount : null,
              linkedAccountId: typeof resultFields.linkedAccountId === 'string' ? resultFields.linkedAccountId : null,
              linkedAccountName: typeof resultFields.linkedAccountName === 'string' ? resultFields.linkedAccountName : null,
              linkedAccountIcon: typeof resultFields.linkedAccountIcon === 'string' ? resultFields.linkedAccountIcon : null,
              direction:
                resultFields.direction === 'deposit' || resultFields.direction === 'withdrawal'
                  ? resultFields.direction
                  : null,
            };
          })
          .filter((entry): entry is {
            key: string;
            completedAt: string;
            value: string;
            note: string;
            amount: number | null;
            linkedAccountId: string | null;
            linkedAccountName: string | null;
            linkedAccountIcon: string | null;
            direction: 'deposit' | 'withdrawal' | null;
          } => Boolean(entry)),
      )
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt));
  }, [activeEvents, historyEvents, scheduleTasks, transactionResourceTaskId]);

  useEffect(() => {
    const previousActiveTab = previousActiveTabRef.current;
    previousActiveTabRef.current = activeTab;

    if (previousActiveTab === activeTab || !isChangingKind) return;

    const timeoutId = window.setTimeout(() => {
      setPendingKind(kind);
      setShowKindChangeConfirm(false);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [activeTab, isChangingKind, kind]);

  useEffect(() => {
    if (!['bill', 'subscription', 'income'].includes(kind)) return;

    const timeoutId = window.setTimeout(() => {
      setAccountTasks((prev) => {
        const nextAmount: number | '' = balance === '' ? '' : balance;
        let changed = false;
        const nextTasks = prev.map((task) => {
          if (task.kind !== 'transaction-log' || task.anticipatedValue === nextAmount) {
            return task;
          }

          changed = true;
          return { ...task, anticipatedValue: nextAmount };
        });

        return changed ? nextTasks : prev;
      });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [balance, kind]);

  useEffect(() => {
    if (kind !== 'debt') return;

    const timeoutId = window.setTimeout(() => {
      setAccountTasks((prev) => {
        let changed = false;
        const nextTasks = prev.map((task) => {
          if (task.kind !== 'transaction-log' || task.anticipatedValue === debtExpectedPayment) {
            return task;
          }

          changed = true;
          return { ...task, anticipatedValue: debtExpectedPayment };
        });

        return changed ? nextTasks : prev;
      });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [debtExpectedPayment, kind]);

  useEffect(() => {
    if (!executeCompletionSummary) return undefined;

    const timeoutId = window.setTimeout(() => {
      setExecuteCompletionSummary((current) => (
        current?.taskId === executeCompletionSummary.taskId ? null : current
      ));
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [executeCompletionSummary]);

  useEffect(() => {
    if (!gtdPushFeedbackTaskId) return undefined;

    const timeoutId = window.setTimeout(() => {
      setGtdPushFeedbackTaskId((current) => (current === gtdPushFeedbackTaskId ? null : current));
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [gtdPushFeedbackTaskId]);

  function handleBalanceChange(value: number | '') {
    setBalance(value);
  }

  const handleCancelTaskExecution = useCallback((taskId: string) => {
    setExecutingTaskIds((prev) => ({ ...prev, [taskId]: false }));
    setTransactionLogExecuteDrafts((prev) => {
      if (!(taskId in prev)) return prev;
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  }, []);

  const handleStartTaskExecution = useCallback((task: TaskDraft) => {
    setExecuteCompletionSummary(null);
    if (task.kind === 'transaction-log') {
      setTransactionLogExecuteDrafts((prev) => ({
        ...prev,
        [task.id]: {
          amount: task.anticipatedValue,
          note: '',
        },
      }));
    }

    setExecutingTaskIds((prev) => ({ ...prev, [task.id]: true }));
  }, []);

  const handleTaskExecutionResultChange = useCallback((taskId: string, result: Partial<InputFields>) => {
    setTaskExecutionDrafts((prev) => ({
      ...prev,
      [taskId]: {
        ...prev[taskId],
        ...result,
      },
    }));
  }, []);

  const formatTransactionLogAmountText = useCallback((amount: number) => (
    amount.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  ), []);

  const formatKindAwareAmount = useCallback((accountKind: AccountKind, amount: number, ticker?: string) => (
    `${getTransactionAmountPrefix(accountKind, ticker)}${formatTransactionLogAmountText(amount)}`
  ), [formatTransactionLogAmountText]);

  const awardExecuteWisdomXp = useCallback(() => {
    if (!user) return;

    awardXP(user.system.id, 5, {
      statGroup: 'wisdom',
      source: 'account-task.execute.quickActions',
    });
    awardStat(user.system.id, 'wisdom', 5, 'account-task.execute.quickActions');
  }, [user]);

  const extractExecutionNote = useCallback((result: Partial<InputFields>): string | null => {
    const fields = result as Record<string, unknown>;
    const candidates = ['value', 'note', 'text', 'description', 'comment']
      .map((key) => fields[key]);
    const match = candidates.find((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
    return match?.trim() ?? null;
  }, []);

  const showExecuteCompletionSummary = useCallback((summary: ExecuteCompletionSummary) => {
    setExecuteCompletionSummary(summary);
    setExecutingTaskIds((prev) => ({ ...prev, [summary.taskId]: false }));
  }, []);

  const handleTaskExecutionComplete = useCallback((taskId: string, result: Partial<InputFields>) => {
    const task = [...accountTasks, ...allowanceTasks].find((entry) => entry.id === taskId);
    if (!task) return;

    const now = getAppNowISO();
    const today = getAppDate();
    const qaEventId = `qa-${today}`;
    const existingQaEvent = useScheduleStore.getState().activeEvents[qaEventId];
    const qaEvent: QuickActionsEvent =
      existingQaEvent && 'completions' in existingQaEvent
        ? existingQaEvent
        : {
            id: qaEventId,
            eventType: 'quickActions',
            date: today,
            completions: [],
            xpAwarded: 0,
            sharedCompletions: null,
          };

    setTaskExecutionDrafts((prev) => ({
      ...prev,
      [taskId]: { ...result },
    }));
    const completionTaskId = crypto.randomUUID();
    const completionTask: Task = ({
      id: completionTaskId,
      templateRef: null,
      isUnique: true,
      title: task.name.trim() || 'Untitled account task',
      taskType: normaliseResourceTaskTypeForSave(task.taskType),
      completionState: 'complete',
      completedAt: now,
      resultFields: result ?? {},
      icon: task.icon.trim() || existing?.icon || 'finance',
      resourceRef: existing?.id ?? null,
      attachmentRef: null,
      location: null,
      sharedWith: null,
      questRef: null,
      actRef: null,
      secondaryTag: null,
    } as unknown) as Task;
    setScheduleTask(completionTask);
    setActiveEvent({
      ...qaEvent,
      completions: [...qaEvent.completions, { taskRef: completionTaskId, completedAt: now }],
      xpAwarded: (qaEvent.xpAwarded ?? 0) + 5,
    });
    awardExecuteWisdomXp();
    showExecuteCompletionSummary({
      taskId,
      taskName: task.name.trim() || 'Untitled account task',
      amountText: typeof task.anticipatedValue === 'number'
        ? formatKindAwareAmount(kind, task.anticipatedValue, cryptoTicker)
        : null,
      note: extractExecutionNote(result),
      linkedAccountName: null,
      linkedAccountIcon: null,
    });
  }, [
    accountTasks,
    allowanceTasks,
    awardExecuteWisdomXp,
    cryptoTicker,
    extractExecutionNote,
    formatKindAwareAmount,
    kind,
    setActiveEvent,
    setScheduleTask,
    showExecuteCompletionSummary,
    existing?.icon,
    existing?.id,
  ]);

	  const createTransactionLogCompletionTask = useCallback((
	    account: AccountResource,
	    accountTask: TaskDraft,
	    amount: number,
	    note: string,
	    now: string,
	    resultValue?: string,
	    linkedAccountMeta?: TransactionLogLinkedAccountMeta,
	    newBalance?: number,
	  ): Task => ({
	    id: uuidv4(),
	    templateRef: null,
	    isUnique: true,
	    title: accountTask.name,
	    taskType: 'TEXT',
	    completionState: 'complete',
	    completedAt: now,
	    resultFields: ({
	      resourceTaskId: `resource-task:${account.id}:account-task:${accountTask.id}`,
	      amount,
	      note: resultValue ?? note,
	      value: resultValue ?? note,
	      linkedAccountId: linkedAccountMeta?.linkedAccountId,
	      linkedAccountName: linkedAccountMeta?.linkedAccountName,
	      linkedAccountIcon: linkedAccountMeta?.linkedAccountIcon,
	      direction: linkedAccountMeta?.direction,
	      ...(newBalance != null ? { newBalance } : {}),
	    } as unknown) as Task['resultFields'],
	    attachmentRef: null,
	    resourceRef: account.id,
	    location: null,
	    sharedWith: null,
	    questRef: null,
	    actRef: null,
	      secondaryTag: null,
	    icon: accountTask.icon.trim() || account.icon || 'finance',
	  } as unknown as Task), []);

  const pushTaskToGtd = useCallback((task: TaskDraft) => {
    const latestUser = useUserStore.getState().user ?? user;
    if (!existing || !latestUser || gtdPushFeedbackTaskId === task.id) return;

    const dueDate = getAppDate();
    const resourceTaskId = `resource-task:${existing.id}:account-task:${task.id}`;
    const existingPendingTaskId = latestUser.lists.gtdList.find((taskId) => {
      const existingTask = useScheduleStore.getState().tasks[taskId];
      if (!existingTask || existingTask.completionState !== 'pending') return false;
      const fields = existingTask.resultFields as Record<string, unknown>;
      return fields.resourceTaskId === resourceTaskId && fields.dueDate === dueDate;
    });
    if (existingPendingTaskId) {
      setGtdPushFeedbackTaskId(task.id);
      return;
    }

    const taskType = normaliseResourceTaskTypeForSave(task.taskType);
    const nextTask: Task = {
      id: uuidv4(),
      templateRef: resourceTaskId,
      isUnique: true,
      title: task.name.trim() || 'Untitled account task',
      icon: task.icon?.trim() || undefined,
      taskType,
      completionState: 'pending',
      completedAt: null,
      resultFields: ({
        ...buildTaskInputFields(taskType, task.name.trim(), task.inputFields),
        resourceTaskId,
        dueDate,
        label: task.name.trim() || 'Untitled account task',
      } as unknown) as Task['resultFields'],
      attachmentRef: null,
      resourceRef: existing.id,
      location: null,
      sharedWith: null,
      questRef: null,
      actRef: null,
      secondaryTag: null,
    };

    setScheduleTask(nextTask);
    setUser({
      ...latestUser,
      lists: {
        ...latestUser.lists,
        gtdList: [...new Set([...latestUser.lists.gtdList, nextTask.id])],
      },
    });
    setGtdPushFeedbackTaskId(task.id);
  }, [existing, gtdPushFeedbackTaskId, setScheduleTask, setUser, user]);

  const handleTransactionLogExecuteConfirm = useCallback((task: TaskDraft) => {
    if (!existing || task.kind !== 'transaction-log') return;

    const draft = transactionLogExecuteDrafts[task.id];
    if (!draft || draft.amount === '') return;

    const amount = draft.amount;
    const note = draft.note.trim();
    const now = getAppNowISO();
    const today = getAppDate();
    const qaEventId = `qa-${today}`;
    const persistedExisting = resources[existing.id];
    const currentPersistedBalance =
      persistedExisting?.type === 'account' && typeof persistedExisting.balance === 'number'
        ? persistedExisting.balance
        : (typeof balance === 'number' ? balance : 0);
    const existingQaEvent = useScheduleStore.getState().activeEvents[qaEventId];
    const qaEvent: QuickActionsEvent =
      existingQaEvent && 'completions' in existingQaEvent
        ? existingQaEvent
        : {
            id: qaEventId,
            eventType: 'quickActions',
            date: today,
            completions: [],
            xpAwarded: 0,
            sharedCompletions: null,
          };
    const formattedAmount = formatKindAwareAmount(kind, amount, cryptoTicker);
    const linkedBank = existing.pullFromAccountId
      ? resources[existing.pullFromAccountId]
      : undefined;
    const linkedBankAccount = linkedBank?.type === 'account' && linkedBank.kind === 'bank'
      ? linkedBank
      : null;
    const shouldUpdateLinkedBank = kind !== 'bank' && linkedBankAccount != null;
	    const linkedAccountMeta = linkedBankAccount
	      ? {
	          linkedAccountId: linkedBankAccount.id,
	          linkedAccountName: linkedBankAccount.name,
	          linkedAccountIcon: linkedBankAccount.icon,
	          direction: kind === 'income' ? 'deposit' : 'withdrawal',
	        } satisfies TransactionLogLinkedAccountMeta
	      : undefined;
	    const noLinkedBankText = 'Transaction logged only \u2014 no linked bank account set';
	    let debtPrincipalPortion: number | null = null;
	    let debtInterestPortion: number | null = null;
	    let debtNextBalance: number | null = null;

	    if (kind === 'debt') {
	      const monthlyRate = (existing.debtRate ?? 0) / 12 / 100;
	      const interestPortion = currentPersistedBalance * monthlyRate;
	      const principalPortion = Math.max(0, amount - interestPortion);
      debtPrincipalPortion = principalPortion;
	      debtInterestPortion = interestPortion;
	      debtNextBalance = Math.max(0, currentPersistedBalance - principalPortion);
	    }

	    const currentAccountNextBalance = kind === 'bank'
	      ? currentPersistedBalance + amount
	      : kind === 'debt'
	        ? debtNextBalance
	        : null;

    const currentResultValue = (() => {
      if (kind === 'debt' && debtPrincipalPortion != null && debtInterestPortion != null) {
        const debtSummary = `${formattedAmount} paid \u00B7 Principal: ${formatTransactionLogAmountText(debtPrincipalPortion)} \u00B7 Interest: ${formatTransactionLogAmountText(debtInterestPortion)}`;
        return linkedBankAccount
          ? debtSummary
          : `${debtSummary} \u00B7 ${noLinkedBankText}`;
      }

      if (kind === 'bank') {
        return note || `Transaction logged: ${formattedAmount}`;
      }

      if (linkedBankAccount) {
        return formattedAmount;
      }

      return noLinkedBankText;
    })();
	    const currentCompletedTask = createTransactionLogCompletionTask(
	      existing,
	      task,
	      amount,
	      note,
	      now,
	      currentResultValue,
	      linkedAccountMeta,
	      currentAccountNextBalance ?? undefined,
	    );
    const nextCompletions = [...qaEvent.completions, { taskRef: currentCompletedTask.id, completedAt: now }];

    setScheduleTask(currentCompletedTask);

    if (kind === 'bank') {
      if (persistedExisting?.type === 'account') {
        const nextBalance = currentPersistedBalance + amount;
        setResource({
          ...persistedExisting,
          balance: nextBalance,
          updatedAt: now,
        });
        setBalance(nextBalance);
      }
    } else if (shouldUpdateLinkedBank) {
      const linkedTransactionLogTask = linkedBankAccount.accountTasks?.find((accountTask) => accountTask.kind === 'transaction-log');
      const linkedBankBalance = typeof linkedBankAccount.balance === 'number' ? linkedBankAccount.balance : 0;
      const linkedBankNextBalance = kind === 'income'
        ? linkedBankBalance + amount
        : linkedBankBalance - amount;

      setResource({
        ...linkedBankAccount,
        balance: linkedBankNextBalance,
        updatedAt: now,
      });

      if (linkedTransactionLogTask) {
        const linkedAmountText = formatKindAwareAmount('bank', amount, linkedBankAccount.cryptoTicker);
        const sourceAccountLabel = existing.name;
        const linkedNote = kind === 'income'
          ? `${linkedAmountText} deposited from ${sourceAccountLabel}`
          : `${linkedAmountText} withdrawn for ${sourceAccountLabel}`;
	        const linkedCompletedTask = createTransactionLogCompletionTask(
	          linkedBankAccount,
	          toTaskDraft(linkedTransactionLogTask),
	          amount,
	          linkedNote,
	          now,
	          linkedNote,
	          undefined,
	          linkedBankNextBalance,
	        );
	        setScheduleTask(linkedCompletedTask);
	        nextCompletions.push({ taskRef: linkedCompletedTask.id, completedAt: now });
	      }
    }

    if (kind === 'debt' && persistedExisting?.type === 'account' && debtNextBalance != null) {
      setResource({
        ...persistedExisting,
        balance: debtNextBalance,
        updatedAt: now,
      });
      setBalance(debtNextBalance);
    }

    setActiveEvent({
      ...qaEvent,
      completions: nextCompletions,
      xpAwarded: (qaEvent.xpAwarded ?? 0) + 5,
    });
    awardExecuteWisdomXp();
    showExecuteCompletionSummary({
      taskId: task.id,
      taskName: task.name.trim() || 'Untitled account task',
      amountText: formatKindAwareAmount(kind, amount, cryptoTicker),
      note: note || null,
      linkedAccountName: linkedAccountMeta?.linkedAccountName ?? null,
      linkedAccountIcon: linkedAccountMeta?.linkedAccountIcon ?? null,
    });
  }, [
    awardExecuteWisdomXp,
    balance,
    createTransactionLogCompletionTask,
    cryptoTicker,
    existing,
    formatKindAwareAmount,
    formatTransactionLogAmountText,
    kind,
    resources,
    setActiveEvent,
    setResource,
    setScheduleTask,
    showExecuteCompletionSummary,
    transactionLogExecuteDrafts,
  ]);

  function createBalanceTransactionLogEntry(
    nextBalance: number,
    difference: number,
    options?: { resultValue?: string; transactionAmount?: number },
  ) {
    if (!existing || !transactionLogTask) return;

    const now = new Date().toISOString();
    const date = now.slice(0, 10);
    const qaEventId = `qa-${date}`;
    const existingQaEvent = activeEvents[qaEventId];
    const qaEvent: QuickActionsEvent =
      existingQaEvent && 'completions' in existingQaEvent
        ? existingQaEvent
        : {
            id: qaEventId,
            eventType: 'quickActions',
            date,
            completions: [],
            xpAwarded: 0,
            sharedCompletions: null,
          };
    const taskId = uuidv4();
    const transactionAmount = options?.transactionAmount ?? (isOpeningBalance ? nextBalance : difference);
    const resultValue = options?.resultValue ?? (isOpeningBalance
      ? `Opening balance set to ${formatBankBalancePill(nextBalance, normalizedTicker, cryptoUnit)}`
      : `Balance adjusted: ${formatBankBalanceAdjustment(difference, normalizedTicker, cryptoUnit)}`);
	    const completedTask: Task = {
	      id: taskId,
	      templateRef: null,
	      isUnique: true,
	      title: transactionLogTask.name,
      taskType: 'TEXT',
      completionState: 'complete',
      completedAt: now,
	      resultFields: ({
	        resourceTaskId: `resource-task:${existing.id}:account-task:${transactionLogTask.id}`,
	        value: resultValue,
	        amount: transactionAmount,
	        newBalance: nextBalance,
	      } as unknown) as Task['resultFields'],
	      attachmentRef: null,
	      resourceRef: existing.id,
	      location: null,
	      sharedWith: null,
	      questRef: null,
	      actRef: null,
	      secondaryTag: null,
	      icon: transactionLogTask.icon.trim() || existing.icon || 'finance',
	    } as unknown as Task;

    setScheduleTask(completedTask);
    setActiveEvent({
      ...qaEvent,
      completions: [...qaEvent.completions, { taskRef: taskId, completedAt: now }],
    });
  }

  function handleStartBalanceEdit() {
    setPendingBalance(balance === '' ? '' : balance);
    setIsEditingBalance(true);
  }

  function handleStartDebtBalanceEdit() {
    setPendingBalance(balance === '' ? '' : balance);
    setIsEditingBalance(true);
  }

  function handleCancelBalanceEdit() {
    setPendingBalance('');
    setIsEditingBalance(false);
  }

  function handleConfirmBalanceEdit() {
    if (pendingBalance === '') return;

    if (kind === 'debt') {
      const nextBalance = pendingBalance;
      const difference = nextBalance - (currentBalanceValue ?? 0);

      setBalance(nextBalance);

      if (existing) {
        const now = new Date().toISOString();
        const persistedExisting = resources[existing.id];
        if (persistedExisting?.type === 'account') {
          setResource({
            ...persistedExisting,
            balance: nextBalance,
            updatedAt: now,
          });
        }

        if (difference !== 0 || isOpeningBalance) {
          const signedDifference = `${difference > 0 ? '+' : difference < 0 ? '-' : ''}${formatTransactionLogAmountText(Math.abs(difference))}`;
          const resultValue = isOpeningBalance
            ? `Balance adjusted: ${formatTransactionLogAmountText(nextBalance)}`
            : `Balance adjusted: ${signedDifference}`;
          createBalanceTransactionLogEntry(nextBalance, difference, {
            resultValue,
            transactionAmount: difference,
          });
        }
      }

      setPendingBalance('');
      setIsEditingBalance(false);
      return;
    }

    const nextBalance = pendingBalance;
    const difference = nextBalance - (currentBalanceValue ?? 0);
    setBalance(nextBalance);

    if (existing) {
      const now = new Date().toISOString();
      const persistedExisting = resources[existing.id];
      if (persistedExisting?.type === 'account') {
        setResource({
          ...persistedExisting,
          balance: nextBalance,
          updatedAt: now,
        });
      }

      if (difference !== 0 || isOpeningBalance) {
        createBalanceTransactionLogEntry(nextBalance, difference);
      }
    }

    setPendingBalance('');
    setIsEditingBalance(false);
  }

  function resetKindSpecificFields(nextKind: AccountKind) {
    const transactionLog = accountTasks.find((task) => task.kind === 'transaction-log');
    setKind(nextKind);
    setPendingKind(nextKind);
    setIsKindConfirmed(true);
    setBalance('');
    setDebtStartingBalance('');
    setDebtExpectedPayment('');
    setDebtMode(nextKind === 'debt' ? 'credit' : initialDebtMode);
    setMinPaymentPercent(2);
    setCryptoTicker('');
    setCryptoUnit('whole');
    setInstitution('');
    setPullFromAccountId('');
    setDebtRate('');
    setDebtTerm('');
    setDebtStartDate('');
    setAllowanceContactId('');
    setAllowanceStartDate('');
    setAllowanceEndDate('');
    setAccountTasks(transactionLog ? [transactionLog] : [makeTransactionLogTask()]);
    setAllowanceTasks([]);
    setExpandedAccountTaskId(null);
    setExpandedAllowanceTaskId(null);
    setShowAllowanceTaskSources(false);
    setSelectedAllowanceResourceTask('');
    setSelectedAllowanceLibraryTask('');
    setSelectedAllowanceUserTemplate('');
    setLinksCleared(true);
    setShowKindChangeConfirm(false);
  }

  function renderKindButtons(selectedKind: AccountKind, onSelect: (value: AccountKind) => void) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {KIND_OPTIONS.map((opt) => {
          const isSelected = selectedKind === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              className={`${KIND_BUTTON_CLS} ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-200'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:text-blue-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-blue-400 dark:hover:text-blue-200'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

  function addTask(section: 'account' | 'allowance') {
    const nextTask = makeBlankTaskDraft();
    if (section === 'account') {
      setAccountTasks((prev) => [...prev, nextTask]);
      setExpandedAccountTaskId(nextTask.id);
      setExpandedAllowanceTaskId(null);
      return;
    }
    setAllowanceTasks((prev) => [...prev, nextTask]);
    setExpandedAccountTaskId(null);
    setExpandedAllowanceTaskId(nextTask.id);
  }

  function addAllowanceTaskFromOption(option: AllowanceTaskSourceOption) {
    const nextTask = makeTaskDraftFromSeed(option.seed);
    setAllowanceTasks((prev) => [...prev, nextTask]);
    setExpandedAccountTaskId(null);
    setExpandedAllowanceTaskId(nextTask.id);
    setTaskEditorTabs((prev) => ({ ...prev, [nextTask.id]: 'action' }));
    setShowAllowanceTaskSources(false);
  }

  function addAllowanceTaskFromSelection(
    optionValue: string,
    options: AllowanceTaskSourceOption[],
    clearSelection: (value: string) => void,
  ) {
    const option = options.find((entry) => entry.value === optionValue);
    if (!option) return;
    addAllowanceTaskFromOption(option);
    clearSelection('');
  }

  function updateTask(
    section: 'account' | 'allowance',
    id: string,
    field: keyof TaskDraft,
    value: string | number | boolean | ResourceRecurrenceRule | Partial<InputFields>,
  ) {
    const setTasks = section === 'account' ? setAccountTasks : setAllowanceTasks;
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id) return task;
        const nextTask = { ...task, [field]: value };
        if (field === 'taskType' && typeof value === 'string') {
          nextTask.inputFields = buildTaskInputFields(value, nextTask.name.trim());
        }
        if (field === 'name' && typeof value === 'string') {
          nextTask.inputFields = buildTaskInputFields(nextTask.taskType ?? 'CHECK', value.trim(), nextTask.inputFields);
        }
        return nextTask;
      }),
    );
  }

  function removeTask(section: 'account' | 'allowance', id: string) {
    const tasks = section === 'account' ? accountTasks : allowanceTasks;
    const taskToRemove = tasks.find((task) => task.id === id);
    if (section === 'account' && taskToRemove?.kind === 'transaction-log') return;

    const setTasks = section === 'account' ? setAccountTasks : setAllowanceTasks;
    const setExpandedTaskId = section === 'account' ? setExpandedAccountTaskId : setExpandedAllowanceTaskId;
    setTasks((prev) => prev.filter((task) => task.id !== id));
    setExpandedTaskId((prev) => (prev === id ? null : prev));
    setTaskEditorTabs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setConfirmingRemove(false);
    setExecuteCompletionSummary(null);
    setGtdPushFeedbackTaskId((current) => (current === id ? null : current));
  }

  function setExpandedTask(section: 'account' | 'allowance', id: string | null) {
    setConfirmingRemove(false);
    setExecuteCompletionSummary(null);
    setGtdPushFeedbackTaskId(null);
    if (section === 'account') {
      setExpandedAccountTaskId(id);
      setExpandedAllowanceTaskId(null);
      return;
    }
    setExpandedAllowanceTaskId(id);
    setExpandedAccountTaskId(null);
  }

  function renderTaskTabButton(taskId: string, tab: 'schedule' | 'action', label: string, activeTabKey: 'schedule' | 'action') {
    return (
      <button
        type="button"
        onClick={() => {
          setConfirmingRemove(false);
          setExecuteCompletionSummary(null);
          setTaskEditorTabs((prev) => ({ ...prev, [taskId]: tab }));
        }}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
          activeTabKey === tab
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
        }`}
      >
        {label}
      </button>
      );
  }

  function updateTaskRecurrence(
    section: 'account' | 'allowance',
    id: string,
    patch: Partial<ResourceRecurrenceRule>,
  ) {
    const tasks = section === 'account' ? accountTasks : allowanceTasks;
    const task = tasks.find((entry) => entry.id === id);
    if (!task) return;

    updateTask(section, id, 'recurrence', {
      ...task.recurrence,
      ...patch,
    });
  }

  function toggleTaskDay(
    section: 'account' | 'allowance',
    id: string,
    day: RecurrenceDayOfWeek,
  ) {
    const tasks = section === 'account' ? accountTasks : allowanceTasks;
    const task = tasks.find((entry) => entry.id === id);
    if (!task) return;

    const days = task.recurrence.days.includes(day)
      ? task.recurrence.days.filter((entry) => entry !== day)
      : [...task.recurrence.days, day].filter((entry, index, arr) => arr.indexOf(entry) === index);

    updateTaskRecurrence(section, id, { days });
  }

  function handleAddEntry() {
    setIsCreatingEntry(true);
    setEditingEntry(null);
  }

  function handleEditEntry(entry: AlbumEntry) {
    setIsCreatingEntry(false);
    setEditingEntry(entry);
  }

  function handleDeleteEntry(entryId: string) {
    setAlbum((prev) => prev.filter((entry) => entry.id !== entryId));
  }

  function handleSaveEntry(next: AlbumEntry) {
    if (isCreatingEntry) {
      setAlbum((prev) => [...prev, next]);
    } else if (editingEntry) {
      setAlbum((prev) => prev.map((entry) => (entry.id === next.id ? next : entry)));
    }

    setIsCreatingEntry(false);
    setEditingEntry(null);
  }

  function handleCancelEntry() {
    setIsCreatingEntry(false);
    setEditingEntry(null);
  }

  function renderTaskSection(
    section: 'account' | 'allowance',
    title: string,
    actionLabel: string,
    onAddTask?: () => void,
  ) {
    const hideAccountCustomTasks = section === 'account' && kind === 'allowance';
    const disableTransactionExpand = section === 'account' && kind === 'allowance';
    const tasks = section === 'account' ? accountTasks : allowanceTasks;
    const expandedTaskId = section === 'account' ? expandedAccountTaskId : expandedAllowanceTaskId;
    const transactionTask = section === 'account' ? tasks.find((task) => task.kind === 'transaction-log') ?? null : null;
    const customTasks = section === 'account' ? tasks.filter((task) => task.kind !== 'transaction-log') : tasks;
    const visibleTransactionTask = hasExpandedTask ? (expandedTaskId && transactionTask?.id === expandedTaskId ? transactionTask : null) : transactionTask;
    const visibleCustomTasks = hideAccountCustomTasks
      ? []
      : hasExpandedTask
        ? customTasks.filter((task) => task.id === expandedTaskId)
        : customTasks;

    const renderCollapsedRow = (task: TaskDraft, labelMode: 'transaction' | 'custom') => {
      const isDisabledTransactionRow = labelMode === 'transaction' && disableTransactionExpand;
      const rowClassName = 'flex w-full items-center gap-3 rounded-xl bg-gray-50 px-3 py-3 text-left dark:bg-gray-700';
      const content = (
        <div className="shrink-0">
          <IconDisplay iconKey={task.icon?.trim() || 'finance'} size={40} className="h-10 w-10 object-contain" alt="" />
        </div>
      );
      const details = (
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {task.name.trim() || 'Untitled account task'}
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="truncate">
              {labelMode === 'transaction'
                ? task.anticipatedValue !== ''
                  ? `${transactionAmountPrefix}${Math.round(task.anticipatedValue).toLocaleString()}`
                  : `${transactionAmountPrefix}0`
                : describeCollapsedTaskRecurrence(task)}
            </span>
            {task.reminderLeadDays > -1 ? (
              <span className="shrink-0 text-sm leading-none">{'\u{1F514}'}</span>
            ) : null}
          </div>
        </div>
      );

      if (isDisabledTransactionRow) {
        return (
          <div className={rowClassName}>
            {content}
            {details}
          </div>
        );
      }

      return (
        <button
          type="button"
          onClick={() => setExpandedTask(section, task.id)}
          className={rowClassName}
        >
          {content}
          {details}
        </button>
      );
    };

    const renderExpandedTask = (task: TaskDraft) => {
      const isTransactionLog = section === 'account' && task.kind === 'transaction-log';
      const activeEditorTab = taskEditorTabs[task.id] ?? 'schedule';
      const selectedTaskType = normalizeResourceDraftTaskType(task.taskType);
      const taskInputFields = buildTaskInputFields(selectedTaskType, task.name.trim(), task.inputFields);
      const sendToGtd = task.reminderLeadDays >= 0;
      const isPeriodic = normalizeRecurrenceMode(task.recurrenceMode) === 'recurring';
      const isExecutingTask = executingTaskIds[task.id] === true;
      const completionSummaryForTask = executeCompletionSummary?.taskId === task.id ? executeCompletionSummary : null;
      const isShowingCompletionSummary = completionSummaryForTask != null;
      const isShowingGtdPushFeedback = gtdPushFeedbackTaskId === task.id;
      const transactionLogExecuteDraft = transactionLogExecuteDrafts[task.id] ?? {
        amount: task.anticipatedValue,
        note: '',
      };
      const transactionLogAmountLabel = task.anticipatedValue === ''
        ? `${transactionAmountPrefix}0`
        : `${transactionAmountPrefix}${Number(task.anticipatedValue).toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        })}`;
      const executionTemplate: TaskTemplate = {
        name: task.name.trim() || 'Untitled account task',
        description: '',
        icon: task.icon?.trim() || 'finance',
        taskType: selectedTaskType === 'USE' ? 'TEXT' : selectedTaskType,
        inputFields: taskInputFields as TaskTemplate['inputFields'],
        xpAward: { health: 0, strength: 0, agility: 0, defense: 0, charisma: 0, wisdom: 0 },
        cooldown: null,
        media: null,
        items: [],
        secondaryTag: null,
      };
      const executionTask: Task = {
        id: `account-task-preview:${task.id}`,
        templateRef: null,
        isUnique: true,
        title: task.name.trim() || 'Untitled account task',
        taskType: executionTemplate.taskType,
        completionState: 'pending',
        completedAt: null,
        resultFields: taskExecutionDrafts[task.id] ?? {},
        attachmentRef: null,
        resourceRef: existing?.id ?? null,
        location: null,
        sharedWith: null,
        questRef: null,
        actRef: null,
        secondaryTag: null,
      };

      const updateTaskInputFields = (draftTask: TaskDraft, fields: Partial<InputFields>) => {
        updateTask(section, task.id, 'inputFields', {
          ...buildTaskInputFields(selectedTaskType, draftTask.name.trim(), draftTask.inputFields),
          ...fields,
        });
      };

      return (
        <div key={task.id} className="flex h-full flex-1 flex-col rounded-xl bg-gray-50 dark:bg-gray-700">
          <div className="shrink-0 space-y-3 px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <IconPicker
                  value={task.icon?.trim() || 'finance'}
                  onChange={(value) => updateTask(section, task.id, 'icon', value)}
                />
                {isTransactionLog ? (
                  <div className="min-w-0 text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {task.name.trim() || 'Untitled account task'}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={task.name}
                    onChange={(event) => updateTask(section, task.id, 'name', event.target.value)}
                    placeholder="Task name"
                    className={`${SELECT_CLS} min-w-0 flex-1`}
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setConfirmingRemove(false);
                  setExpandedTask(section, null);
                }}
                className="rounded-md px-2 py-1 text-sm font-semibold text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-600 dark:hover:text-gray-200"
                aria-label="Close task editor"
              >
                ×
              </button>
            </div>
            <div className="flex items-center gap-2">
              {renderTaskTabButton(task.id, 'schedule', 'Schedule', activeEditorTab)}
              {renderTaskTabButton(task.id, 'action', 'Action', activeEditorTab)}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="space-y-4">
              {isShowingCompletionSummary ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 dark:border-emerald-800 dark:bg-emerald-950/40">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                    <span className="text-lg leading-none">✓</span>
                    <span className="text-sm font-semibold">Success</span>
                  </div>
                  <div className="mt-3 text-base font-semibold text-gray-900 dark:text-gray-100">
                    {completionSummaryForTask.taskName}
                  </div>
                  {completionSummaryForTask.amountText ? (
                    <div className="mt-2 text-sm text-gray-700 dark:text-gray-200">
                      {completionSummaryForTask.amountText}
                    </div>
                  ) : null}
                  {completionSummaryForTask.note ? (
                    <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                      {completionSummaryForTask.note}
                    </div>
                  ) : null}
                  {completionSummaryForTask.linkedAccountName && completionSummaryForTask.linkedAccountIcon ? (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                      <IconDisplay
                        iconKey={completionSummaryForTask.linkedAccountIcon}
                        size={16}
                        className="h-4 w-4 object-contain"
                        alt=""
                      />
                      <span>{completionSummaryForTask.linkedAccountName}</span>
                    </div>
                  ) : null}
                  <div className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    XP awarded: +5 Wisdom
                  </div>
                </div>
              ) : activeEditorTab === 'schedule' ? (
                <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
                        <button
                          type="button"
                          onClick={() => updateTask(section, task.id, 'recurrenceMode', 'recurring')}
                          className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                            isPeriodic
                              ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                              : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
                          }`}
                        >
                          Periodic
                        </button>
                        <button
                          type="button"
                          onClick={() => updateTask(section, task.id, 'recurrenceMode', 'never')}
                          className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                            !isPeriodic
                              ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                              : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
                          }`}
                        >
                          On Demand
                        </button>
                      </div>

                      {isPeriodic ? (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Frequency</label>
                              <select
                                value={task.recurrence.frequency}
                                onChange={(event) =>
                                  updateTaskRecurrence(section, task.id, {
                                    frequency: event.target.value as ResourceRecurrenceRule['frequency'],
                                    days: event.target.value === 'weekly' ? task.recurrence.days : [],
                                    monthlyDay:
                                      event.target.value === 'monthly'
                                        ? (task.recurrence.monthlyDay ?? getDayOfMonth(task.recurrence.seedDate))
                                        : null,
                                  })
                                }
                                className={SELECT_CLS}
                              >
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                                <option value="yearly">Yearly</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Interval</label>
                              <input
                                type="number"
                                min={1}
                                max={99}
                                value={task.recurrence.interval}
                                onChange={(event) => updateTaskRecurrence(section, task.id, { interval: Math.max(1, Number(event.target.value) || 1) })}
                                className={SELECT_CLS}
                              />
                            </div>
                          </div>

                          {task.recurrence.frequency === 'weekly' ? (
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Days</label>
                              <div className="flex flex-wrap gap-1.5">
                                {DOW_LABELS.map(({ key, label }) => (
                                  <button
                                    key={key}
                                    type="button"
                                    onClick={() => toggleTaskDay(section, task.id, key)}
                                    className={`h-8 min-w-8 rounded-md px-2 text-xs font-medium transition-colors ${
                                      task.recurrence.days.includes(key)
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                                    }`}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Start Date</label>
                              <input
                                type="date"
                                value={task.recurrence.seedDate}
                                onChange={(event) =>
                                  updateTaskRecurrence(section, task.id, {
                                    seedDate: event.target.value,
                                    monthlyDay:
                                      task.recurrence.frequency === 'monthly'
                                        ? (task.recurrence.monthlyDay ?? getDayOfMonth(event.target.value))
                                        : task.recurrence.monthlyDay,
                                  })
                                }
                                className={SELECT_CLS}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">End Date</label>
                              <input
                                type="date"
                                value={task.recurrence.endsOn ?? ''}
                                onChange={(event) => updateTaskRecurrence(section, task.id, { endsOn: event.target.value || null })}
                                className={SELECT_CLS}
                              />
                            </div>
                          </div>

                          <div className="space-y-3 rounded-xl border border-gray-200 bg-white px-3 py-3 dark:border-gray-600 dark:bg-gray-800/70">
                            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                              <input
                                type="checkbox"
                                checked={sendToGtd}
                                onChange={(event) => updateTask(section, task.id, 'reminderLeadDays', event.target.checked ? Math.max(0, task.reminderLeadDays) : -1)}
                                className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 dark:border-gray-500"
                              />
                              <span>Send to GTD list</span>
                            </label>

                            {sendToGtd ? (
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Days before (0 = on the day)</label>
                                <input
                                  type="number"
                                  min={0}
                                  max={365}
                                  value={Math.max(0, task.reminderLeadDays)}
                                  onChange={(event) => updateTask(section, task.id, 'reminderLeadDays', Math.max(0, Number(event.target.value) || 0))}
                                  className={`w-24 ${SMALL_INPUT_CLS}`}
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">Available to execute in Resource and Task Room</p>
                      )}
                </div>
              ) : (
                <div className="space-y-4">
                  {isExecutingTask ? (
                    isTransactionLog ? (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Amount</label>
                          <div className="flex items-center rounded-md border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-800">
                            <span className="shrink-0 pr-2 text-sm text-gray-500 dark:text-gray-400">{transactionAmountPrefix}</span>
                            <input
                              type="number"
                              min={0}
                              step={kind === 'bank' && cryptoUnit === 'sats' ? 1 : 0.01}
                              value={transactionLogExecuteDraft.amount}
                              onChange={(event) => setTransactionLogExecuteDrafts((prev) => ({
                                ...prev,
                                [task.id]: {
                                  ...transactionLogExecuteDraft,
                                  amount: event.target.value === '' ? '' : Number(event.target.value),
                                },
                              }))}
                              placeholder="0.00"
                              className="w-full bg-transparent py-2 text-sm text-gray-900 focus:outline-none dark:text-gray-100"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Note (optional)</label>
                          <input
                            type="text"
                            value={transactionLogExecuteDraft.note}
                            onChange={(event) => setTransactionLogExecuteDrafts((prev) => ({
                              ...prev,
                              [task.id]: {
                                ...transactionLogExecuteDraft,
                                note: event.target.value,
                              },
                            }))}
                            placeholder="Add a note"
                            className={SELECT_CLS}
                          />
                        </div>

                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleCancelTaskExecution(task.id)}
                            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTransactionLogExecuteConfirm(task)}
                            disabled={transactionLogExecuteDraft.amount === ''}
                            className="rounded-md bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Confirm
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <ExecuteTaskInput
                          taskId={task.id}
                          executionTemplate={executionTemplate}
                          executionTask={executionTask}
                          onCompleteTask={handleTaskExecutionComplete}
                          onResultChangeTask={handleTaskExecutionResultChange}
                        />
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleCancelTaskExecution(task.id)}
                            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )
                  ) : (
                    isTransactionLog ? (
                      <>
                        <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-600 dark:bg-gray-800/40">
                          <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 dark:bg-gray-800/70">
                            <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Task Type</span>
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Transaction Log</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 dark:bg-gray-800/70">
                            <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Amount</span>
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{transactionLogAmountLabel}</span>
                          </div>
                        </div>

                      </>
                    ) : (
                      <>
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Configure task parameters</div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Task Type</label>
                          <select
                            value={selectedTaskType}
                            onChange={(event) => updateTask(section, task.id, 'taskType', event.target.value)}
                            className={SELECT_CLS}
                          >
                            {RESOURCE_TASK_TYPE_OPTIONS.map((taskType) => (
                              <option key={taskType.value} value={taskType.value}>{taskType.label}</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-600 dark:bg-gray-800/40">
                          <TaskTypeConfigEditor
                            taskType={task.taskType ?? 'CHECK'}
                            inputFields={task.inputFields ?? {}}
                            onChange={(fields) => updateTaskInputFields(task, fields)}
                          />
                        </div>
                      </>
                    )
                  )}

                  {section === 'allowance' ? (
                    <label className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                      <input
                        type="checkbox"
                        checked={task.evidenceRequired === true}
                        onChange={(event) => updateTask(section, task.id, 'evidenceRequired', event.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 dark:border-gray-500"
                      />
                      <span>Require photo evidence on completion</span>
                    </label>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="sticky bottom-0 mt-auto flex items-start justify-between gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-600 dark:bg-gray-700">
            {isTransactionLog ? <span /> : (
              <button
                type="button"
                onClick={() => {
                  if (confirmingRemove) {
                    removeTask(section, task.id);
                    return;
                  }
                  setConfirmingRemove(true);
                }}
                className={`text-xs font-medium ${
                  confirmingRemove
                    ? 'text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300'
                    : 'text-gray-400 hover:text-red-400'
                }`}
              >
                {confirmingRemove ? 'Confirm remove?' : 'Remove'}
              </button>
            )}
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                {activeEditorTab === 'action' && !isExecutingTask && !isShowingCompletionSummary ? (
                  <>
                    <button
                      type="button"
                      onClick={() => pushTaskToGtd(task)}
                      disabled={isShowingGtdPushFeedback}
                      className="rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-200 disabled:text-gray-500 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800 dark:disabled:border-gray-700 dark:disabled:bg-gray-800 dark:disabled:text-gray-500"
                    >
                      Push to GTD
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartTaskExecution(task)}
                      className="rounded-md bg-blue-500 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600"
                    >
                      Execute
                    </button>
                  </>
                ) : isShowingCompletionSummary ? (
                  <button
                    type="button"
                    onClick={() => setExecuteCompletionSummary(null)}
                    className="rounded-md bg-blue-500 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600"
                  >
                    Done
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingRemove(false);
                      setExpandedTask(section, null);
                    }}
                    className="rounded-md bg-blue-500 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600"
                  >
                    Save
                  </button>
                )}
              </div>
              {activeEditorTab === 'action' && isShowingGtdPushFeedback ? (
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-300">
                  Added to GTD list
                </span>
              ) : null}
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="flex flex-1 flex-col gap-3">
        {!hasExpandedTask && section === 'account' && visibleTransactionTask ? (
          <>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Transaction Log</div>
            {renderCollapsedRow(visibleTransactionTask, 'transaction')}
          </>
        ) : null}

        {!hasExpandedTask && !hideAccountCustomTasks ? (
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {section === 'account' ? title : title}
            </span>
            <button
              type="button"
              onClick={onAddTask ?? (() => addTask(section))}
              className="text-xs font-medium text-blue-500 hover:text-blue-600"
            >
              {actionLabel}
            </button>
          </div>
        ) : null}

        {visibleCustomTasks.map((task) => (
          <Fragment key={task.id}>
            {expandedTaskId === task.id
              ? renderExpandedTask(task)
              : renderCollapsedRow(task, 'custom')}
          </Fragment>
        ))}

        {visibleTransactionTask && expandedTaskId === visibleTransactionTask.id ? renderExpandedTask(visibleTransactionTask) : null}
      </div>
    );
  }

  function handleSave() {
    if (!canSave) return;

    const finalTasks = finaliseTaskDrafts(accountTasks, true, accountSeedYear);
    const finalAllowanceTasks = finaliseTaskDrafts(allowanceTasks, false, accountSeedYear);
    const trimmedAlbum = album.length > 0 ? album : undefined;

    const now = new Date().toISOString();
    const shouldSyncAutoLink = supportsPullFrom || supportsPushTo;
    const autoLinkTargetId = shouldSyncAutoLink ? pullFromAccountId.trim() : '';
    const accountToAccountDefaultRelationship = getRelationshipOptions('account', 'account')[0] ?? 'sub-account';
    const autoLinkRelationship = AUTO_LINK_RELATIONSHIP_BY_KIND[kind]
      ?? accountToAccountDefaultRelationship;
    const resource: AccountResource = {
      id: existing?.id ?? uuidv4(),
      type: 'account',
      icon: iconKey,
      name: displayName.trim(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      kind,
      institution: institution.trim() || undefined,
      balance: balance === '' ? undefined : balance,
      cryptoUnit: kind === 'bank' ? cryptoUnit : undefined,
      cryptoTicker: kind === 'bank' ? (cryptoTicker.trim().toUpperCase() || undefined) : undefined,
      pullFromAccountId: supportsPullFrom || supportsPushTo ? (pullFromAccountId || undefined) : undefined,
      debtStartingBalance: kind === 'debt' && debtStartingBalance !== '' ? debtStartingBalance : undefined,
      minPaymentPercent: kind === 'debt' && debtMode === 'credit'
        ? (minPaymentPercent === '' ? 2 : minPaymentPercent)
        : undefined,
      debtRate: kind === 'debt' && debtRate !== '' ? debtRate : undefined,
      debtTerm: kind === 'debt' && debtMode === 'loan' && debtTerm !== '' ? debtTerm : undefined,
      debtStartDate: kind === 'debt' && debtMode === 'loan' ? (debtStartDate || undefined) : undefined,
      allowanceStartDate: kind === 'allowance' ? (allowanceStartDate || undefined) : undefined,
      allowanceEndDate: kind === 'allowance' ? (allowanceEndDate || undefined) : undefined,
      dueDate: undefined,
      dueDateLeadDays: undefined,
      pendingTransactions: existing?.pendingTransactions ?? [],
      accountTasks: finalTasks,
      allowanceTasks: kind === 'allowance' && finalAllowanceTasks.length > 0 ? finalAllowanceTasks : undefined,
      allowanceContactId: kind === 'allowance' ? (allowanceContactId || undefined) : undefined,
      album: trimmedAlbum,
      notes: currentExisting?.notes ?? existing?.notes,
      links: linksCleared ? undefined : (currentExisting?.links ?? existing?.links),
      linkedHomeId: existing?.linkedHomeId,
      linkedContactId: existing?.linkedContactId,
      linkedAccountId: existing?.linkedAccountId,
      sharedWith: existing?.sharedWith ?? null,
    };

    setResource(resource);

    const { resources: latestResources } = useResourceStore.getState();
    const persistedResource = latestResources[resource.id];
    const existingAutoLinks = (persistedResource?.links ?? []).filter((link) => {
      const target = latestResources[link.targetResourceId];
      return (
        target?.type === 'account' &&
        (link.isPullLink === true || AUTO_LINK_RELATIONSHIPS.has(link.relationship))
      );
    });

    for (const link of existingAutoLinks) {
      removeResourceLink(resource.id, link.id);
    }

    if (shouldSyncAutoLink && autoLinkTargetId) {
      addResourceLink(resource.id, autoLinkTargetId, autoLinkRelationship, { isPullLink: true });
    }

    if (!existing && user) {
      setUser({
        ...user,
        resources: {
          ...user.resources,
          accounts: user.resources.accounts.includes(resource.id)
            ? user.resources.accounts
            : [...user.resources.accounts, resource.id],
        },
      });
    }

    generateGTDItems(resource);
    onSaved();
  }

  return (
    <ResourceFormShell
      title={existing ? 'Edit Account' : 'New Account'}
      onSave={handleSave}
      onCancel={onCancel}
      resourceIcon={iconKey}
      resourceName={displayName}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(nextTab) => {
        setConfirmingRemove(false);
        setExecuteCompletionSummary(null);
        setActiveTab(nextTab);
      }}
      isSaving={!canSave}
      hideChrome={hasExpandedTask}
    >
      {activeTab === 'details' ? (
        <div className="space-y-3 px-4 py-3">
          <div className="flex flex-row items-center gap-2">
            <div className="shrink-0">
              <IconPicker value={iconKey} onChange={setIconKey} />
            </div>
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="e.g. Checking Account"
              maxLength={100}
              className={`${SELECT_CLS} flex-1 min-w-0`}
            />
          </div>
          {isSelectingKind ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Kind</label>
                {renderKindButtons((pendingKind ?? kind) as AccountKind, (value) => setPendingKind(value))}
              </div>

              {!isKindConfirmed && pendingKind ? (
                <button
                  type="button"
                  onClick={() => {
                    setKind(pendingKind);
                    setIsKindConfirmed(true);
                  }}
                  className="rounded-md bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-600"
                >
                  Set
                </button>
              ) : null}

              {isChangingKind ? (
                <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-3 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                  <p>Changing type clears Details, Tasks and Links. Album and Log are preserved.</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (pendingKind && pendingKind !== kind) {
                          resetKindSpecificFields(pendingKind);
                        }
                      }}
                      disabled={!pendingKind || pendingKind === kind}
                      className="rounded-md bg-amber-500 px-3 py-1.5 font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingKind(kind);
                        setShowKindChangeConfirm(false);
                      }}
                      className="rounded-md border border-gray-300 px-3 py-1.5 font-semibold text-gray-700 hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              {(kind === 'bank' || kind === 'debt') && isEditingBalance ? (
                <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-600 dark:bg-gray-800/70">
                  <NumberInput
                    label="New Balance"
                    value={pendingBalance}
                    onChange={setPendingBalance}
                    placeholder="0.00"
                    step={kind === 'bank' && cryptoUnit === 'sats' ? 1 : 0.01}
                  />
                  <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                    {pendingBalance === '' ? 'Enter a balance' : (
                      kind === 'debt'
                        ? `${formatAmountWithTicker(pendingBalance - (currentBalanceValue ?? 0))} correction`
                        : isOpeningBalance
                          ? `Opening Balance ${formatBankBalancePill(pendingBalance, normalizedTicker, cryptoUnit)}`
                          : `${formatBankBalanceAdjustment(balanceDifference ?? 0, normalizedTicker, cryptoUnit)} adjustment`
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmBalanceEdit}
                      disabled={pendingBalance === ''}
                      className="rounded-md bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelBalanceEdit}
                      className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-row gap-2 items-center">
                    {isKindConfirmed ? (
                      <div className="flex flex-1 min-w-0 flex-col gap-1">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Kind</label>
                        <button
                          type="button"
                          onClick={() => {
                            setPendingKind(kind);
                            setShowKindChangeConfirm(true);
                          }}
                          className="flex-1 rounded-full border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-amber-300 hover:text-amber-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-amber-500/50 dark:hover:text-amber-200"
                        >
                          {KIND_OPTIONS.find((opt) => opt.value === kind)?.label ?? kind}
                        </button>
                      </div>
                    ) : null}

                    {kind === 'bank' ? (
                      <div className="flex flex-1 min-w-0 flex-col gap-1">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Balance</label>
                        <button
                          type="button"
                          onClick={handleStartBalanceEdit}
                          className="flex-1 rounded-full border border-blue-300 bg-blue-50 px-3 py-2 text-left text-sm font-medium text-blue-700 hover:border-blue-400 hover:bg-blue-100 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100 dark:hover:border-blue-400 dark:hover:bg-blue-500/20"
                        >
                          {bankBalancePillLabel}
                        </button>
                      </div>
                    ) : kind === 'debt' ? (
                      <div className="flex flex-1 min-w-0 flex-col gap-1">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Current Balance</label>
                        <button
                          type="button"
                          onClick={handleStartDebtBalanceEdit}
                          className="flex-1 rounded-full border border-blue-300 bg-blue-50 px-3 py-2 text-left text-sm font-medium text-blue-700 hover:border-blue-400 hover:bg-blue-100 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100 dark:hover:border-blue-400 dark:hover:bg-blue-500/20"
                        >
                          {debtBalancePillLabel}
                        </button>
                      </div>
                    ) : kind === 'allowance' ? (
                      <div className="flex flex-1 min-w-0 flex-col gap-1">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Balance</label>
                        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                          {balance === '' ? 'No balance yet' : formatAmountWithTicker(balance, '$')}
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <NumberInput
                          label={amountFieldLabel}
                          value={balance}
                          onChange={handleBalanceChange}
                          placeholder="0.00"
                          step={0.01}
                        />
                      </div>
                    )}
                  </div>

                  {kind === 'bank' ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Ticker</label>
                        <input
                          type="text"
                          value={cryptoTicker}
                          onChange={(event) => setCryptoTicker(event.target.value.toUpperCase())}
                          placeholder="$"
                          maxLength={6}
                          className={SELECT_CLS}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Unit</label>
                        <select
                          value={cryptoUnit}
                          onChange={(event) => setCryptoUnit(event.target.value as AccountResource['cryptoUnit'])}
                          className={SELECT_CLS}
                        >
                          <option value="whole">INT</option>
                          <option value="sats">SAT</option>
                        </select>
                      </div>
                    </div>
                  ) : null}

                  <TextInput
                    label="Institution"
                    value={institution}
                    onChange={setInstitution}
                    placeholder="e.g. Chase"
                    maxLength={100}
                  />

                  {kind === 'debt' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <NumberInput
                        label="My Payment"
                        value={debtExpectedPayment}
                        onChange={setDebtExpectedPayment}
                        placeholder="0.00"
                        step={0.01}
                      />
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Pulls from</label>
                        <select
                          value={pullFromAccountId}
                          onChange={(event) => setPullFromAccountId(event.target.value)}
                          className={SELECT_CLS}
                        >
                          <option value="">None</option>
                          {bankAccountOptions.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : supportsPullFrom ? (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Pulls from</label>
                      <select
                        value={pullFromAccountId}
                        onChange={(event) => setPullFromAccountId(event.target.value)}
                        className={SELECT_CLS}
                      >
                        <option value="">None</option>
                        {bankAccountOptions.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {supportsPushTo ? (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Push to</label>
                      <select
                        value={pullFromAccountId}
                        onChange={(event) => setPullFromAccountId(event.target.value)}
                        className={SELECT_CLS}
                      >
                        <option value="">None</option>
                        {bankAccountOptions.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {kind === 'debt' ? (
                    <>
                      <div className="space-y-2">
                        <div className="flex rounded-full bg-gray-100 p-1 dark:bg-gray-800">
                          {(['loan', 'credit'] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setDebtMode(mode)}
                              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                                debtMode === mode
                                  ? 'bg-blue-500 text-white'
                                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                              }`}
                            >
                              {mode === 'loan' ? 'Loan' : 'Credit'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {debtMode === 'loan' ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <NumberInput
                              label="Interest Rate"
                              value={debtRate}
                              onChange={setDebtRate}
                              placeholder="0"
                              step={0.01}
                            />
                            <NumberInput
                              label="Term (months)"
                              value={debtTerm}
                              onChange={setDebtTerm}
                              placeholder="0"
                              step={1}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Start Date</label>
                              <input
                                type="date"
                                value={debtStartDate}
                                onChange={(event) => setDebtStartDate(event.target.value)}
                                className={SELECT_CLS}
                              />
                            </div>
                            <NumberInput
                              label="Loan Amount"
                              value={debtStartingBalance}
                              onChange={setDebtStartingBalance}
                              placeholder="0.00"
                              step={0.01}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                              Est. payment {minimumPayment == null ? '--' : `${formatCompactAmount(minimumPayment, amountTicker)}/m`}
                            </div>
                            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                              Est. interest {estimatedInterest == null ? '--' : formatCompactAmount(estimatedInterest, amountTicker)}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                              Est. end {estimatedEndDate == null ? '--' : formatDate(estimatedEndDate)}
                            </div>
                          </div>
                          {showCustomPaymentEstimateNote ? (
                            <p className="px-1 text-xs text-gray-400 dark:text-gray-500">
                              Based on your payment of {formatAmountWithTicker(debtPayoffSimulation?.effectivePayment ?? 0)}.
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <NumberInput
                              label="Min Payment %"
                              value={minPaymentPercent}
                              onChange={setMinPaymentPercent}
                              placeholder="2"
                              step={0.01}
                            />
                            <NumberInput
                              label="Interest Rate"
                              value={debtRate}
                              onChange={setDebtRate}
                              placeholder="0"
                              step={0.01}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <NumberInput
                              label="Credit Limit"
                              value={debtStartingBalance}
                              onChange={setDebtStartingBalance}
                              placeholder="0.00"
                              step={0.01}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                              Est. minimum: {minimumPayment == null ? '--' : formatCompactAmount(minimumPayment, amountTicker)}
                            </div>
                          </div>
                          {creditPayoffSimulation ? (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                                  Est. interest: {estimatedInterest == null ? '--' : formatCompactAmount(estimatedInterest, amountTicker)}
                                </div>
                                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                                  Est. end: {estimatedEndDate == null ? '--' : formatDate(estimatedEndDate)}
                                </div>
                              </div>
                            </>
                          ) : null}
                          {showCreditPaymentWarning ? (
                            <p className="px-1 text-xs text-amber-600 dark:text-amber-300">
                              Payment does not cover interest - balance will grow.
                            </p>
                          ) : null}
                        </div>
                      )}
                    </>
                  ) : null}

                  {kind === 'allowance' ? (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Recipient</label>
                      <select
                        value={allowanceContactId}
                        onChange={(event) => setAllowanceContactId(event.target.value)}
                        className={SELECT_CLS}
                      >
                        <option value="">Select contact</option>
                        {contactOptions.map((contact) => (
                          <option key={contact.id} value={contact.id}>
                            {contact.displayName || contact.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </>
              )}
            </>
          )}

          {!isSelectingKind && (existing?.pendingTransactions?.length ?? 0) > 0 ? (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Pending Transactions ({existing?.pendingTransactions?.length ?? 0})
              </label>
              <div className="space-y-1">
                {(existing?.pendingTransactions ?? []).map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between rounded bg-gray-50 px-2 py-1.5 text-xs dark:bg-gray-700"
                  >
                    <span className="flex-1 truncate text-gray-700 dark:text-gray-200">
                      {transaction.description}
                    </span>
                    <span className="ml-2 shrink-0 text-gray-500">{transaction.status}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs italic text-gray-400">
                Written by shopping list - not editable here.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'tasks' ? (
        <div className="flex h-full min-h-0 flex-col gap-4 px-4 py-3">
          {kind === 'allowance' ? (
            renderTaskSection('account', 'Account Tasks', '+ Add Task')
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              {renderTaskSection('account', 'Account Tasks', '+ Add Task')}
            </div>
          )}

          {kind === 'allowance' ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Period Start</label>
                  <input
                    type="date"
                    value={allowanceStartDate}
                    onChange={(event) => setAllowanceStartDate(event.target.value)}
                    className={SELECT_CLS}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Period End</label>
                  <input
                    type="date"
                    value={allowanceEndDate}
                    onChange={(event) => setAllowanceEndDate(event.target.value)}
                    className={SELECT_CLS}
                  />
                </div>
              </div>

              {!hasExpandedTask && showAllowanceTaskSources ? (
                <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-600 dark:bg-gray-800/50">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Add an allowance task from existing resource tasks, the built-in library, or your saved templates.
                  </p>

                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <select
                      value={selectedAllowanceResourceTask}
                      onChange={(event) => setSelectedAllowanceResourceTask(event.target.value)}
                      className={SELECT_CLS}
                    >
                      <option value="">Existing tasks in your resources</option>
                      {existingResourceTaskOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => addAllowanceTaskFromSelection(selectedAllowanceResourceTask, existingResourceTaskOptions, setSelectedAllowanceResourceTask)}
                      disabled={!selectedAllowanceResourceTask}
                      className="rounded-md bg-blue-500 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>

                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <select
                      value={selectedAllowanceLibraryTask}
                      onChange={(event) => setSelectedAllowanceLibraryTask(event.target.value)}
                      className={SELECT_CLS}
                    >
                      <option value="">Built-in library tasks</option>
                      {libraryTaskOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => addAllowanceTaskFromSelection(selectedAllowanceLibraryTask, libraryTaskOptions, setSelectedAllowanceLibraryTask)}
                      disabled={!selectedAllowanceLibraryTask}
                      className="rounded-md bg-blue-500 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>

                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <select
                      value={selectedAllowanceUserTemplate}
                      onChange={(event) => setSelectedAllowanceUserTemplate(event.target.value)}
                      className={SELECT_CLS}
                    >
                      <option value="">Your saved task templates</option>
                      {userTemplateOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => addAllowanceTaskFromSelection(selectedAllowanceUserTemplate, userTemplateOptions, setSelectedAllowanceUserTemplate)}
                      disabled={!selectedAllowanceUserTemplate}
                      className="rounded-md bg-blue-500 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                </div>
              ) : null}

              {renderTaskSection(
                'allowance',
                'Allowance tasks',
                showAllowanceTaskSources ? 'Hide Sources' : '+ Add Task',
                () => setShowAllowanceTaskSources((prev) => !prev),
              )}
            </>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'links' ? (
        existing ? (
          <div className="px-4 py-3">
            {linksCleared ? (
              <div className="rounded-lg bg-gray-50 px-3 py-4 text-center dark:bg-gray-800/60">
                <p className="text-xs italic text-gray-400">Links will be cleared when you save this type change.</p>
              </div>
            ) : (
              <ResourceLinksTabNew
                resource={existing}
                pendingAutoLinkId={pendingAutoLinkId}
                pendingAutoLinkRelationship={pendingAutoLinkRelationship}
              />
            )}
          </div>
        ) : (
          <div className="px-4 py-3">
            <div className="rounded-lg bg-gray-50 px-3 py-4 text-center dark:bg-gray-800/60">
              <p className="text-xs italic text-gray-400">Save the account first to add links.</p>
            </div>
          </div>
        )
      ) : null}

      {activeTab === 'album' ? (
        existing ? (
          <div className="px-4 py-3">
            <AlbumViewer
              entries={album}
              title="Account album"
              onAdd={handleAddEntry}
              onEdit={handleEditEntry}
              onDelete={handleDeleteEntry}
            />
          </div>
        ) : (
          <div className="px-4 py-3">
            <div className="rounded-lg bg-gray-50 px-3 py-4 text-center dark:bg-gray-800/60">
              <p className="text-xs italic text-gray-400">Save the account first to add album entries.</p>
            </div>
          </div>
        )
      ) : null}

      {activeTab === 'log' ? (
        <div className="space-y-3 px-4 py-3">
          {!existing ? (
            <div className="rounded-lg bg-gray-50 px-3 py-4 text-center dark:bg-gray-800/60">
              <p className="text-xs italic text-gray-400">Save the account first to view transaction logs.</p>
            </div>
          ) : transactionCompletions.length === 0 ? (
            <div className="rounded-lg bg-gray-50 px-3 py-4 text-center dark:bg-gray-800/60">
              <p className="text-xs italic text-gray-400">No transactions logged yet.</p>
            </div>
          ) : (
            transactionCompletions.map((entry) => (
              <div
                key={entry.key}
                className="rounded-lg border border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-800/70"
              >
                <div className="text-xs text-gray-400 dark:text-gray-500">
                  {formatCompletionDateTime(entry.completedAt)}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1 text-sm text-gray-800 dark:text-gray-100">
                  <span>{entry.value || entry.note || 'No result text'}</span>
                  {entry.direction && entry.linkedAccountName && entry.linkedAccountIcon ? (<>
                    <span>{entry.direction === 'deposit' ? 'deposited into' : 'withdrawn from'}</span>
                    <span className="inline-flex items-center gap-1">
                      <IconDisplay iconKey={entry.linkedAccountIcon} size={16} className="h-4 w-4 object-contain" alt="" />
                      <span>{entry.linkedAccountName}</span>
                    </span>
                  </>) : null}
                </div>
                {showLoggedAmounts && entry.amount != null ? (
                  <div className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Amount: {kind === 'bank'
                      ? formatAmountWithTicker(entry.amount, normalizedTicker)
                      : formatKindAwareAmount(kind, entry.amount, cryptoTicker)}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}

      {existing && (isCreatingEntry || editingEntry) ? (
        <AlbumEntryEditor
          entry={editingEntry ?? undefined}
          onSave={handleSaveEntry}
          onCancel={handleCancelEntry}
        />
      ) : null}
    </ResourceFormShell>
  );
}

