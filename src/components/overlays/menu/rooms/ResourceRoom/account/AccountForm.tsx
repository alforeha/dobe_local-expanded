import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { taskTemplateLibrary } from '../../../../../../coach';
import { CUSTOM_ITEM_TEMPLATE_PREFIX, getItemTaskTemplateMeta } from '../../../../../../coach/ItemLibrary';
import type {
  AccountKind,
  AccountResource,
  AccountTask,
  ContactResource,
  CryptoUnit,
  HomeResource,
  InventoryItemTemplate,
  InventoryResource,
  RecurrenceDayOfWeek,
  Resource,
  ResourceNote,
  ResourceRecurrenceRule,
  VehicleResource,
} from '../../../../../../types/resource';
import {
  isInventory,
  makeDefaultRecurrenceRule,
  normalizeRecurrenceMode,
  toRecurrenceRule,
} from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useScheduleStore } from '../../../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { generateGTDItems } from '../../../../../../engine/resourceEngine';
import { getCustomTemplatePool, getLibraryTemplatePool } from '../../../../../../utils/resolveTaskTemplate';
import { getUserInventoryItemTemplates, mergeInventoryItemTemplates } from '../../../../../../utils/inventoryItems';
import { TextInput } from '../../../../../shared/inputs/TextInput';
import { NumberInput } from '../../../../../shared/inputs/NumberInput';
import { IconPicker } from '../../../../../shared/IconPicker';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { NotesLogEditor } from '../../../../../shared/NotesLogEditor';

interface AccountFormProps {
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
  anticipatedValue: number | '';
  recurrenceMode: 'recurring' | 'never';
  recurrence: ResourceRecurrenceRule;
  reminderLeadDays: number;
}

const RESOURCE_TASK_TYPE_OPTIONS = ['CHECK', 'COUNTER', 'DURATION', 'TIMER', 'RATING', 'TEXT'] as const;

interface AllowanceTaskSourceOption {
  value: string;
  label: string;
  icon: string;
  detail?: string;
  seed: Omit<TaskDraft, 'id' | 'kind'>;
}

const KIND_OPTIONS: { value: AccountKind; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'bill', label: 'Bill' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'income', label: 'Income' },
  { value: 'debt', label: 'Debt' },
  { value: 'allowance', label: 'Allowance' },
  { value: 'crypto', label: 'Crypto' },
];

const CRYPTO_WHOLE_SCALE = 100_000_000;

const DOW_LABELS: { key: RecurrenceDayOfWeek; label: string }[] = [
  { key: 'sun', label: 'Su' },
  { key: 'mon', label: 'Mo' },
  { key: 'tue', label: 'Tu' },
  { key: 'wed', label: 'We' },
  { key: 'thu', label: 'Th' },
  { key: 'fri', label: 'Fr' },
  { key: 'sat', label: 'Sa' },
];

const SELECT_CLS =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

const SMALL_INPUT_CLS =
  'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

function makeTransactionLogTask(): TaskDraft {
  return {
    id: uuidv4(),
    icon: 'finance',
    name: 'Transaction Log',
    kind: 'transaction-log',
    taskType: 'TEXT',
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
    anticipatedValue,
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
    anticipatedValue: seed.anticipatedValue,
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
    anticipatedValue: task.anticipatedValue ?? '',
    recurrenceMode: normalizeRecurrenceMode(task.recurrenceMode),
    recurrence: toRecurrenceRule(task.recurrence),
    reminderLeadDays: task.reminderLeadDays ?? 7,
  };
}

