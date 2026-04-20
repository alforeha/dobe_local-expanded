// ─────────────────────────────────────────
// ChainPopup — W21 MVP11
// Renders Chain WOOP fields + Quest management (add / edit / delete / expand).
// Milestones within each Quest are read-only.
// ─────────────────────────────────────────

import { useState } from 'react';
import type {
  Act,
  Chain,
  Quest,
  ExigencyOption,
  QuestCompletionState,
  Task,
  TaskTemplate,
  ChecklistItem,
  QuickActionsEvent,
  Event,
} from '../../../../../types';
import type {
  RecurrenceFrequency,
  Weekday,
  RollInputFields,
} from '../../../../../types';
import { useProgressionStore } from '../../../../../stores/useProgressionStore';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';

import { computeProjectedFinish } from '../../../../../engine';
import { starterTaskTemplates } from '../../../../../coach/StarterQuestLibrary';
import { getAppDate } from '../../../../../utils/dateUtils';

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const EXIGENCY_OPTIONS: ExigencyOption[] = ['restart', 'extend', 'reschedule', 'sleep'];

// ── SHARED INPUT CLASS ────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm ' +
  'text-gray-800 dark:text-gray-200 dark:bg-gray-700 focus:border-blue-500 ' +
  'focus:outline-none focus:ring-1 focus:ring-blue-500';

const selectCls = inputCls + ' bg-white';

// ── FIELD WRAPPER ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
      {children}
    </div>
  );
}

// ── BLANK QUEST FACTORY ───────────────────────────────────────────────────────

function blankQuest(): Quest {
  return {
    name: '',
    description: '',
    icon: '🎯',
    completionState: 'active',
    specific: {
      targetValue: 1,
      unit: null,
      sourceType: 'taskInput',
      resourceRef: null,
      resourceProperty: null,
    },
    measurable: { taskTemplateRefs: [] },
    attainable: {},
    relevant: {},
    timely: {
      conditionType: 'interval',
      interval: {
        frequency: 'weekly',
        days: [],
        interval: 1,
        endsOn: null,
        customCondition: null,
      },
      xpThreshold: null,
      markers: [],
      projectedFinish: null,
    },
    exigency: { onMissedFinish: 'extend' },
    result: {},
    milestones: [],
    questReward: '',
    progressPercent: 0,
  };
}

// ── QUEST FORM STATE ──────────────────────────────────────────────────────────

interface QuestFormState {
  name: string;
  description: string;
  completionState: QuestCompletionState;
  targetValue: string;
  unit: string;
  sourceType: 'taskInput' | 'resourceRef';
  taskTemplateRefs: string[];
  conditionType: 'interval' | 'xpThreshold' | 'taskCount' | 'none';
  frequency: RecurrenceFrequency;
  days: Weekday[];
  intervalN: string;
  endsOn: string;
  xpThresholdValue: string;
  onMissedFinish: ExigencyOption;
  attainableText: string;
  relevantText: string;
  resultText: string;
  questReward: string;
}

function questToFormState(q: Quest): QuestFormState {
  return {
    name: q.name,
    description: q.description,
    completionState: q.completionState,
    targetValue: String(q.specific.targetValue),
    unit: q.specific.unit ?? '',
    sourceType: q.specific.sourceType,
    taskTemplateRefs: [...(q.measurable.taskTemplateRefs ?? [])],
    conditionType: q.timely.conditionType,
    frequency: q.timely.interval?.frequency ?? 'weekly',
    days: [...(q.timely.interval?.days ?? [])],
    intervalN: String(q.timely.interval?.interval ?? 1),
    endsOn: q.timely.interval?.endsOn ?? '',
    xpThresholdValue: String(q.timely.xpThreshold ?? ''),
    onMissedFinish: q.exigency.onMissedFinish,
    attainableText: typeof q.attainable['text'] === 'string' ? (q.attainable['text'] as string) : '',
    relevantText: typeof q.relevant['text'] === 'string' ? (q.relevant['text'] as string) : '',
    resultText: typeof q.result['text'] === 'string' ? (q.result['text'] as string) : '',
    questReward: q.questReward,
  };
}

