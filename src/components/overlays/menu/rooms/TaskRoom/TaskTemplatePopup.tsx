import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getTaskTypeIconKey, normalizeTaskTemplateIconKey } from '../../../../../constants/iconMap';
import { itemLibrary } from '../../../../../coach/ItemLibrary';
import { PopupShell } from '../../../../shared/popups/PopupShell';
import { IconPicker } from '../../../../shared/IconPicker';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../../stores/useUserStore';
import { normalizeCircuitInputFields, type ChecklistItem, type CircuitInputFields, type CircuitStep, type CircuitStepType, type ConsumeEntry, type ConsumeInputFields, type FormField, type InputFields, type TaskSecondaryTag, type TaskTemplate, type TaskType } from '../../../../../types';
import type { StatGroupKey } from '../../../../../types/user';
import type { InventoryItemTemplate } from '../../../../../types/resource';
import { getLibraryItem, getUserInventoryItemTemplates, mergeInventoryItemTemplates } from '../../../../../utils/inventoryItems';

const TASK_TYPES: TaskType[] = [
  'CHECK',
  'COUNTER',
  'SETS_REPS',
  'CIRCUIT',
  'DURATION',
  'TIMER',
  'RATING',
  'TEXT',
  'FORM',
  'CHOICE',
  'CHECKLIST',
  'SCAN',
  'LOG',
  'LOCATION_POINT',
  'LOCATION_TRAIL',
  'ROLL',
  'CONSUME',
];

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  CHECK: 'Check',
  COUNTER: 'Counter',
  SETS_REPS: 'Sets & Reps',
  CIRCUIT: 'Circuit',
  DURATION: 'Duration',
  TIMER: 'Timer',
  RATING: 'Rating',
  TEXT: 'Text',
  FORM: 'Form',
  CHOICE: 'Choice',
  CHECKLIST: 'Checklist',
  SCAN: 'Scan',
  LOG: 'Log',
  LOCATION_POINT: 'Location Point',
  LOCATION_TRAIL: 'Location Trail',
  ROLL: 'Roll',
  CONSUME: 'Consume',
};

const SECONDARY_TAGS: TaskSecondaryTag[] = [
  'fitness',
  'health',
  'nutrition',
  'mindfulness',
  'home',
  'admin',
  'finance',
  'social',
  'learning',
];

const STAT_GROUPS: { key: StatGroupKey; label: string }[] = [
  { key: 'health', label: 'Health' },
  { key: 'strength', label: 'Strength' },
  { key: 'agility', label: 'Agility' },
  { key: 'defense', label: 'Defense' },
  { key: 'charisma', label: 'Charisma' },
  { key: 'wisdom', label: 'Wisdom' },
];

const CIRCUIT_STEP_TYPES: CircuitStepType[] = ['CHECK', 'CHOICE', 'COUNTER', 'DURATION', 'TIMER', 'RATING', 'TEXT', 'SCAN'];

function makeDefaultCircuitStep(stepType: CircuitStepType = 'CHECK'): CircuitStep {
  switch (stepType) {
    case 'CHOICE':
      return {
        id: uuidv4(),
        label: '',
        stepType,
        options: ['Pass', 'Fail'],
        required: true,
      };
    case 'COUNTER':
      return {
        id: uuidv4(),
        label: '',
        stepType,
        target: 1,
        unit: '',
        required: true,
      };
    case 'DURATION':
      return {
        id: uuidv4(),
        label: '',
        stepType,
        target: 5,
        required: true,
      };
    case 'TIMER':
      return {
        id: uuidv4(),
        label: '',
        stepType,
        seconds: 60,
        required: true,
      };
    case 'RATING':
      return {
        id: uuidv4(),
        label: '',
        stepType,
        scale: 5,
        required: true,
      };
    default:
      return {
        id: uuidv4(),
        label: '',
        stepType,
        required: true,
      };
  }
}

