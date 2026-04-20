import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  AccountKind,
  AccountResource,
  AccountTask,
  RecurrenceDayOfWeek,
  ResourceNote,
  ResourceRecurrenceRule,
} from '../../../../../../types/resource';
import {
  makeDefaultRecurrenceRule,
  normalizeRecurrenceMode,
  toRecurrenceRule,
} from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { generateGTDItems } from '../../../../../../engine/resourceEngine';
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
  anticipatedValue: number | '';
  recurrenceMode: 'recurring' | 'never';
  recurrence: ResourceRecurrenceRule;
  reminderLeadDays: number;
}

const KIND_OPTIONS: { value: AccountKind; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'bill', label: 'Bill' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'income', label: 'Income' },
  { value: 'debt', label: 'Debt' },
  { value: 'allowance', label: 'Allowance' },
];

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
    anticipatedValue: '',
    recurrenceMode: 'never',
    recurrence: makeDefaultRecurrenceRule(),
    reminderLeadDays: -1,
  };
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

export function AccountForm({ existing, onSaved, onCancel }: AccountFormProps) {
  const [iconKey, setIconKey] = useState<string>(existing?.icon ?? 'finance');
  const [displayName, setDisplayName] = useState(existing?.name ?? '');
  const [balance, setBalance] = useState<number | ''>(existing?.balance ?? '');
  const [kind, setKind] = useState<AccountKind>(existing?.kind ?? 'bank');
  const [showAccountInfo, setShowAccountInfo] = useState(Boolean(existing?.institution));
  const [institution, setInstitution] = useState(existing?.institution ?? '');
  const [accountTasks, setAccountTasks] = useState<TaskDraft[]>(
    existing?.accountTasks?.map((task) => ({
      id: task.id,
      icon: task.icon ?? '',
      name: task.name,
      kind: task.kind ?? 'account-task',
      anticipatedValue: task.anticipatedValue ?? '',
      recurrenceMode: normalizeRecurrenceMode(task.recurrenceMode),
      recurrence: toRecurrenceRule(task.recurrence),
      reminderLeadDays: task.reminderLeadDays ?? 7,
    })) ?? [makeTransactionLogTask()],
  );
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [notes, setNotes] = useState<ResourceNote[]>(existing?.notes ?? []);

  const resources = useResourceStore((s) => s.resources);
  const setResource = useResourceStore((s) => s.setResource);
  const setUser = useUserStore((s) => s.setUser);
  const user = useUserStore((s) => s.user);
  const currentExisting = existing ? (resources[existing.id] as typeof existing | undefined) : undefined;

  const canSave = displayName.trim().length > 0;

  function addTask() {
    const nextId = uuidv4();
    setAccountTasks((prev) => [
      ...prev,
      {
        id: nextId,
        icon: '',
        name: '',
        kind: 'account-task',
        anticipatedValue: '',
        recurrenceMode: 'never',
        recurrence: makeDefaultRecurrenceRule(),
        reminderLeadDays: 7,
      },
    ]);
    setExpandedTaskId(nextId);
  }

  function updateTask(id: string, field: keyof TaskDraft, value: string | number | ResourceRecurrenceRule) {
    setAccountTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, [field]: value } : task)),
    );
  }

  function updateTaskRecurrence(id: string, patch: Partial<ResourceRecurrenceRule>) {
    setAccountTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? { ...task, recurrence: { ...task.recurrence, ...patch } }
          : task,
      ),
    );
  }

  function toggleTaskDay(id: string, day: RecurrenceDayOfWeek) {
    setAccountTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id) return task;
        const days = task.recurrence.days.includes(day)
          ? task.recurrence.days.filter((entry) => entry !== day)
          : [...task.recurrence.days, day];
        return { ...task, recurrence: { ...task.recurrence, days } };
      }),
    );
  }

  function removeTask(id: string) {
    const taskToRemove = accountTasks.find((task) => task.id === id);
    if (taskToRemove?.kind === 'transaction-log') return;

    setAccountTasks((prev) => prev.filter((task) => task.id !== id));
    setExpandedTaskId((prev) => (prev === id ? null : prev));
  }

  function handleSave() {
    if (!canSave) return;

    const finalTasks: AccountTask[] = accountTasks
      .filter((task) => task.name.trim().length > 0)
      .map((task) => {
        const recurrenceMode = normalizeRecurrenceMode(task.recurrenceMode);
        return {
        id: task.id,
        icon: task.icon.trim(),
        name: task.name.trim(),
        kind: task.kind ?? 'account-task',
        anticipatedValue: task.anticipatedValue === '' ? undefined : task.anticipatedValue,
        recurrenceMode,
        recurrence: task.recurrence,
        reminderLeadDays: recurrenceMode === 'recurring' ? task.reminderLeadDays : -1,
      };
      });

    if (!finalTasks.some((task) => task.kind === 'transaction-log')) {
      finalTasks.unshift({
        id: uuidv4(),
        icon: 'finance',
        name: 'Transaction Log',
        kind: 'transaction-log',
        anticipatedValue: undefined,
        recurrenceMode: 'never',
        recurrence: makeDefaultRecurrenceRule(),
        reminderLeadDays: -1,
      });
    }

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
      dueDate: undefined,
      dueDateLeadDays: undefined,
      pendingTransactions: existing?.pendingTransactions ?? [],
      accountTasks: finalTasks,
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
            label="Balance"
            value={balance}
            onChange={setBalance}
            placeholder="0.00"
            step={0.01}
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

        {showAccountInfo ? (
          <TextInput
            label="Institution"
            value={institution}
            onChange={setInstitution}
            placeholder="e.g. Chase"
            maxLength={100}
          />
        ) : null}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Transaction tasks
            </span>
            <button
              type="button"
              onClick={addTask}
              className="text-xs font-medium text-blue-500 hover:text-blue-600"
            >
              + Add task
            </button>
          </div>
          {accountTasks.map((task) => {
            const isExpanded = expandedTaskId === task.id;
            const isLockedTask = task.kind === 'transaction-log';
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
                      <IconPicker value={task.icon || 'finance'} onChange={(value) => updateTask(task.id, 'icon', value)} align="left" />
                      {isLockedTask ? (
                        <div className="flex-1 rounded-md border border-gray-200 bg-gray-100 px-2 py-1.5 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
                          {task.name}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={task.name}
                          onChange={(event) => updateTask(task.id, 'name', event.target.value)}
                          placeholder="Task name"
                          maxLength={80}
                          className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                      )}
                    </div>

                    <div className="flex items-end gap-2">
                      <div className="flex rounded-full bg-white p-1 dark:bg-gray-800">
                        {(['recurring', 'never'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => updateTask(task.id, 'recurrenceMode', mode)}
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
                          onChange={(value) => updateTask(task.id, 'anticipatedValue', value)}
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
                                  onChange={(event) => updateTaskRecurrence(task.id, { interval: Math.max(1, Number(event.target.value) || 1) })}
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
                                    updateTaskRecurrence(task.id, {
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
                              onChange={(event) => updateTaskRecurrence(task.id, { interval: Math.max(1, Number(event.target.value) || 1) })}
                              className={SMALL_INPUT_CLS}
                            />
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <div className="ml-auto">
                            <select
                              value={task.recurrence.frequency}
                              onChange={(event) =>
                                updateTaskRecurrence(task.id, {
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
                                  onClick={() => toggleTaskDay(task.id, key)}
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
                              updateTaskRecurrence(task.id, {
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
                            onChange={(event) => updateTaskRecurrence(task.id, { endsOn: event.target.value || null })}
                            className={SMALL_INPUT_CLS}
                          />
                        </div>
                      </div>
                    ) : null}

                    {normalizeRecurrenceMode(task.recurrenceMode) === 'recurring' ? (
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">Reminder:</span>
                        <select
                          value={task.reminderLeadDays}
                          onChange={(event) => updateTask(task.id, 'reminderLeadDays', Number(event.target.value))}
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
                          onClick={() => removeTask(task.id)}
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