function finaliseTaskDrafts(taskDrafts: TaskDraft[], ensureTransactionLog: boolean): AccountTask[] {
  const finalTasks: AccountTask[] = taskDrafts
    .filter((task) => task.name.trim().length > 0)
    .map((task) => {
      const recurrenceMode = normalizeRecurrenceMode(task.recurrenceMode);
      return {
        id: task.id,
        icon: task.icon.trim(),
        name: task.name.trim(),
        kind: task.kind ?? 'account-task',
        taskType: task.taskType ?? (task.kind === 'transaction-log' ? 'TEXT' : 'CHECK'),
        anticipatedValue: task.anticipatedValue === '' ? undefined : task.anticipatedValue,
        recurrenceMode,
        recurrence: task.recurrence,
        reminderLeadDays: recurrenceMode === 'recurring' ? task.reminderLeadDays : -1,
      };
    });

  if (ensureTransactionLog && !finalTasks.some((task) => task.kind === 'transaction-log')) {
    finalTasks.unshift({
      id: uuidv4(),
      icon: 'finance',
      name: 'Transaction Log',
      kind: 'transaction-log',
      taskType: 'TEXT',
      anticipatedValue: undefined,
      recurrenceMode: 'never',
      recurrence: makeDefaultRecurrenceRule(),
      reminderLeadDays: -1,
    });
  }

  return finalTasks;
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDayOfMonth(day: number): string {
  const mod10 = day % 10;
  const mod100 = day % 100;
  if (mod10 === 1 && mod100 !== 11) return `${day}st`;
  if (mod10 === 2 && mod100 !== 12) return `${day}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${day}rd`;
  return `${day}th`;
}

function getDayOfMonth(isoDate: string): number {
  const parsed = Number(isoDate.split('-')[2] ?? 1);
  return Math.min(31, Math.max(1, parsed || 1));
}

function describeTaskRecurrence(rule: ResourceRecurrenceRule): string {
  const interval = Math.max(1, rule.interval || 1);
  switch (rule.frequency) {
    case 'daily':
      return interval === 1 ? 'Daily' : `Every ${interval} days`;
    case 'weekly': {
      const days = rule.days.length > 0
        ? rule.days.map((day) => DOW_LABELS.find((entry) => entry.key === day)?.label ?? day).join(' ')
        : 'Seed day';
      return interval === 1 ? `Weekly - ${days}` : `Every ${interval} weeks - ${days}`;
    }
    case 'monthly': {
      const day = rule.monthlyDay ?? getDayOfMonth(rule.seedDate);
      return interval === 1 ? `Monthly - ${formatDayOfMonth(day)}` : `Every ${interval} months - ${formatDayOfMonth(day)}`;
    }
    case 'yearly':
      return interval === 1 ? 'Yearly' : `Every ${interval} years`;
    default:
      return 'Recurring';
  }
}

function describeTaskSchedule(task: TaskDraft): string {
  return normalizeRecurrenceMode(task.recurrenceMode) === 'never'
    ? 'Intermittent'
    : describeTaskRecurrence(task.recurrence);
}

function describeReminder(leadDays: number): string {
  if (leadDays < 0) return 'No reminder';
  if (leadDays === 0) return 'Day of';
  if (leadDays === 1) return '1 day before';
  return `${leadDays} days before`;
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
              detail: `Existing inventory task${container.name ? ` · ${container.name}` : ''}`,
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

export function AccountForm({ existing, onSaved, onCancel }: AccountFormProps) {
  const [iconKey, setIconKey] = useState<string>(existing?.icon ?? 'finance');
  const [displayName, setDisplayName] = useState(existing?.name ?? '');
  const [balance, setBalance] = useState<number | ''>(existing?.balance ?? '');
  const [kind, setKind] = useState<AccountKind>(existing?.kind ?? 'bank');
  const [cryptoTicker, setCryptoTicker] = useState(existing?.cryptoTicker ?? '');
  const [cryptoUnit, setCryptoUnit] = useState<CryptoUnit>(existing?.cryptoUnit ?? 'whole');
  const [showAccountInfo, setShowAccountInfo] = useState(Boolean(existing?.institution));
  const [institution, setInstitution] = useState(existing?.institution ?? '');
  const [accountTasks, setAccountTasks] = useState<TaskDraft[]>(
    existing?.accountTasks?.map(toTaskDraft) ?? [makeTransactionLogTask()],
  );
  const [allowanceTasks, setAllowanceTasks] = useState<TaskDraft[]>(
    existing?.allowanceTasks?.map(toTaskDraft) ?? [],
  );
  const [allowanceContactId, setAllowanceContactId] = useState(existing?.allowanceContactId ?? '');
  const [expandedAccountTaskId, setExpandedAccountTaskId] = useState<string | null>(null);
  const [expandedAllowanceTaskId, setExpandedAllowanceTaskId] = useState<string | null>(null);
  const [showAllowanceTaskSources, setShowAllowanceTaskSources] = useState(false);
  const [selectedAllowanceResourceTask, setSelectedAllowanceResourceTask] = useState('');
  const [selectedAllowanceLibraryTask, setSelectedAllowanceLibraryTask] = useState('');
  const [selectedAllowanceUserTemplate, setSelectedAllowanceUserTemplate] = useState('');
  const [notes, setNotes] = useState<ResourceNote[]>(existing?.notes ?? []);

  const resources = useResourceStore((s) => s.resources);
  const setResource = useResourceStore((s) => s.setResource);
  const userTaskTemplates = useScheduleStore((s) => s.taskTemplates);
  const setUser = useUserStore((s) => s.setUser);
  const user = useUserStore((s) => s.user);
  const currentExisting = existing ? (resources[existing.id] as typeof existing | undefined) : undefined;
  const contactOptions = Object.values(resources).filter((resource): resource is ContactResource => resource.type === 'contact');
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

  const canSave = displayName.trim().length > 0;

  const displayedBalance =
    kind === 'crypto' && cryptoUnit === 'whole' && balance !== ''
      ? Number((balance / CRYPTO_WHOLE_SCALE).toFixed(8))
      : balance;
  const balanceLabel =
    kind === 'crypto'
      ? cryptoUnit === 'sats'
        ? 'Balance (sats)'
        : `Balance (${cryptoTicker.trim().toUpperCase() || 'whole'})`
      : 'Balance';
  const balanceStep = kind === 'crypto' ? (cryptoUnit === 'sats' ? 1 : 0.00000001) : 0.01;

  function handleBalanceChange(value: number | '') {
    if (value === '') {
      setBalance('');
      return;
    }
    if (kind !== 'crypto') {
      setBalance(value);
      return;
    }
    setBalance(cryptoUnit === 'sats' ? Math.round(value) : Math.round(value * CRYPTO_WHOLE_SCALE));
  }

  function addTask(section: 'account' | 'allowance') {
    const nextTask = makeBlankTaskDraft();
    if (section === 'account') {
      setAccountTasks((prev) => [...prev, nextTask]);
      setExpandedAccountTaskId(nextTask.id);
      return;
    }
    setAllowanceTasks((prev) => [...prev, nextTask]);
    setExpandedAllowanceTaskId(nextTask.id);
  }

  function addAllowanceTaskFromOption(option: AllowanceTaskSourceOption) {
    const nextTask = makeTaskDraftFromSeed(option.seed);
    setAllowanceTasks((prev) => [...prev, nextTask]);
    setExpandedAllowanceTaskId(nextTask.id);
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
    value: string | number | ResourceRecurrenceRule,
  ) {
    const setTasks = section === 'account' ? setAccountTasks : setAllowanceTasks;
    setTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, [field]: value } : task)),
    );
  }

  function updateTaskRecurrence(
    section: 'account' | 'allowance',
    id: string,
    patch: Partial<ResourceRecurrenceRule>,
  ) {
    const setTasks = section === 'account' ? setAccountTasks : setAllowanceTasks;
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? { ...task, recurrence: { ...task.recurrence, ...patch } }
          : task,
      ),
    );
  }

  function toggleTaskDay(section: 'account' | 'allowance', id: string, day: RecurrenceDayOfWeek) {
    const setTasks = section === 'account' ? setAccountTasks : setAllowanceTasks;
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id) return task;
        const days = task.recurrence.days.includes(day)
          ? task.recurrence.days.filter((entry) => entry !== day)
          : [...task.recurrence.days, day];
        return { ...task, recurrence: { ...task.recurrence, days } };
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
  }

  function renderTaskSection(
    section: 'account' | 'allowance',
    title: string,
    actionLabel: string,
    onAddTask?: () => void,
  ) {
    const tasks = section === 'account' ? accountTasks : allowanceTasks;
    const expandedTaskId = section === 'account' ? expandedAccountTaskId : expandedAllowanceTaskId;
    const setExpandedTaskId = section === 'account' ? setExpandedAccountTaskId : setExpandedAllowanceTaskId;

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</span>
          <button
            type="button"
            onClick={onAddTask ?? (() => addTask(section))}
            className="text-xs font-medium text-blue-500 hover:text-blue-600"
          >
            {actionLabel}
          </button>
        </div>
        {tasks.map((task) => {
          const isExpanded = expandedTaskId === task.id;
          const isLockedTask = section === 'account' && task.kind === 'transaction-log';
          return (
            <div key={task.id} className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700">
              <button
                type="button"
                onClick={() => setExpandedTaskId((prev) => (prev === task.id ? null : task.id))}
                className="flex w-full items-center gap-3 text-left"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white dark:bg-gray-800">
                  <IconDisplay iconKey={task.icon?.trim() || 'finance'} size={20} className="h-5 w-5 object-contain" alt="" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                    {task.name.trim() || 'Untitled account task'}
                  </div>
                  <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {normalizeRecurrenceMode(task.recurrenceMode) === 'recurring'
                      ? `${describeTaskSchedule(task)} - ${describeReminder(task.reminderLeadDays)}${task.anticipatedValue !== '' ? ` - ${formatCurrency(task.anticipatedValue)}` : ''}`
                      : `${describeTaskSchedule(task)}${task.anticipatedValue !== '' ? ` - ${formatCurrency(task.anticipatedValue)}` : ''}`}
                  </div>
                </div>
                <span className="text-xs font-medium text-blue-500">{isExpanded ? 'Close' : 'Edit'}</span>
              </button>

              {isExpanded ? (
                <div className="mt-3 space-y-3 border-t border-gray-200 pt-3 dark:border-gray-600">
                  <div className="flex items-center gap-2">
                    <IconPicker value={task.icon || 'finance'} onChange={(value) => updateTask(section, task.id, 'icon', value)} align="left" />
                    {isLockedTask ? (
                      <div className="flex-1 rounded-md border border-gray-200 bg-gray-100 px-2 py-1.5 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        {task.name}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={task.name}
                        onChange={(event) => updateTask(section, task.id, 'name', event.target.value)}
                        placeholder="Task name"
                        maxLength={80}
                        className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Task type</label>
                    <select
                      value={task.taskType ?? (isLockedTask ? 'TEXT' : 'CHECK')}
                      onChange={(event) => updateTask(section, task.id, 'taskType', event.target.value)}
                      disabled={isLockedTask}
                      className={SMALL_INPUT_CLS}
                    >
                      {RESOURCE_TASK_TYPE_OPTIONS.map((taskType) => (
                        <option key={taskType} value={taskType}>{taskType}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-end gap-2">
                    <div className="flex rounded-full bg-white p-1 dark:bg-gray-800">
                      {(['recurring', 'never'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => updateTask(section, task.id, 'recurrenceMode', mode)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            normalizeRecurrenceMode(task.recurrenceMode) === mode
                              ? 'bg-blue-500 text-white'
                              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                          }`}
                        >
                          {mode === 'recurring' ? 'Recurring' : 'Intermittent'}
                        </button>
                      ))}
                    </div>
                    <div className="ml-auto w-36">
                      <NumberInput
                        label="Anticipated"
                        value={task.anticipatedValue}
                        onChange={(value) => updateTask(section, task.id, 'anticipatedValue', value)}
                        placeholder="0.00"
                        step={0.01}
                      />
                    </div>
                  </div>

                  {normalizeRecurrenceMode(task.recurrenceMode) === 'recurring' ? (
                    <div className="space-y-2 rounded-md border border-gray-200 bg-white px-3 py-3 dark:border-gray-600 dark:bg-gray-800/70">
                      {task.recurrence.frequency === 'monthly' ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Every</label>
                              <input
                                type="number"
                                min={1}
                                max={99}
                                value={task.recurrence.interval}
                                onChange={(event) => updateTaskRecurrence(section, task.id, { interval: Math.max(1, Number(event.target.value) || 1) })}
                                className={SMALL_INPUT_CLS}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Day of month</label>
                              <input
                                type="number"
                                min={1}
                                max={31}
                                value={task.recurrence.monthlyDay ?? getDayOfMonth(task.recurrence.seedDate)}
                                onChange={(event) =>
                                  updateTaskRecurrence(section, task.id, {
                                    monthlyDay: Math.min(31, Math.max(1, Number(event.target.value) || 1)),
                                  })
                                }
                                className={SMALL_INPUT_CLS}
                              />
                            </div>
                          </div>
                          <p className="text-[11px] text-gray-400 dark:text-gray-500">
                            Days 29-31 use the last day of shorter months automatically.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Interval</label>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={task.recurrence.interval}
                            onChange={(event) => updateTaskRecurrence(section, task.id, { interval: Math.max(1, Number(event.target.value) || 1) })}
                            className={SMALL_INPUT_CLS}
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <div className="ml-auto">
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
                            className={`w-36 ${SMALL_INPUT_CLS}`}
                          >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="yearly">Yearly</option>
                          </select>
                        </div>
                      </div>

                      {task.recurrence.frequency === 'weekly' ? (
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Days</label>
                          <div className="flex gap-1">
                            {DOW_LABELS.map(({ key, label }) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => toggleTaskDay(section, task.id, key)}
                                className={`h-7 w-7 rounded text-xs font-medium transition-colors ${
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

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Start date</label>
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
                          className={SMALL_INPUT_CLS}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Ends on</label>
                        <input
                          type="date"
                          value={task.recurrence.endsOn ?? ''}
                          onChange={(event) => updateTaskRecurrence(section, task.id, { endsOn: event.target.value || null })}
                          className={SMALL_INPUT_CLS}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-gray-200 bg-white px-3 py-3 text-xs text-gray-500 dark:border-gray-600 dark:bg-gray-800/70 dark:text-gray-300">
                      Intermittent task. No date or reminder settings are needed.
                    </div>
                  )}

                  {normalizeRecurrenceMode(task.recurrenceMode) === 'recurring' ? (
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">Reminder:</span>
                      <select
                        value={task.reminderLeadDays}
                        onChange={(event) => updateTask(section, task.id, 'reminderLeadDays', Number(event.target.value))}
                        className="ml-auto w-40 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      >
                        <option value={-1}>No reminder</option>
                        <option value={0}>Day of</option>
                        <option value={3}>3 days before</option>
                        <option value={7}>7 days before</option>
                        <option value={14}>14 days before</option>
                        <option value={30}>30 days before</option>
                      </select>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between pt-1">
                    {isLockedTask ? (
                      <span className="text-xs text-gray-400">Required task</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => removeTask(section, task.id)}
                        className="text-xs text-gray-400 hover:text-red-400"
                      >
                        Remove
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setExpandedTaskId(null)}
                      className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  function handleSave() {
    if (!canSave) return;

    const finalTasks = finaliseTaskDrafts(accountTasks, true);
    const finalAllowanceTasks = finaliseTaskDrafts(allowanceTasks, false);

    const now = new Date().toISOString();
    const resource: AccountResource = {
      id: existing?.id ?? uuidv4(),
      type: 'account',
      icon: iconKey,
      name: displayName.trim(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      kind,
      institution: showAccountInfo ? (institution.trim() || undefined) : undefined,
      balance: balance === '' ? undefined : balance,
      cryptoUnit: kind === 'crypto' ? cryptoUnit : undefined,
      cryptoTicker: kind === 'crypto' ? (cryptoTicker.trim().toUpperCase() || undefined) : undefined,
      dueDate: undefined,
      dueDateLeadDays: undefined,
      pendingTransactions: existing?.pendingTransactions ?? [],
      accountTasks: finalTasks,
      allowanceTasks: kind === 'allowance' && finalAllowanceTasks.length > 0 ? finalAllowanceTasks : undefined,
      allowanceContactId: kind === 'allowance' ? (allowanceContactId || undefined) : undefined,
      notes,
      links: currentExisting?.links ?? existing?.links,
      linkedHomeId: existing?.linkedHomeId,
      linkedContactId: existing?.linkedContactId,
      linkedAccountId: existing?.linkedAccountId,
      sharedWith: existing?.sharedWith ?? null,
    };

    setResource(resource);

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
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-700 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          Back
        </button>
        <h3 className="flex-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
          {existing ? 'Edit Account' : 'New Account'}
        </h3>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className={`text-sm font-semibold transition-colors ${
            canSave ? 'text-blue-500 hover:text-blue-600' : 'text-gray-300'
          }`}
        >
          Save
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <div className="grid grid-cols-[auto_1fr] items-end gap-3">
          <IconPicker value={iconKey} onChange={setIconKey} />
          <TextInput
            label="Name *"
            value={displayName}
            onChange={setDisplayName}
            placeholder="e.g. Checking Account"
            maxLength={100}
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-3">
          <NumberInput
            label={balanceLabel}
            value={displayedBalance}
            onChange={handleBalanceChange}
            placeholder="0.00"
            step={balanceStep}
          />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Kind
            </label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as AccountKind)}
              className={SELECT_CLS}
            >
              {KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
            <input
              type="checkbox"
              checked={showAccountInfo}
              onChange={(event) => setShowAccountInfo(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 dark:border-gray-500"
            />
            <span>Add account info</span>
          </label>
        </div>

        {kind === 'crypto' ? (
          <div className="grid grid-cols-2 gap-3">
            <TextInput
              label="Ticker"
              value={cryptoTicker}
              onChange={setCryptoTicker}
              placeholder="BTC"
              maxLength={10}
            />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Unit</label>
              <div className="flex rounded-full bg-gray-100 p-1 dark:bg-gray-700">
                {(['whole', 'sats'] as const).map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => setCryptoUnit(unit)}
                    className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      cryptoUnit === unit
                        ? 'bg-blue-500 text-white'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100'
                    }`}
                  >
                    {unit === 'whole' ? 'Whole' : 'Sats'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {showAccountInfo ? (
          <TextInput
            label="Institution"
            value={institution}
            onChange={setInstitution}
            placeholder="e.g. Chase"
            maxLength={100}
          />
        ) : null}

        {renderTaskSection('account', 'Transaction tasks', '+ Add task')}

        {kind === 'allowance' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
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
            </div>
            <p className="text-xs italic text-gray-400">
              Allowance push available in multi-user.
            </p>
            {showAllowanceTaskSources ? (
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
              'Tasks for allowance recipient',
              showAllowanceTaskSources ? 'Hide sources' : '+ Add task',
              () => setShowAllowanceTaskSources((prev) => !prev),
            )}
          </>
        ) : null}

        {(existing?.pendingTransactions?.length ?? 0) > 0 ? (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Pending Transactions ({existing?.pendingTransactions?.length ?? 0})
            </label>
            <div className="space-y-1">
              {(existing?.pendingTransactions ?? []).map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between rounded px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-700"
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

        <NotesLogEditor
          notes={notes}
          onChange={setNotes}
          resource={existing}
          linkTabLabel="Links"
          allowedLinkTypes={['contact', 'home', 'vehicle', 'account']}
        />
      </div>
    </div>
  );
}