function formStateToQuest(f: QuestFormState, existing: Quest): Quest {
  const isInterval = f.conditionType === 'interval';
  return {
    ...existing,
    name: f.name.trim(),
    description: f.description.trim(),
    completionState: f.completionState,
    specific: {
      targetValue: Math.max(1, parseInt(f.targetValue, 10) || 1),
      unit: f.unit.trim() || null,
      sourceType: f.sourceType,
      resourceRef: existing.specific.resourceRef,
      resourceProperty: existing.specific.resourceProperty,
    },
    measurable: f.taskTemplateRefs.length > 0 ? { taskTemplateRefs: f.taskTemplateRefs } : {},
    attainable: f.attainableText.trim() ? { text: f.attainableText.trim() } : {},
    relevant: f.relevantText.trim() ? { text: f.relevantText.trim() } : {},
    result: f.resultText.trim() ? { text: f.resultText.trim() } : {},
    timely: {
      conditionType: f.conditionType,
      interval: isInterval
        ? {
            frequency: f.frequency,
            days: f.days,
            interval: Math.max(1, parseInt(f.intervalN, 10) || 1),
            endsOn: f.endsOn || null,
            customCondition: null,
          }
        : null,
      xpThreshold: !isInterval ? (parseInt(f.xpThresholdValue, 10) || null) : null,
      markers: existing.timely.markers,
      projectedFinish: existing.timely.projectedFinish,
    },
    exigency: { onMissedFinish: f.onMissedFinish },
    questReward: f.questReward.trim(),
  };
}

// ── MILESTONE RESULT SUMMARY ──────────────────────────────────────────────────

function milestoneResultSummary(resultFields: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(resultFields)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') {
      for (const [nk, nv] of Object.entries(v as Record<string, unknown>)) {
        if (typeof nv === 'number' || typeof nv === 'string' || typeof nv === 'boolean') {
          parts.push(`${nk}: ${nv}`);
        }
      }
    } else {
      parts.push(`${k}: ${v}`);
    }
  }
  return parts.slice(0, 3).join(' · ') || '—';
}

// ── STATUS BADGE ──────────────────────────────────────────────────────────────