function applyCircuitStepTypeDefaults(step: CircuitStep, stepType: CircuitStepType): CircuitStep {
  const base: CircuitStep = {
    id: step.id,
    label: step.label,
    stepType,
    required: step.required ?? true,
  };

  switch (stepType) {
    case 'CHOICE':
      return { ...base, options: step.options && step.options.length > 0 ? step.options : ['Pass', 'Fail'] };
    case 'COUNTER':
      return { ...base, target: step.target ?? 1, unit: step.unit ?? '' };
    case 'DURATION':
      return { ...base, target: step.target ?? 5 };
    case 'TIMER':
      return { ...base, seconds: step.seconds ?? 60 };
    case 'RATING':
      return { ...base, scale: step.scale ?? 5 };
    default:
      return base;
  }
}

function defaultInputFields(taskType: TaskType): InputFields {
  switch (taskType) {
    case 'CHECK':
      return { label: 'Done' };
    case 'COUNTER':
      return { target: 10, unit: 'count', step: 1 };
    case 'SETS_REPS':
      return { sets: 3, reps: 10, weight: null, weightUnit: 'kg', restAfter: null, dropSet: false };
    case 'CIRCUIT':
      return { label: 'Circuit', steps: [], rounds: 3, restBetweenRounds: null };
    case 'DURATION':
      return { targetDuration: 1800, unit: 'seconds' };
    case 'TIMER':
      return { countdownFrom: 300 };
    case 'RATING':
      return { scale: 5, label: 'Rate this' };
    case 'TEXT':
      return { prompt: 'Enter your response', maxLength: null };
    case 'FORM':
      return { fields: [] };
    case 'CHOICE':
      return { options: ['Option A', 'Option B'], multiSelect: false };
    case 'CHECKLIST':
      return { items: [], requireAll: false };
    case 'SCAN':
      return { scanType: 'barcode' };
    case 'LOG':
      return { prompt: null };
    case 'LOCATION_POINT':
      return { label: 'Mark location', captureAccuracy: true };
    case 'LOCATION_TRAIL':
      return { label: 'Record trail', captureInterval: null };
    case 'ROLL':
      return { sides: 6 };
    case 'CONSUME':
      return { label: 'Consume items', entries: [] };
  }
}

function buildXpAward(statGroup: StatGroupKey, xpValue: number) {
  return {
    health: 0,
    strength: 0,
    agility: 0,
    defense: 0,
    charisma: 0,
    wisdom: 0,
    [statGroup]: xpValue,
  };
}


function inputClassName(disabled: boolean) {
  return `w-full rounded-xl border px-3 py-2 text-sm focus:outline-none ${
    disabled
      ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500'
      : 'border-gray-300 bg-white text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
  }`;
}

interface TaskTemplatePopupProps {
  editKey: string | null;
  editTemplate: TaskTemplate | null;
  onClose: () => void;
  readOnly?: boolean;
}

export function TaskTemplatePopup({
  editKey,
  editTemplate,
  onClose,
  readOnly = false,
}: TaskTemplatePopupProps) {
  const setTaskTemplate = useScheduleStore((s) => s.setTaskTemplate);
  const user = useUserStore((s) => s.user);
  const isEditMode = editKey !== null && editTemplate !== null;

  const initialStatGroup: StatGroupKey = (() => {
    if (!isEditMode || !editTemplate) return 'health';
    const groups: StatGroupKey[] = ['health', 'strength', 'agility', 'defense', 'charisma', 'wisdom'];
    return groups.find((group) => editTemplate.xpAward[group] > 0) ?? 'health';
  })();

  const initialXpValue = isEditMode && editTemplate ? editTemplate.xpAward[initialStatGroup] : 5;

  const [name, setName] = useState(isEditMode && editTemplate ? editTemplate.name : '');
  const [taskType, setTaskType] = useState<TaskType>(isEditMode && editTemplate ? editTemplate.taskType : 'CHECK');
  const [icon, setIcon] = useState(
    isEditMode && editTemplate
      ? normalizeTaskTemplateIconKey(editTemplate.icon, editTemplate.taskType)
      : getTaskTypeIconKey('CHECK'),
  );
  const [secondaryTag, setSecondaryTag] = useState<TaskSecondaryTag | ''>(
    isEditMode && editTemplate ? (editTemplate.secondaryTag ?? '') : '',
  );
  const [statGroup, setStatGroup] = useState<StatGroupKey>(initialStatGroup);
  const [xpValue, _setXpValue] = useState<number | ''>(initialXpValue);
  const [cooldown, setCooldown] = useState<number | ''>(
    isEditMode && editTemplate && editTemplate.cooldown !== null ? editTemplate.cooldown : '',
  );
  const [description, setDescription] = useState(isEditMode && editTemplate ? editTemplate.description : '');
  const [inputFields, setInputFields] = useState<InputFields>(
    isEditMode && editTemplate
      ? (editTemplate.taskType === 'CIRCUIT' ? normalizeCircuitInputFields(editTemplate.inputFields as CircuitInputFields) : editTemplate.inputFields)
      : defaultInputFields(taskType),
  );
  const [error, setError] = useState('');
  const [expandedCircuitStepId, setExpandedCircuitStepId] = useState<string | null>(null);
  const availableConsumeTemplates = useMemo<InventoryItemTemplate[]>(() => (
    mergeInventoryItemTemplates(
      getUserInventoryItemTemplates(user),
      itemLibrary
        .map((item) => getLibraryItem(item.id))
        .filter((item): item is InventoryItemTemplate => item != null),
    )
  ), [user]);

  function updateField(key: string, value: unknown) {
    setInputFields((prev) => ({ ...prev, [key]: value }));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = inputFields as Record<string, any>;

  function labeledRow(label: string, input: ReactNode) {
    return (
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
        {input}
      </div>
    );
  }

  function textInput(fieldKey: string, placeholder?: string) {
    return (
      <input type="text" value={f[fieldKey] ?? ''} onChange={(e) => updateField(fieldKey, e.target.value)}
        disabled={readOnly} placeholder={placeholder} className={inputClassName(readOnly)} />
    );
  }

  function numInput(fieldKey: string, placeholder?: string, min?: number) {
    return (
      <input type="number" value={f[fieldKey] ?? ''} min={min}
        onChange={(e) => updateField(fieldKey, e.target.value === '' ? null : Number(e.target.value))}
        disabled={readOnly} placeholder={placeholder} className={inputClassName(readOnly)} />
    );
  }

  function checkBox(fieldKey: string, label: string) {
    return (
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
        <input type="checkbox" checked={!!f[fieldKey]} onChange={(e) => updateField(fieldKey, e.target.checked)}
          disabled={readOnly} className="rounded border-gray-300" />
        {label}
      </label>
    );
  }

  function stringArrayEditor(fieldKey: string, items: string[], placeholder: string) {
    return (
      <div className="space-y-1.5">
        {items.map((item, idx) => (
          <div key={idx} className="flex gap-2">
            <input type="text" value={item} disabled={readOnly} placeholder={placeholder}
              onChange={(e) => { const next = [...items]; next[idx] = e.target.value; updateField(fieldKey, next); }}
              className={`flex-1 ${inputClassName(readOnly)}`} />
            {!readOnly && (
              <button type="button" onClick={() => updateField(fieldKey, items.filter((_, i) => i !== idx))}
                className="px-1 text-xs text-gray-400 hover:text-red-400">×</button>
            )}
          </div>
        ))}
        {!readOnly && (
          <button type="button" onClick={() => updateField(fieldKey, [...items, ''])}
            className="text-xs font-medium text-blue-500 hover:text-blue-600">+ Add</button>
        )}
      </div>
    );
  }

  function renderInputFields(): ReactNode {
    switch (taskType) {
      case 'CHECK':
        return labeledRow('Label', textInput('label', 'Done'));

      case 'COUNTER':
        return (
          <div className="grid grid-cols-3 gap-3">
            {labeledRow('Target', numInput('target', '10', 1))}
            {labeledRow('Step', numInput('step', '1', 0.01))}
            {labeledRow('Unit', textInput('unit', 'count'))}
          </div>
        );

      case 'SETS_REPS':
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {labeledRow('Sets', numInput('sets', '3', 1))}
              {labeledRow('Reps', numInput('reps', '10', 1))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {labeledRow('Weight (optional)', numInput('weight', 'None', 0))}
              {labeledRow('Weight unit', (
                <select value={f.weightUnit ?? 'kg'} onChange={(e) => updateField('weightUnit', e.target.value)}
                  disabled={readOnly} className={inputClassName(readOnly)}>
                  <option value="kg">kg</option>
                  <option value="lbs">lbs</option>
                </select>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {labeledRow('Rest after set (sec)', numInput('restAfter', 'None', 0))}
              <div className="flex items-end pb-2">{checkBox('dropSet', 'Drop set')}</div>
            </div>
          </div>
        );

      case 'CIRCUIT': {
        const circuitFields = normalizeCircuitInputFields(inputFields as CircuitInputFields);

        function setCircuitFields(next: CircuitInputFields) {
          setInputFields(next);
        }

        function updateCircuitStep(stepId: string, patch: Partial<CircuitStep>) {
          setCircuitFields({
            ...circuitFields,
            steps: circuitFields.steps.map((step) => step.id === stepId ? { ...step, ...patch } : step),
          });
        }

        function moveStep(stepIndex: number, dir: -1 | 1) {
          const next = [...circuitFields.steps];
          const swapIndex = stepIndex + dir;
          if (swapIndex < 0 || swapIndex >= next.length) return;
          [next[stepIndex], next[swapIndex]] = [next[swapIndex], next[stepIndex]];
          setCircuitFields({ ...circuitFields, steps: next });
        }

        function addStep() {
          const newStep = makeDefaultCircuitStep();
          setCircuitFields({ ...circuitFields, steps: [...circuitFields.steps, newStep] });
          setExpandedCircuitStepId(newStep.id);
        }

        return (
          <div className="space-y-3">
            {labeledRow('Circuit label', (
              <input
                type="text"
                value={circuitFields.label}
                onChange={(e) => setCircuitFields({ ...circuitFields, label: e.target.value })}
                disabled={readOnly}
                placeholder="e.g. Pre-drive safety circuit"
                className={inputClassName(readOnly)}
              />
            ))}
            <div className="grid grid-cols-2 gap-3">
              {labeledRow('Rounds', (
                <input
                  type="number"
                  value={circuitFields.rounds}
                  min={1}
                  onChange={(e) => setCircuitFields({ ...circuitFields, rounds: Math.max(1, Number(e.target.value) || 1) })}
                  disabled={readOnly}
                  className={inputClassName(readOnly)}
                />
              ))}
              {labeledRow('Rest between rounds (sec)', (
                <input
                  type="number"
                  value={circuitFields.restBetweenRounds ?? ''}
                  min={0}
                  onChange={(e) => setCircuitFields({ ...circuitFields, restBetweenRounds: e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0) })}
                  disabled={readOnly}
                  placeholder="None"
                  className={inputClassName(readOnly)}
                />
              ))}
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Steps</label>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={addStep}
                    className="text-xs font-medium text-blue-500 hover:text-blue-600"
                  >
                    + Add step
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {circuitFields.steps.length === 0 && (
                  <p className="rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                    No circuit steps yet.
                  </p>
                )}
                {circuitFields.steps.map((step, idx) => {
                  const isExpanded = expandedCircuitStepId === step.id;
                  return (
                    <div key={step.id} className="rounded-xl border border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-900/40">
                      <div className="flex items-start gap-2">
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={readOnly || idx === 0}
                            onClick={() => moveStep(idx, -1)}
                            className="flex h-5 w-5 items-center justify-center rounded text-xs leading-none text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-700"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            disabled={readOnly || idx === circuitFields.steps.length - 1}
                            onClick={() => moveStep(idx, 1)}
                            className="flex h-5 w-5 items-center justify-center rounded text-xs leading-none text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-700"
                          >
                            ▼
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedCircuitStepId((prev) => prev === step.id ? null : step.id)}
                          className="flex flex-1 items-center justify-between gap-3 text-left"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{step.label.trim() || 'Untitled step'}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{step.stepType}</p>
                          </div>
                          <span className="text-xs font-medium text-blue-500">{isExpanded ? 'Close' : 'Edit'}</span>
                        </button>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => {
                              setCircuitFields({ ...circuitFields, steps: circuitFields.steps.filter((entry) => entry.id !== step.id) });
                              setExpandedCircuitStepId((prev) => prev === step.id ? null : prev);
                            }}
                            className="shrink-0 px-1 text-sm text-gray-400 hover:text-red-400"
                          >
                            ×
                          </button>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="mt-3 space-y-3 border-t border-gray-200 pt-3 dark:border-gray-700">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Label</label>
                              <input
                                type="text"
                                value={step.label}
                                onChange={(e) => updateCircuitStep(step.id, { label: e.target.value })}
                                disabled={readOnly}
                                placeholder="Step label"
                                className={inputClassName(readOnly)}
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Step type</label>
                              <select
                                value={step.stepType}
                                onChange={(e) => updateCircuitStep(step.id, applyCircuitStepTypeDefaults(step, e.target.value as CircuitStepType))}
                                disabled={readOnly}
                                className={inputClassName(readOnly)}
                              >
                                {CIRCUIT_STEP_TYPES.map((type) => (
                                  <option key={type} value={type}>{type}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={step.required ?? true}
                              onChange={(e) => updateCircuitStep(step.id, { required: e.target.checked })}
                              disabled={readOnly}
                              className="rounded border-gray-300"
                            />
                            Required step
                          </label>

                          {step.stepType === 'CHOICE' && (
                            <div className="space-y-2">
                              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Options</label>
                              {(step.options ?? []).map((option, optionIndex) => (
                                <div key={`${step.id}-option-${optionIndex}`} className="flex gap-2">
                                  <input
                                    type="text"
                                    value={option}
                                    onChange={(e) => {
                                      const nextOptions = [...(step.options ?? [])];
                                      nextOptions[optionIndex] = e.target.value;
                                      updateCircuitStep(step.id, { options: nextOptions });
                                    }}
                                    disabled={readOnly}
                                    className={`flex-1 ${inputClassName(readOnly)}`}
                                  />
                                  {!readOnly && (
                                    <button
                                      type="button"
                                      onClick={() => updateCircuitStep(step.id, { options: (step.options ?? []).filter((_, idx2) => idx2 !== optionIndex) })}
                                      className="px-1 text-xs text-gray-400 hover:text-red-400"
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                              ))}
                              {!readOnly && (
                                <button
                                  type="button"
                                  onClick={() => updateCircuitStep(step.id, { options: [...(step.options ?? []), ''] })}
                                  className="text-xs font-medium text-blue-500 hover:text-blue-600"
                                >
                                  + Add option
                                </button>
                              )}
                            </div>
                          )}

                          {step.stepType === 'RATING' && labeledRow('Scale', (
                            <input
                              type="number"
                              value={step.scale ?? 5}
                              min={2}
                              onChange={(e) => updateCircuitStep(step.id, { scale: Math.max(2, Number(e.target.value) || 5) })}
                              disabled={readOnly}
                              className={inputClassName(readOnly)}
                            />
                          ))}

                          {step.stepType === 'COUNTER' && (
                            <div className="grid grid-cols-2 gap-3">
                              {labeledRow('Target', (
                                <input
                                  type="number"
                                  value={step.target ?? 1}
                                  min={1}
                                  onChange={(e) => updateCircuitStep(step.id, { target: Math.max(1, Number(e.target.value) || 1) })}
                                  disabled={readOnly}
                                  className={inputClassName(readOnly)}
                                />
                              ))}
                              {labeledRow('Unit', (
                                <input
                                  type="text"
                                  value={step.unit ?? ''}
                                  onChange={(e) => updateCircuitStep(step.id, { unit: e.target.value })}
                                  disabled={readOnly}
                                  placeholder="Optional"
                                  className={inputClassName(readOnly)}
                                />
                              ))}
                            </div>
                          )}

                          {step.stepType === 'DURATION' && labeledRow('Target minutes', (
                            <input
                              type="number"
                              value={step.target ?? 5}
                              min={1}
                              onChange={(e) => updateCircuitStep(step.id, { target: Math.max(1, Number(e.target.value) || 1) })}
                              disabled={readOnly}
                              className={inputClassName(readOnly)}
                            />
                          ))}

                          {step.stepType === 'TIMER' && labeledRow('Seconds', (
                            <input
                              type="number"
                              value={step.seconds ?? 60}
                              min={1}
                              onChange={(e) => updateCircuitStep(step.id, { seconds: Math.max(1, Number(e.target.value) || 1) })}
                              disabled={readOnly}
                              className={inputClassName(readOnly)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      }

      case 'DURATION':
        return (
          <div className="grid grid-cols-2 gap-3">
            {labeledRow('Target duration', numInput('targetDuration', '0', 1))}
            {labeledRow('Unit', (
              <select value={f.unit ?? 'seconds'} onChange={(e) => updateField('unit', e.target.value)}
                disabled={readOnly} className={inputClassName(readOnly)}>
                <option value="seconds">Seconds</option>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
              </select>
            ))}
          </div>
        );

      case 'TIMER':
        return labeledRow('Countdown (seconds)', numInput('countdownFrom', '300', 1));

      case 'RATING':
        return (
          <div className="grid grid-cols-2 gap-3">
            {labeledRow('Scale (max)', numInput('scale', '5', 2))}
            {labeledRow('Label', textInput('label', 'Rate this'))}
          </div>
        );

      case 'TEXT':
        return (
          <div className="space-y-3">
            {labeledRow('Prompt', textInput('prompt', 'Enter your response'))}
            {labeledRow('Max length (optional)', numInput('maxLength', 'None', 1))}
          </div>
        );

      case 'FORM': {
        const formFields: FormField[] = f.fields ?? [];
        return (
          <div className="space-y-1.5">
            {formFields.map((field, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                <input type="text" value={field.label} disabled={readOnly} placeholder="Field label"
                  onChange={(e) => { const next = [...formFields]; next[idx] = { ...field, label: e.target.value }; updateField('fields', next); }}
                  className={inputClassName(readOnly)} />
                <select value={field.fieldType} disabled={readOnly}
                  onChange={(e) => { const next = [...formFields]; next[idx] = { ...field, fieldType: e.target.value as FormField['fieldType'] }; updateField('fields', next); }}
                  className={`${inputClassName(readOnly)} w-28`}>
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="date">Date</option>
                </select>
                {!readOnly && (
                  <button type="button" onClick={() => updateField('fields', formFields.filter((_, i) => i !== idx))}
                    className="px-1 text-xs text-gray-400 hover:text-red-400">×</button>
                )}
              </div>
            ))}
            {!readOnly && (
              <button type="button"
                onClick={() => updateField('fields', [...formFields, { key: uuidv4(), label: '', fieldType: 'text' as const }])}
                className="text-xs font-medium text-blue-500 hover:text-blue-600">+ Add field</button>
            )}
          </div>
        );
      }

      case 'CHOICE':
        return (
          <div className="space-y-3">
            {checkBox('multiSelect', 'Allow multiple selections')}
            {labeledRow('Options', stringArrayEditor('options', f.options ?? [], 'Option'))}
          </div>
        );

      case 'CHECKLIST': {
        const clItems: ChecklistItem[] = f.items ?? [];
        return (
          <div className="space-y-3">
            {checkBox('requireAll', 'Require all items to complete')}
            {labeledRow('Items', (
              <div className="space-y-1.5">
                {clItems.map((item, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input type="text" value={item.label} disabled={readOnly} placeholder="Item label"
                      onChange={(e) => { const next = [...clItems]; next[idx] = { ...next[idx], label: e.target.value }; updateField('items', next); }}
                      className={`flex-1 ${inputClassName(readOnly)}`} />
                    {!readOnly && (
                      <button type="button" onClick={() => updateField('items', clItems.filter((_, i) => i !== idx))}
                        className="px-1 text-xs text-gray-400 hover:text-red-400">×</button>
                    )}
                  </div>
                ))}
                {!readOnly && (
                  <button type="button"
                    onClick={() => updateField('items', [...clItems, { key: uuidv4(), label: '' }])}
                    className="text-xs font-medium text-blue-500 hover:text-blue-600">+ Add item</button>
                )}
              </div>
            ))}
          </div>
        );
      }

      case 'SCAN':
        return labeledRow('Scan type', (
          <select value={f.scanType ?? 'barcode'} onChange={(e) => updateField('scanType', e.target.value)}
            disabled={readOnly} className={inputClassName(readOnly)}>
            <option value="barcode">Barcode</option>
            <option value="qr">QR Code</option>
            <option value="text">Text</option>
          </select>
        ));

      case 'LOG':
        return labeledRow('Prompt (optional)', textInput('prompt', 'Open-ended log entry'));

      case 'LOCATION_POINT':
        return (
          <div className="space-y-3">
            {labeledRow('Label', textInput('label', 'Mark location'))}
            {checkBox('captureAccuracy', 'Capture accuracy')}
          </div>
        );

      case 'LOCATION_TRAIL':
        return (
          <div className="space-y-3">
            {labeledRow('Label', textInput('label', 'Record trail'))}
            {labeledRow('Capture interval (sec, optional)', numInput('captureInterval', 'Manual', 1))}
          </div>
        );

      case 'ROLL':
        return labeledRow('Sides', (
          <select value={f.sides ?? 6} onChange={(e) => updateField('sides', Number(e.target.value))}
            disabled={readOnly} className={inputClassName(readOnly)}>
            {[4, 6, 8, 10, 12, 20, 100].map((n) => <option key={n} value={n}>d{n}</option>)}
          </select>
        ));

      case 'CONSUME': {
        const consumeFields = inputFields as ConsumeInputFields;
        const entries = consumeFields.entries ?? [];

        function setConsumeFields(next: ConsumeInputFields) {
          setInputFields(next);
        }

        function updateConsumeEntry(index: number, patch: Partial<ConsumeEntry>) {
          const nextEntries = entries.map((entry, entryIndex) => (
            entryIndex === index ? { ...entry, ...patch } : entry
          ));
          setConsumeFields({ ...consumeFields, entries: nextEntries });
        }

        function addConsumeEntry() {
          setConsumeFields({
            ...consumeFields,
            entries: [
              ...entries,
              {
                itemTemplateRef: '',
                quantity: 1,
              },
            ],
          });
        }

        function removeConsumeEntry(index: number) {
          setConsumeFields({
            ...consumeFields,
            entries: entries.filter((_, entryIndex) => entryIndex !== index),
          });
        }

        return (
          <div className="space-y-3">
            {labeledRow('Label', (
              <input
                type="text"
                value={consumeFields.label}
                onChange={(e) => setConsumeFields({ ...consumeFields, label: e.target.value })}
                disabled={readOnly}
                placeholder="Consume items"
                className={inputClassName(readOnly)}
              />
            ))}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Entries</label>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={addConsumeEntry}
                    className="text-xs font-medium text-blue-500 hover:text-blue-600"
                  >
                    + Add entry
                  </button>
                )}
              </div>
              {entries.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                  No consume entries yet.
                </p>
              ) : null}
              {entries.map((entry, index) => (
                <div key={`consume-entry-${index}`} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-end gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-900/40">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Item</label>
                    <select
                      value={entry.itemTemplateRef}
                      onChange={(e) => updateConsumeEntry(index, { itemTemplateRef: e.target.value })}
                      disabled={readOnly}
                      className={inputClassName(readOnly)}
                    >
                      <option value="">Select item</option>
                      {availableConsumeTemplates.map((template) => (
                        <option key={template.id} value={template.id}>{template.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Quantity</label>
                    <input
                      type="number"
                      value={entry.quantity}
                      min={1}
                      onChange={(e) => updateConsumeEntry(index, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                      disabled={readOnly}
                      className={inputClassName(readOnly)}
                    />
                  </div>
                  {!readOnly ? (
                    <button
                      type="button"
                      onClick={() => removeConsumeEntry(index)}
                      className="px-1 pb-2 text-sm text-gray-400 hover:text-red-400"
                    >
                      ×
                    </button>
                  ) : <div />}
                </div>
              ))}
            </div>
          </div>
        );
      }

        return null;
    }
  }

  function handleSave() {
    if (readOnly) return;
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (xpValue === '' || xpValue <= 0) {
      setError('XP value must be greater than 0.');
      return;
    }

    const normalizedInputFields = taskType === 'CONSUME'
      ? {
          ...(inputFields as ConsumeInputFields),
          label: (inputFields as ConsumeInputFields).label.trim() || 'Consume items',
          entries: ((inputFields as ConsumeInputFields).entries ?? []).filter(
            (entry) => entry.itemTemplateRef.trim().length > 0 && entry.quantity > 0,
          ),
        } satisfies ConsumeInputFields
      : inputFields;

    const template: TaskTemplate = {
      name: name.trim(),
      description: description.trim(),
      icon: normalizeTaskTemplateIconKey(icon, taskType),
      taskType,
      secondaryTag: secondaryTag === '' ? null : secondaryTag,
      inputFields: normalizedInputFields,
      xpAward: buildXpAward(statGroup, xpValue),
      cooldown: cooldown === '' ? null : cooldown,
      media: null,
      items: [],
    };

    if (isEditMode && editKey) {
      setTaskTemplate(editKey, {
        ...template,
        id: editTemplate?.id,
        isCustom: editTemplate?.isCustom,
        isSystem: editTemplate?.isSystem,
        xpBonus: editTemplate?.xpBonus,
      });
    } else {
      const id = uuidv4();
      setTaskTemplate(id, { ...template, isCustom: true });
    }

    onClose();
  }

  const title = readOnly
    ? 'View Task Template'
    : isEditMode
      ? 'Edit Task Template'
      : 'Add Task Template';

  return (
    <PopupShell
      title={title}
      onClose={onClose}
      size="large"
      headerRight={
        readOnly ? (
          <span className="rounded-full bg-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            Prebuilt template no editing
          </span>
        ) : undefined
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden pb-4">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-4">
            <div className="w-24 shrink-0">
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Icon</label>
              <div className={readOnly ? 'pointer-events-none opacity-60' : ''}>
                <IconPicker value={icon} onChange={setIcon} align="left" />
              </div>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                disabled={readOnly}
                placeholder="e.g. Morning walk"
                className={inputClassName(readOnly)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={readOnly}
              rows={4}
              className={`${inputClassName(readOnly)} resize-none`}
              placeholder="Short description of what this task involves"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Stat Group</label>
              <select
                value={statGroup}
                onChange={(e) => setStatGroup(e.target.value as StatGroupKey)}
                disabled={readOnly}
                className={inputClassName(readOnly)}
              >
                {STAT_GROUPS.map(({ key, label }) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Category</label>
              <select
                value={secondaryTag}
                onChange={(e) => setSecondaryTag(e.target.value as TaskSecondaryTag | '')}
                disabled={readOnly}
                className={inputClassName(readOnly)}
              >
                <option value="">None</option>
                {SECONDARY_TAGS.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Task Type</label>
              <select
                value={taskType}
                onChange={(e) => {
                  const t = e.target.value as TaskType;
                  setTaskType(t);
                  setInputFields(defaultInputFields(t));
                  setExpandedCircuitStepId(null);
                }}
                disabled={readOnly}
                className={inputClassName(readOnly)}
              >
                {TASK_TYPES.map((type) => (
                  <option key={type} value={type}>{TASK_TYPE_LABELS[type]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Cooldown (minutes)</label>
              <input
                type="number"
                value={cooldown}
                onChange={(e) => setCooldown(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={readOnly}
                min={1}
                className={inputClassName(readOnly)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-gray-500 dark:text-gray-400">Task inputs</label>
            <div className={`rounded-xl border px-4 py-3 ${
              readOnly
                ? 'border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-900'
                : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40'
            }`}>
              {renderInputFields()}
            </div>
          </div>
        </div>

        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={readOnly}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              readOnly
                ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            Save
          </button>
        </div>
      </div>
    </PopupShell>
  );
}