function StatusBadge({ state }: { state: QuestCompletionState }) {
  const label = state === 'failed' ? 'skipped' : state;
  const cls =
    state === 'complete'
      ? 'bg-green-100 text-green-600'
      : state === 'failed'
        ? 'bg-red-100 text-red-600'
        : 'bg-blue-100 text-blue-600';
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${cls}`}>{label}</span>
  );
}

// ── PROGRESS BAR ──────────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
      <div
        className="h-full bg-blue-500 rounded-full transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

interface QuestProgressRow {
  label: string;
  checked: boolean;
}

function getQuestTaskTemplateRef(quest: Quest): string | null {
  return quest.timely.markers.find((marker) => marker.activeState)?.taskTemplateRef ??
    quest.timely.markers[0]?.taskTemplateRef ??
    null;
}

function getQuestTaskTemplate(
  templateRef: string,
  taskTemplates: Record<string, TaskTemplate>,
): TaskTemplate | null {
  return taskTemplates[templateRef] ??
    starterTaskTemplates.find((template) => template.id === templateRef) ??
    null;
}

function getQuestTask(
  tasks: Record<string, Task>,
  questRef: string,
  templateRef: string,
): Task | null {
  const matches = Object.values(tasks).filter(
    (task) => task.questRef === questRef && task.templateRef === templateRef,
  );
  if (matches.length === 0) return null;
  return matches.find((task) => task.completionState === 'pending') ??
    matches.find((task) => task.completionState === 'complete') ??
    matches[0] ??
    null;
}

function hasCompletedQuickActionRollToday(
  templateRef: string,
  tasks: Record<string, Task>,
  activeEvents: Record<string, QuickActionsEvent | Event>,
  historyEvents: Record<string, QuickActionsEvent | Event>,
): boolean {
  const today = getAppDate();
  for (const source of [activeEvents, historyEvents]) {
    for (const event of Object.values(source)) {
      if (!('eventType' in event) || event.eventType !== 'quickActions') continue;
      const quickActions = event as QuickActionsEvent;
      if (quickActions.date !== today && quickActions.id !== `qa-${today}`) continue;
      for (const completion of quickActions.completions) {
        const task = tasks[completion.taskRef];
        if (!task) continue;
        if (task.templateRef !== templateRef) continue;
        const result = (task.resultFields as Partial<RollInputFields>).result;
        if (task.completionState === 'complete' && typeof result === 'number') return true;
      }
    }
  }
  return false;
}

function getQuestProgressRows(
  quest: Quest,
  questRef: string,
  tasks: Record<string, Task>,
  taskTemplates: Record<string, TaskTemplate>,
  activeEvents: Record<string, QuickActionsEvent | Event>,
  historyEvents: Record<string, QuickActionsEvent | Event>,
): QuestProgressRow[] {
  const templateRef = getQuestTaskTemplateRef(quest);
  if (!templateRef) return [];

  const template = getQuestTaskTemplate(templateRef, taskTemplates);
  if (!template) return [];

  const task = getQuestTask(tasks, questRef, templateRef);

  if (template.taskType === 'CHECKLIST') {
    const templateItems =
      (template.inputFields as { items?: ChecklistItem[] } | undefined)?.items ?? [];
    const resultItems = (task?.resultFields as { items?: ChecklistItem[] } | undefined)?.items ?? [];
    const checkedByKey = new Map<string, boolean>(
      resultItems.map((item) => [item.key, item.checked === true]),
    );

    const sourceItems = resultItems.length > 0 ? resultItems : templateItems;
    return sourceItems.map((item) => ({
      label: item.label,
      checked: checkedByKey.get(item.key) === true,
    }));
  }

  if (template.taskType === 'CHECK') {
    return [{
      label: template.name,
      checked: task?.completionState === 'complete',
    }];
  }

  if (template.taskType === 'ROLL') {
    return [{
      label: 'Lucky dice rolled today',
      checked: hasCompletedQuickActionRollToday(
        templateRef,
        tasks,
        activeEvents,
        historyEvents,
      ),
    }];
  }

  return [];
}

// ── QUEST FORM SUB-POPUP ──────────────────────────────────────────────────────

interface QuestFormPopupProps {
  initialState: QuestFormState;
  isEdit: boolean;
  onSave: (f: QuestFormState) => void;
  onCancel: () => void;
}

function QuestFormPopup({ initialState, isEdit, onSave, onCancel }: QuestFormPopupProps) {
  const [f, setF] = useState<QuestFormState>(initialState);
  const [error, setError] = useState('');
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);
  const availableTaskTemplates = [
    ...Object.values(taskTemplates),
    ...starterTaskTemplates.filter((template) => template.id && !(template.id in taskTemplates)),
  ];

  function set<K extends keyof QuestFormState>(key: K, value: QuestFormState[K]) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  function toggleTaskTemplateRef(templateRef: string) {
    setF((prev) => ({
      ...prev,
      taskTemplateRefs: prev.taskTemplateRefs.includes(templateRef)
        ? prev.taskTemplateRefs.filter((x) => x !== templateRef)
        : [...prev.taskTemplateRefs, templateRef],
    }));
  }

  function toggleDay(d: Weekday) {
    setF((prev) => ({
      ...prev,
      days: prev.days.includes(d) ? prev.days.filter((x) => x !== d) : [...prev.days, d],
    }));
  }

  function handleSave() {
    if (!f.name.trim()) {
      setError('Name is required.');
      return;
    }
    onSave(f);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-md mx-4 rounded-xl bg-white dark:bg-gray-800 shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3 shrink-0">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            {isEdit ? 'Edit Quest' : 'Add Quest'}
          </h3>
          <button
            type="button"
            aria-label="Cancel"
            onClick={onCancel}
            className="rounded-full p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>
          )}

          {/* Name */}
          <Field label="Name *">
            <input
              type="text"
              value={f.name}
              onChange={(e) => { set('name', e.target.value); setError(''); }}
              placeholder="e.g. Run 5 km three times a week"
              className={inputCls}
            />
          </Field>

          {/* Description */}
          <Field label="Description">
            <textarea
              value={f.description}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
              className={inputCls}
            />
          </Field>

          {/* Status */}
          <Field label="Status">
            <select
              value={f.completionState}
              onChange={(e) => set('completionState', e.target.value as QuestCompletionState)}
              className={selectCls}
            >
              <option value="active">active</option>
              <option value="complete">complete</option>
              <option value="failed">skipped</option>
            </select>
          </Field>

          {/* SMARTER S — specific */}
          <Field label="Target value (SMARTER S)">
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={f.targetValue}
                onChange={(e) => set('targetValue', e.target.value)}
                className={inputCls}
                placeholder="e.g. 12"
              />
              <input
                type="text"
                value={f.unit}
                onChange={(e) => set('unit', e.target.value)}
                className={inputCls}
                placeholder="unit (e.g. km)"
              />
            </div>
          </Field>

          <Field label="Source type">
            <select
              value={f.sourceType}
              onChange={(e) => set('sourceType', e.target.value as 'taskInput' | 'resourceRef')}
              className={selectCls}
            >
              <option value="taskInput">taskInput</option>
              <option value="resourceRef">resourceRef</option>
            </select>
          </Field>

          {/* SMARTER A */}
          <Field label="Attainable — notes (SMARTER A)">
            <textarea
              value={f.attainableText}
              onChange={(e) => set('attainableText', e.target.value)}
              rows={2}
              placeholder="Why is this achievable?"
              className={inputCls}
            />
          </Field>

          {/* SMARTER R */}
          <Field label="Relevant — notes (SMARTER R)">
            <textarea
              value={f.relevantText}
              onChange={(e) => set('relevantText', e.target.value)}
              rows={2}
              placeholder="Why does this matter?"
              className={inputCls}
            />
          </Field>

          {/* SMARTER R2 — result */}
          <Field label="Result — notes (SMARTER R2)">
            <textarea
              value={f.resultText}
              onChange={(e) => set('resultText', e.target.value)}
              rows={2}
              placeholder="What does success look like?"
              className={inputCls}
            />
          </Field>

          {/* SMARTER M — measurable task templates */}
          <Field label="Measurable task templates (SMARTER M)">
            <div className="flex flex-wrap gap-1 mt-0.5">
              {availableTaskTemplates.map((template) => {
                if (!template.id) return null;
                const active = f.taskTemplateRefs.includes(template.id);
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => toggleTaskTemplateRef(template.id!)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      active
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                    }`}
                    title={template.id}
                  >
                    {template.name}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* SMARTER T — timely condition type */}
          <Field label="Condition type (SMARTER T)">
            <select
              value={f.conditionType}
              onChange={(e) => set('conditionType', e.target.value as QuestFormState['conditionType'])}
              className={selectCls}
            >
              <option value="interval">interval</option>
              <option value="xpThreshold">xpThreshold</option>
              <option value="taskCount">taskCount</option>
              <option value="none">none</option>
            </select>
          </Field>

          {f.conditionType === 'interval' && (
            <>
              <Field label="Frequency">
                <select
                  value={f.frequency}
                  onChange={(e) => set('frequency', e.target.value as RecurrenceFrequency)}
                  className={selectCls}
                >
                  <option value="daily">daily</option>
                  <option value="weekly">weekly</option>
                  <option value="monthly">monthly</option>
                  <option value="custom">custom</option>
                </select>
              </Field>

              {f.frequency === 'weekly' && (
                <Field label="Days of week">
                  <div className="flex gap-1 flex-wrap mt-0.5">
                    {WEEKDAYS.map((d) => {
                      const active = f.days.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleDay(d)}
                          className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                            active
                              ? 'bg-blue-500 text-white border-blue-500'
                              : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                          }`}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              )}

              <Field label="Interval (every N periods)">
                <input
                  type="number"
                  min={1}
                  value={f.intervalN}
                  onChange={(e) => set('intervalN', e.target.value)}
                  className={inputCls}
                />
              </Field>

              <Field label="Ends on (optional ISO date)">
                <input
                  type="date"
                  value={f.endsOn}
                  onChange={(e) => set('endsOn', e.target.value)}
                  className={inputCls}
                />
              </Field>
            </>
          )}

          {f.conditionType === 'xpThreshold' && (
            <Field label="XP threshold value">
              <input
                type="number"
                min={1}
                value={f.xpThresholdValue}
                onChange={(e) => set('xpThresholdValue', e.target.value)}
                placeholder="e.g. 1000"
                className={inputCls}
              />
            </Field>
          )}

          {/* SMARTER E — exigency */}
          <Field label="On missed finish (SMARTER E)">
            <select
              value={f.onMissedFinish}
              onChange={(e) => set('onMissedFinish', e.target.value as ExigencyOption)}
              className={selectCls}
            >
              {EXIGENCY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </Field>

          {/* Reward ref */}
          <Field label="Reward ref (optional gear item id)">
            <input
              type="text"
              value={f.questReward}
              onChange={(e) => set('questReward', e.target.value)}
              placeholder="e.g. item_123"
              className={inputCls}
            />
          </Field>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 pb-4 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded-lg bg-blue-500 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            {isEdit ? 'Save' : 'Add Quest'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── QUEST ROW ─────────────────────────────────────────────────────────────────

interface QuestRowProps {
  quest: Quest;
  actId: string;
  chainIndex: number;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}

function QuestRow({
  quest,
  actId,
  chainIndex,
  index,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  confirmingDelete,
  onConfirmDelete,
  onCancelDelete,
}: QuestRowProps) {
  const projected = computeProjectedFinish(quest);
  const questRef = `${actId}|${chainIndex}|${index}`;
  const tasks = useScheduleStore((s) => s.tasks);
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);
  const activeEvents = useScheduleStore((s) => s.activeEvents);
  const historyEvents = useScheduleStore((s) => s.historyEvents);
  const progressRows = getQuestProgressRows(
    quest,
    questRef,
    tasks,
    taskTemplates,
    activeEvents,
    historyEvents,
  );

  const attainableText = typeof quest.attainable['text'] === 'string'
    ? (quest.attainable['text'] as string) : '';
  const relevantText = typeof quest.relevant['text'] === 'string'
    ? (quest.relevant['text'] as string) : '';
  const resultText = typeof quest.result['text'] === 'string'
    ? (quest.result['text'] as string) : '';

  return (
    <div className="rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
      {/* Quest header row */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700">
        <button
          type="button"
          onClick={onToggle}
          aria-label={isExpanded ? 'Collapse quest' : 'Expand quest'}
          className="flex-1 flex items-center gap-2 min-w-0 text-left"
        >
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate flex-1">
            {index + 1}. {quest.name || '(unnamed quest)'}
          </span>
          <StatusBadge state={quest.completionState} />
          <span className="text-gray-400 text-xs shrink-0">{isExpanded ? '▲' : '▼'}</span>
        </button>
        <button
          type="button"
          aria-label="Edit quest"
          onClick={onEdit}
          className="text-xs text-gray-400 hover:text-blue-500 px-1 shrink-0"
        >
          ✏️
        </button>
        {confirmingDelete ? (
          <span className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onConfirmDelete}
              className="text-xs text-red-600 font-medium hover:underline"
            >
              confirm
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              className="text-xs text-gray-400 hover:underline"
            >
              cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            aria-label="Delete quest"
            onClick={onDelete}
            className="text-xs text-gray-400 hover:text-red-500 px-1 shrink-0"
          >
            🗑
          </button>
        )}
      </div>

      {isExpanded && progressRows.length > 0 && (
        <div className="px-3 pt-2 pb-1 bg-gray-50 dark:bg-gray-700 border-t border-gray-100 dark:border-gray-600">
          <div className="space-y-0.5">
            {progressRows.map((row) => (
              <div
                key={row.label}
                className="flex items-center gap-1.5 text-[11px] leading-4 text-gray-600 dark:text-gray-300"
              >
                <span className="shrink-0">{row.checked ? '✅' : '⭕'}</span>
                <span className="truncate">{row.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress bar — always visible */}
      <div className="px-3 pt-1 pb-1 bg-gray-50 dark:bg-gray-700">
        <ProgressBar pct={quest.progressPercent} />
        <div className="flex justify-between mt-0.5">
          <span className="text-xs text-gray-400">{quest.progressPercent}%</span>
          {projected && (
            <span className="text-xs text-gray-400">est. {projected}</span>
          )}
        </div>
      </div>

      {/* Expanded SMARTER detail */}
      {isExpanded && (
        <div className="px-3 py-3 space-y-2 border-t border-gray-100 dark:border-gray-700">
          {quest.specific.targetValue > 0 && (
            <p className="text-xs text-gray-600 dark:text-gray-300">
              <span className="font-medium">Target:</span>{' '}
              {quest.specific.targetValue}
              {quest.specific.unit ? ` ${quest.specific.unit}` : ''}{' '}
              <span className="text-gray-400">({quest.specific.sourceType})</span>
            </p>
          )}
          {(quest.measurable.taskTemplateRefs?.length ?? 0) > 0 && (
            <p className="text-xs text-gray-600 dark:text-gray-300">
              <span className="font-medium">Task templates:</span>{' '}
              {quest.measurable.taskTemplateRefs?.join(', ')}
            </p>
          )}
          <p className="text-xs text-gray-600 dark:text-gray-300">
            <span className="font-medium">Condition:</span>{' '}
            {quest.timely.conditionType}
            {quest.timely.conditionType === 'interval' && quest.timely.interval
              ? ` · ${quest.timely.interval.frequency} ×${quest.timely.interval.interval}`
              : ''}
            {quest.timely.conditionType === 'xpThreshold' && quest.timely.xpThreshold
              ? ` · ${quest.timely.xpThreshold} XP`
              : ''}
          </p>
          {attainableText && (
            <p className="text-xs text-gray-600 dark:text-gray-300">
              <span className="font-medium">Attainable:</span> {attainableText}
            </p>
          )}
          {relevantText && (
            <p className="text-xs text-gray-600 dark:text-gray-300">
              <span className="font-medium">Relevant:</span> {relevantText}
            </p>
          )}
          {resultText && (
            <p className="text-xs text-gray-600 dark:text-gray-300">
              <span className="font-medium">Result:</span> {resultText}
            </p>
          )}
          <p className="text-xs text-gray-600 dark:text-gray-300">
            <span className="font-medium">On missed finish:</span>{' '}
            {quest.exigency.onMissedFinish}
          </p>

          {/* Milestones */}
          <div className="mt-2">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Milestones ({quest.milestones.length})
            </p>
            {quest.milestones.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No milestones yet.</p>
            ) : (
              <div className="space-y-1">
                {quest.milestones.map((ms, mi) => (
                  <div
                    key={mi}
                    className="flex items-start gap-2 text-xs bg-white dark:bg-gray-800 rounded px-2 py-1 border border-gray-100 dark:border-gray-700"
                  >
                    <span className="text-green-500 shrink-0 mt-0.5">✓</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-600 dark:text-gray-300 truncate">
                        {milestoneResultSummary(ms.resultFields as Record<string, unknown>)}
                      </p>
                      <p className="text-gray-400">{ms.completedAt}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CHAIN POPUP ───────────────────────────────────────────────────────────────

interface ChainPopupProps {
  chain: Chain;
  chainIndex: number;
  act: Act;
  onClose: () => void;
}

export function ChainPopup({ chain, chainIndex, act, onClose }: ChainPopupProps) {
  const setAct = useProgressionStore((s) => s.setAct);

  // ── WOOP edit mode ────────────────────────────────────────────────────────
  const [woopEditMode, setWoopEditMode] = useState(false);
  const [woopWish, setWoopWish] = useState(chain.wish);
  const [woopOutcome, setWoopOutcome] = useState(chain.outcome);
  const [woopObstacle, setWoopObstacle] = useState(chain.obstacle);
  const [woopPlanText, setWoopPlanText] = useState(
    typeof chain.plan['text'] === 'string' ? (chain.plan['text'] as string) : '',
  );

  function saveWoop() {
    const updatedChain: Chain = {
      ...chain,
      wish: woopWish,
      outcome: woopOutcome,
      obstacle: woopObstacle,
      plan: woopPlanText.trim() ? { text: woopPlanText.trim() } : {},
    };
    persistChain(updatedChain);
    setWoopEditMode(false);
  }

  // ── Quest expand state ────────────────────────────────────────────────────
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // ── Quest form state ──────────────────────────────────────────────────────
  const [questFormOpen, setQuestFormOpen] = useState(false);
  const [editQuestIdx, setEditQuestIdx] = useState<number | null>(null);
  const [questFormInitial, setQuestFormInitial] = useState<QuestFormState | null>(null);

  // ── Delete confirm ────────────────────────────────────────────────────────
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);

  // ── Local chain copy (mutable for optimistic UI) ──────────────────────────
  const [localChain, setLocalChain] = useState<Chain>(chain);

  function persistChain(updated: Chain) {
    setLocalChain(updated);
    const updatedChains = [...act.chains];
    updatedChains[chainIndex] = updated;
    const updatedAct: Act = { ...act, chains: updatedChains };
    setAct(updatedAct);
  }

  // ── Add quest ─────────────────────────────────────────────────────────────
  function openAddQuest() {
    setEditQuestIdx(null);
    setQuestFormInitial(questToFormState(blankQuest()));
    setQuestFormOpen(true);
  }

  // ── Edit quest ────────────────────────────────────────────────────────────
  function openEditQuest(idx: number) {
    const q = localChain.quests[idx];
    if (!q) return;
    setEditQuestIdx(idx);
    setQuestFormInitial(questToFormState(q));
    setQuestFormOpen(true);
  }

  // ── Save quest form ───────────────────────────────────────────────────────
  function handleQuestFormSave(f: QuestFormState) {
    if (editQuestIdx !== null) {
      // Edit in place
      const existing = localChain.quests[editQuestIdx];
      if (!existing) return;
      const updated: Quest = formStateToQuest(f, existing);
      const updatedQuests = [...localChain.quests];
      updatedQuests[editQuestIdx] = updated;
      persistChain({ ...localChain, quests: updatedQuests });
    } else {
      // New quest
      const updated: Quest = formStateToQuest(f, blankQuest());
      persistChain({ ...localChain, quests: [...localChain.quests, updated] });
    }
    setQuestFormOpen(false);
    setEditQuestIdx(null);
    setQuestFormInitial(null);
  }

  // ── Delete quest ──────────────────────────────────────────────────────────
  function requestDelete(idx: number) {
    if (confirmDeleteIdx === idx) {
      // Second tap — confirm
      const updatedQuests = localChain.quests.filter((_, i) => i !== idx);
      persistChain({ ...localChain, quests: updatedQuests });
      setConfirmDeleteIdx(null);
      if (expandedIdx === idx) setExpandedIdx(null);
      else if (expandedIdx !== null && expandedIdx > idx) setExpandedIdx(expandedIdx - 1);
    } else {
      setConfirmDeleteIdx(idx);
    }
  }

  return (
    <>
      {/* Main popup */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="relative w-full max-w-lg mx-4 rounded-xl bg-white dark:bg-gray-800 shadow-xl flex flex-col max-h-[90vh]">

          {/* Header */}
          <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 px-4 py-3 shrink-0">
            <span className="text-xl shrink-0">{localChain.icon || '⛓️'}</span>
            <h3 className="flex-1 text-base font-semibold text-gray-800 dark:text-gray-100 truncate">
              {localChain.name}
            </h3>
            <span
              className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                localChain.completionState === 'complete'
                  ? 'bg-green-100 text-green-600'
                  : 'bg-blue-100 text-blue-600'
              }`}
            >
              {localChain.completionState}
            </span>
            <button
              type="button"
              aria-label={woopEditMode ? 'Cancel WOOP edit' : 'Edit WOOP fields'}
              onClick={() => {
                if (woopEditMode) {
                  // Reset to saved values
                  setWoopWish(localChain.wish);
                  setWoopOutcome(localChain.outcome);
                  setWoopObstacle(localChain.obstacle);
                  setWoopPlanText(
                    typeof localChain.plan['text'] === 'string'
                      ? (localChain.plan['text'] as string)
                      : '',
                  );
                }
                setWoopEditMode((e) => !e);
              }}
              className="text-xs text-gray-400 hover:text-blue-500 px-1 shrink-0"
            >
              {woopEditMode ? '✕' : '✏️'}
            </button>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-full p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">

            {/* WOOP fields */}
            <div className="rounded-lg bg-blue-50 dark:bg-gray-700 p-3 space-y-2">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-300 uppercase tracking-wide">
                WOOP
              </p>
              {woopEditMode ? (
                <>
                  <Field label="Wish">
                    <input
                      type="text"
                      value={woopWish}
                      onChange={(e) => setWoopWish(e.target.value)}
                      className={inputCls}
                      placeholder="Your wish / exaggerated intention"
                    />
                  </Field>
                  <Field label="Outcome">
                    <textarea
                      value={woopOutcome}
                      onChange={(e) => setWoopOutcome(e.target.value)}
                      rows={2}
                      className={inputCls}
                      placeholder="Best outcome — mental imagery"
                    />
                  </Field>
                  <Field label="Obstacle">
                    <textarea
                      value={woopObstacle}
                      onChange={(e) => setWoopObstacle(e.target.value)}
                      rows={2}
                      className={inputCls}
                      placeholder="Main internal obstacle"
                    />
                  </Field>
                  <Field label="Plan">
                    <textarea
                      value={woopPlanText}
                      onChange={(e) => setWoopPlanText(e.target.value)}
                      rows={2}
                      className={inputCls}
                      placeholder="If obstacle, then plan…"
                    />
                  </Field>
                  <button
                    type="button"
                    onClick={saveWoop}
                    className="w-full rounded-lg bg-blue-500 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
                  >
                    Save WOOP
                  </button>
                </>
              ) : (
                <>
                  {localChain.wish && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Wish</p>
                      <p className="text-sm text-gray-700 dark:text-gray-200">{localChain.wish}</p>
                    </div>
                  )}
                  {localChain.outcome && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Outcome</p>
                      <p className="text-sm text-gray-700 dark:text-gray-200">{localChain.outcome}</p>
                    </div>
                  )}
                  {localChain.obstacle && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Obstacle</p>
                      <p className="text-sm text-gray-700 dark:text-gray-200">{localChain.obstacle}</p>
                    </div>
                  )}
                  {woopPlanText && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Plan</p>
                      <p className="text-sm text-gray-700 dark:text-gray-200">{woopPlanText}</p>
                    </div>
                  )}
                  {!localChain.wish && !localChain.outcome && !localChain.obstacle && !woopPlanText && (
                    <p className="text-xs text-gray-400 italic">No WOOP fields set — tap ✏️ to add.</p>
                  )}
                </>
              )}
            </div>

            {/* Quest list */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Quests ({localChain.quests.length})
                </p>
                <button
                  type="button"
                  onClick={openAddQuest}
                  className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                >
                  + Add Quest
                </button>
              </div>

              {localChain.quests.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No quests — tap + Add Quest.</p>
              ) : (
                <div className="space-y-2">
                  {localChain.quests.map((q, i) => (
                    <QuestRow
                      key={i}
                      quest={q}
                      actId={act.id}
                      chainIndex={chainIndex}
                      index={i}
                      isExpanded={expandedIdx === i}
                      onToggle={() => setExpandedIdx((prev) => (prev === i ? null : i))}
                      onEdit={() => openEditQuest(i)}
                      onDelete={() => requestDelete(i)}
                      confirmingDelete={confirmDeleteIdx === i}
                      onConfirmDelete={() => requestDelete(i)}
                      onCancelDelete={() => setConfirmDeleteIdx(null)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-4 pb-4 shrink-0 border-t border-gray-200 dark:border-gray-700 pt-3">
            <button
              type="button"
              onClick={openAddQuest}
              className="flex-1 rounded-lg border border-blue-500 py-2 text-sm font-medium text-blue-500 hover:bg-blue-50 dark:hover:bg-gray-700"
            >
              + Add Quest
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg bg-gray-100 dark:bg-gray-700 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Quest form sub-popup */}
      {questFormOpen && questFormInitial !== null && (
        <QuestFormPopup
          initialState={questFormInitial}
          isEdit={editQuestIdx !== null}
          onSave={handleQuestFormSave}
          onCancel={() => {
            setQuestFormOpen(false);
            setEditQuestIdx(null);
            setQuestFormInitial(null);
          }}
        />
      )}
    </>
  );
}
