import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { itemLibrary } from '../../coach/ItemLibrary';
import { useUserStore } from '../../stores/useUserStore';
import {
  normalizeCircuitInputFields,
  type ChecklistItem,
  type CircuitInputFields,
  type CircuitStep,
  type CircuitStepType,
  type ConsumeEntry,
  type ConsumeInputFields,
  type FormField,
  type InputFields,
} from '../../types/taskTemplate';
import type { InventoryItemTemplate } from '../../types/resource';
import { getLibraryItem, getUserInventoryItemTemplates, mergeInventoryItemTemplates } from '../../utils/inventoryItems';

export interface TaskTypeConfigEditorProps {
  taskType: string;
  inputFields: Partial<InputFields>;
  onChange: (updated: Partial<InputFields>) => void;
  readOnly?: boolean;
}

interface NumberInputProps {
  fieldKey: string;
  value: unknown;
  placeholder?: string;
  min?: number;
  readOnly: boolean;
  patch: (patch: Partial<InputFields>) => void;
}

interface TextInputProps {
  fieldKey: string;
  value: unknown;
  placeholder?: string;
  readOnly: boolean;
  patch: (patch: Partial<InputFields>) => void;
}

const CIRCUIT_STEP_TYPES: CircuitStepType[] = ['CHECK', 'CHOICE', 'COUNTER', 'SETS_REPS', 'DURATION', 'TIMER', 'RATING', 'TEXT', 'SCAN'];

function TextInput({
  fieldKey,
  value,
  placeholder,
  readOnly,
  patch,
}: TextInputProps) {
  const externalValue = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const [draft, setDraft] = useState(externalValue);

  useEffect(() => {
    setDraft(externalValue);
  }, [externalValue]);

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== externalValue) {
          patch({ [fieldKey]: draft } as Partial<InputFields>);
        }
      }}
      disabled={readOnly}
      placeholder={placeholder}
      className={inputClassName(readOnly)}
    />
  );
}

function NumberInput({
  fieldKey,
  value,
  placeholder,
  min,
  readOnly,
  patch,
}: NumberInputProps) {
  const externalValue = value === null || value === undefined ? '' : String(value);
  const [draft, setDraft] = useState(externalValue);

  useEffect(() => {
    setDraft(externalValue);
  }, [externalValue]);

  return (
    <input
      type="number"
      value={draft}
      min={min}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (next === '') return;

        const parsed = Number(next);
        if (Number.isFinite(parsed)) {
          patch({ [fieldKey]: parsed } as Partial<InputFields>);
        }
      }}
      disabled={readOnly}
      placeholder={placeholder}
      className={inputClassName(readOnly)}
    />
  );
}

function makeDefaultCircuitStep(stepType: CircuitStepType = 'CHECK'): CircuitStep {
  switch (stepType) {
    case 'CHOICE':
      return {
        id: uuidv4(),
        label: '',
        stepType,
        options: ['Option A', 'Option B'],
        multiSelect: false,
        required: true,
      };
    case 'COUNTER':
      return {
        id: uuidv4(),
        label: '',
        stepType,
        target: 1,
        step: 1,
        unit: '',
        required: true,
      };
    case 'SETS_REPS':
      return {
        id: uuidv4(),
        label: '',
        stepType,
        reps: 10,
        weight: null,
        weightUnit: 'kg',
        restAfter: null,
        dropSet: false,
        required: true,
      };
    case 'DURATION':
      return {
        id: uuidv4(),
        label: '',
        stepType,
        target: 5,
        unit: 'minutes',
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
      return { ...base, options: step.options && step.options.length > 0 ? step.options : ['Option A', 'Option B'], multiSelect: step.multiSelect ?? false };
    case 'COUNTER':
      return { ...base, target: step.target ?? 1, step: step.step ?? 1, unit: step.unit ?? '' };
    case 'SETS_REPS':
      return {
        ...base,
        reps: step.reps ?? 10,
        weight: step.weight ?? null,
        weightUnit: step.weightUnit ?? 'kg',
        restAfter: step.restAfter ?? null,
        dropSet: step.dropSet ?? false,
      };
    case 'DURATION':
      return { ...base, target: step.target ?? 5, unit: step.unit ?? 'minutes' };
    case 'TIMER':
      return { ...base, seconds: step.seconds ?? 60 };
    case 'RATING':
      return { ...base, scale: step.scale ?? 5 };
    default:
      return base;
  }
}

function inputClassName(disabled: boolean) {
  return `w-full rounded-xl border px-3 py-2 text-sm focus:outline-none ${
    disabled
      ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500'
      : 'border-gray-300 bg-white text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
  }`;
}

export function TaskTypeConfigEditor({
  taskType,
  inputFields,
  onChange,
  readOnly = false,
}: TaskTypeConfigEditorProps) {
  const user = useUserStore((s) => s.user);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const availableConsumeTemplates = useMemo<InventoryItemTemplate[]>(() => (
    mergeInventoryItemTemplates(
      getUserInventoryItemTemplates(user),
      itemLibrary
        .map((item) => getLibraryItem(item.id))
        .filter((item): item is InventoryItemTemplate => item != null),
    )
  ), [user]);

  useEffect(() => {
    setTimeout(() => {
      setExpandedStepId(null);
    }, 0);
  }, [taskType]);

  const f = inputFields as Record<string, unknown>;
  type ConfigFields = Record<string, unknown>;
  type ConfigPatchHandler = (patch: Partial<InputFields>) => void;

  const standalonePatch: ConfigPatchHandler = (patch) => {
    onChange({ ...inputFields, ...patch });
  };

  function labeledRow(label: string, input: ReactNode) {
    return (
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
        {input}
      </div>
    );
  }

  function controlValue(value: unknown): string | number {
    return typeof value === 'string' || typeof value === 'number' ? value : '';
  }

  function stringValue(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
  }

  function textInput(fieldKey: string, placeholder?: string, fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch) {
    return (
      <TextInput
        fieldKey={fieldKey}
        value={fields[fieldKey]}
        patch={patch}
        readOnly={readOnly}
        placeholder={placeholder}
      />
    );
  }

  function numInput(fieldKey: string, placeholder?: string, min?: number, fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch) {
    return (
      <NumberInput
        fieldKey={fieldKey}
        value={fields[fieldKey]}
        min={min}
        patch={patch}
        readOnly={readOnly}
        placeholder={placeholder}
      />
    );
  }

  function checkBox(fieldKey: string, label: string, fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch) {
    return (
      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={!!fields[fieldKey]}
          onChange={(e) => patch({ [fieldKey]: e.target.checked } as Partial<InputFields>)}
          disabled={readOnly}
          className="rounded border-gray-300"
        />
        {label}
      </label>
    );
  }

  function stringArrayEditor(fieldKey: string, items: string[], placeholder: string, patch: ConfigPatchHandler = standalonePatch) {
    return (
      <div className="space-y-1.5">
        {items.map((item, idx) => (
          <div key={idx} className="flex gap-2">
            <input
              type="text"
              value={item}
              disabled={readOnly}
              placeholder={placeholder}
              onChange={(e) => {
                const next = [...items];
                next[idx] = e.target.value;
                patch({ [fieldKey]: next } as Partial<InputFields>);
              }}
              className={`flex-1 ${inputClassName(readOnly)}`}
            />
            {!readOnly && (
              <button
                type="button"
                onClick={() => patch({ [fieldKey]: items.filter((_, i) => i !== idx) } as Partial<InputFields>)}
                className="px-1 text-xs text-gray-400 hover:text-red-400"
              >
                x
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <button
            type="button"
            onClick={() => patch({ [fieldKey]: [...items, ''] } as Partial<InputFields>)}
            className="text-xs font-medium text-blue-500 hover:text-blue-600"
          >
            + Add
          </button>
        )}
      </div>
    );
  }

  function renderCheckConfig(fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch) {
    return labeledRow('Label', textInput('label', 'Done', fields, patch));
  }

  function renderCounterConfig(fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch, options?: { hideStep?: boolean }) {
    return (
      <div className={`grid gap-3 ${options?.hideStep ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {labeledRow('Target', numInput('target', '10', 1, fields, patch))}
        {!options?.hideStep && labeledRow('Step', numInput('step', '1', 0.01, fields, patch))}
        {labeledRow('Unit', textInput('unit', 'count', fields, patch))}
      </div>
    );
  }

  function renderSetsRepsConfig(fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch, options?: { hideSets?: boolean }) {
    return (
      <div className="space-y-3">
        <div className={`grid gap-3 ${options?.hideSets ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {!options?.hideSets && labeledRow('Sets', numInput('sets', '3', 1, fields, patch))}
          {labeledRow('Reps', numInput('reps', '10', 1, fields, patch))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {labeledRow('Weight (optional)', numInput('weight', 'None', 0, fields, patch))}
          {labeledRow('Weight unit', (
            <select
              value={stringValue(fields.weightUnit, 'kg')}
              onChange={(e) => patch({ weightUnit: e.target.value } as Partial<InputFields>)}
              disabled={readOnly}
              className={inputClassName(readOnly)}
            >
              <option value="kg">kg</option>
              <option value="lbs">lbs</option>
            </select>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {labeledRow('Rest after set (sec)', numInput('restAfter', 'None', 0, fields, patch))}
          <div className="flex items-end pb-2">{checkBox('dropSet', 'Drop set', fields, patch)}</div>
        </div>
      </div>
    );
  }

  function renderDurationConfig(fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch, options?: { hideUnit?: boolean }) {
    return (
      <div className={`grid gap-3 ${options?.hideUnit ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {labeledRow(options?.hideUnit ? 'Target minutes' : 'Target duration', numInput('targetDuration', '0', 1, fields, patch))}
        {!options?.hideUnit && labeledRow('Unit', (
          <select
            value={stringValue(fields.unit, 'seconds')}
            onChange={(e) => patch({ unit: e.target.value } as Partial<InputFields>)}
            disabled={readOnly}
            className={inputClassName(readOnly)}
          >
            <option value="seconds">Seconds</option>
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
          </select>
        ))}
      </div>
    );
  }

  function renderTimerConfig(fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch) {
    return labeledRow('Countdown (seconds)', numInput('countdownFrom', '300', 1, fields, patch));
  }

  function renderRatingConfig(fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch, options?: { hideLabel?: boolean }) {
    return (
      <div className={`grid gap-3 ${options?.hideLabel ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {labeledRow('Scale (max)', numInput('scale', '5', 2, fields, patch))}
        {!options?.hideLabel && labeledRow('Label', textInput('label', 'Rate this', fields, patch))}
      </div>
    );
  }

  function renderTextConfig(fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch) {
    return (
      <div className="space-y-3">
        {labeledRow('Prompt', textInput('prompt', 'Enter your response', fields, patch))}
        {labeledRow('Max length (optional)', numInput('maxLength', 'None', 1, fields, patch))}
      </div>
    );
  }

  function renderFormConfig(fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch) {
    const formFields: FormField[] = Array.isArray(fields.fields) ? fields.fields as FormField[] : [];
    return (
      <div className="space-y-1.5">
        {formFields.map((field, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
            <input
              type="text"
              value={field.label}
              disabled={readOnly}
              placeholder="Field label"
              onChange={(e) => {
                const next = [...formFields];
                next[idx] = { ...field, label: e.target.value };
                patch({ fields: next } as Partial<InputFields>);
              }}
              className={inputClassName(readOnly)}
            />
            <select
              value={field.fieldType}
              disabled={readOnly}
              onChange={(e) => {
                const next = [...formFields];
                next[idx] = { ...field, fieldType: e.target.value as FormField['fieldType'] };
                patch({ fields: next } as Partial<InputFields>);
              }}
              className={`${inputClassName(readOnly)} w-28`}
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
              <option value="date">Date</option>
            </select>
            {!readOnly && (
              <button
                type="button"
                onClick={() => patch({ fields: formFields.filter((_, i) => i !== idx) } as Partial<InputFields>)}
                className="px-1 text-xs text-gray-400 hover:text-red-400"
              >
                x
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <button
            type="button"
            onClick={() => patch({ fields: [...formFields, { key: uuidv4(), label: '', fieldType: 'text' as const }] } as Partial<InputFields>)}
            className="text-xs font-medium text-blue-500 hover:text-blue-600"
          >
            + Add field
          </button>
        )}
      </div>
    );
  }

  function renderChoiceConfig(fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch, options?: { hideMultiSelect?: boolean }) {
    return (
      <div className="space-y-3">
        {!options?.hideMultiSelect && checkBox('multiSelect', 'Allow multiple selections', fields, patch)}
        {labeledRow('Options', stringArrayEditor('options', Array.isArray(fields.options) ? fields.options.filter((option): option is string => typeof option === 'string') : [], 'Option', patch))}
      </div>
    );
  }

  function renderChecklistConfig(fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch) {
    const clItems: ChecklistItem[] = Array.isArray(fields.items) ? fields.items as ChecklistItem[] : [];
    return (
      <div className="space-y-3">
        {checkBox('requireAll', 'Require all items to complete', fields, patch)}
        {labeledRow('Items', (
          <div className="space-y-1.5">
            {clItems.map((item, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  type="text"
                  value={item.label}
                  disabled={readOnly}
                  placeholder="Item label"
                  onChange={(e) => {
                    const next = [...clItems];
                    next[idx] = { ...next[idx], label: e.target.value };
                    patch({ items: next } as Partial<InputFields>);
                  }}
                  className={`flex-1 ${inputClassName(readOnly)}`}
                />
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => patch({ items: clItems.filter((_, i) => i !== idx) } as Partial<InputFields>)}
                    className="px-1 text-xs text-gray-400 hover:text-red-400"
                  >
                    x
                  </button>
                )}
              </div>
            ))}
            {!readOnly && (
              <button
                type="button"
                onClick={() => patch({ items: [...clItems, { key: uuidv4(), label: '' }] } as Partial<InputFields>)}
                className="text-xs font-medium text-blue-500 hover:text-blue-600"
              >
                + Add item
              </button>
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderScanConfig(fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch) {
    return labeledRow('Scan type', (
      <select
        value={stringValue(fields.scanType, 'barcode')}
        onChange={(e) => patch({ scanType: e.target.value } as Partial<InputFields>)}
        disabled={readOnly}
        className={inputClassName(readOnly)}
      >
        <option value="barcode">Barcode</option>
        <option value="qr">QR Code</option>
        <option value="text">Text</option>
      </select>
    ));
  }

  function renderLogConfig(fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch) {
    return labeledRow('Prompt (optional)', textInput('prompt', 'Open-ended log entry', fields, patch));
  }

  function renderLocationPointConfig(fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch) {
    return (
      <div className="space-y-3">
        {labeledRow('Label', textInput('label', 'Mark location', fields, patch))}
        {checkBox('captureAccuracy', 'Capture accuracy', fields, patch)}
      </div>
    );
  }

  function renderLocationTrailConfig(fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch) {
    return (
      <div className="space-y-3">
        {labeledRow('Label', textInput('label', 'Record trail', fields, patch))}
        {labeledRow('Capture interval (sec, optional)', numInput('captureInterval', 'Manual', 1, fields, patch))}
      </div>
    );
  }

  function renderRollConfig(fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch) {
    return labeledRow('Sides', (
      <select
        value={controlValue(fields.sides) || 6}
        onChange={(e) => patch({ sides: Number(e.target.value) } as Partial<InputFields>)}
        disabled={readOnly}
        className={inputClassName(readOnly)}
      >
        {[4, 6, 8, 10, 12, 20, 100].map((n) => <option key={n} value={n}>d{n}</option>)}
      </select>
    ));
  }

  function renderConsumeConfig(fields: Partial<ConsumeInputFields> = inputFields as ConsumeInputFields, patch: (next: ConsumeInputFields) => void = onChange as (next: ConsumeInputFields) => void) {
    const consumeFields = fields as ConsumeInputFields;
    const entries = consumeFields.entries ?? [];

    function setConsumeFields(next: ConsumeInputFields) {
      patch(next);
    }

    function updateConsumeEntry(index: number, entryPatch: Partial<ConsumeEntry>) {
      const nextEntries = entries.map((entry, entryIndex) => (
        entryIndex === index ? { ...entry, ...entryPatch } : entry
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
            value={consumeFields.label ?? ''}
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
                  x
                </button>
              ) : <div />}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderCircuitStepConfig(step: CircuitStep, patchStep: (stepId: string, patch: Partial<CircuitStep>) => void) {
    const stepPatch = (patch: Partial<InputFields>) => {
      const nextFields = patch as ConfigFields;
      switch (step.stepType) {
        case 'COUNTER':
          patchStep(step.id, {
            target: typeof nextFields.target === 'number' ? nextFields.target : step.target,
            step: typeof nextFields.step === 'number' ? nextFields.step : step.step,
            unit: typeof nextFields.unit === 'string' ? nextFields.unit : step.unit,
          });
          break;
        case 'SETS_REPS':
          patchStep(step.id, {
            reps: typeof nextFields.reps === 'number' ? nextFields.reps : step.reps,
            weight: typeof nextFields.weight === 'number' || nextFields.weight === null ? nextFields.weight : step.weight,
            weightUnit: typeof nextFields.weightUnit === 'string' ? nextFields.weightUnit : step.weightUnit,
            restAfter: typeof nextFields.restAfter === 'number' || nextFields.restAfter === null ? nextFields.restAfter : step.restAfter,
            dropSet: typeof nextFields.dropSet === 'boolean' ? nextFields.dropSet : step.dropSet,
          });
          break;
        case 'DURATION':
          patchStep(step.id, {
            target: typeof nextFields.targetDuration === 'number' ? nextFields.targetDuration : step.target,
            unit: typeof nextFields.unit === 'string' ? nextFields.unit : step.unit,
          });
          break;
        case 'TIMER':
          patchStep(step.id, {
            seconds: typeof nextFields.countdownFrom === 'number' ? nextFields.countdownFrom : step.seconds,
          });
          break;
        case 'RATING':
          patchStep(step.id, {
            scale: typeof nextFields.scale === 'number' ? nextFields.scale : step.scale,
            label: typeof nextFields.label === 'string' ? nextFields.label : step.label,
          });
          break;
        case 'CHOICE':
          patchStep(step.id, {
            options: Array.isArray(nextFields.options) ? nextFields.options.filter((option: unknown): option is string => typeof option === 'string') : step.options,
            multiSelect: typeof nextFields.multiSelect === 'boolean' ? nextFields.multiSelect : step.multiSelect,
          });
          break;
        default:
          break;
      }
    };

    switch (step.stepType) {
      case 'COUNTER':
        return renderCounterConfig({ target: step.target ?? 1, step: step.step ?? 1, unit: step.unit ?? '' }, stepPatch);
      case 'SETS_REPS':
        return renderSetsRepsConfig({
          sets: 1,
          reps: step.reps ?? 10,
          weight: step.weight ?? null,
          weightUnit: step.weightUnit ?? 'kg',
          restAfter: step.restAfter ?? null,
          dropSet: step.dropSet ?? false,
        }, stepPatch, { hideSets: true });
      case 'DURATION':
        return renderDurationConfig({ targetDuration: step.target ?? 5, unit: step.unit ?? 'minutes' }, stepPatch);
      case 'TIMER':
        return renderTimerConfig({ countdownFrom: step.seconds ?? 60 }, stepPatch);
      case 'RATING':
        return renderRatingConfig({ scale: step.scale ?? 5, label: step.label }, stepPatch);
      case 'CHOICE':
        return renderChoiceConfig({ options: step.options ?? [], multiSelect: step.multiSelect ?? false }, stepPatch);
      case 'TEXT':
        return renderTextConfig(
          { prompt: step.label ?? '', maxLength: null },
          (next) => {
            const nextFields = next as ConfigFields;
            patchStep(step.id, { label: typeof nextFields.prompt === 'string' ? nextFields.prompt : step.label });
          },
        );
      case 'SCAN':
        return renderScanConfig(
          { scanType: step.scanType ?? 'barcode' },
          (next) => patchStep(step.id, { ...(next as Partial<CircuitStep>) }),
        );
      default:
        return null;
    }
  }

  switch (taskType) {
    case 'CHECK':
      return renderCheckConfig();

    case 'COUNTER':
      return renderCounterConfig();

    case 'SETS_REPS':
      return renderSetsRepsConfig();

    case 'CIRCUIT': {
      const circuitFields = normalizeCircuitInputFields(inputFields as CircuitInputFields);

      function setCircuitFields(next: CircuitInputFields) {
        onChange(next);
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
        setExpandedStepId(newStep.id);
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
                const isExpanded = expandedStepId === step.id;
                return (
                <div key={step.id} className="rounded-xl border border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-900/40">
                  <div className="flex items-start gap-2">
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <button
                        type="button"
                        disabled={readOnly || idx === 0}
                        onClick={() => moveStep(idx, -1)}
                        className="flex h-5 w-5 items-center justify-center rounded text-xs leading-none text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-700"
                      >
                        ^
                      </button>
                      <button
                        type="button"
                        disabled={readOnly || idx === circuitFields.steps.length - 1}
                        onClick={() => moveStep(idx, 1)}
                        className="flex h-5 w-5 items-center justify-center rounded text-xs leading-none text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-700"
                      >
                        v
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedStepId((prev) => prev === step.id ? null : step.id)}
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
                          setExpandedStepId((prev) => prev === step.id ? null : prev);
                        }}
                        className="shrink-0 px-1 text-sm text-gray-400 hover:text-red-400"
                      >
                        x
                      </button>
                    )}
                  </div>

                  {isExpanded && (
                  <div className="mt-3 space-y-3 border-t border-gray-200 pt-3 dark:border-gray-700">
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
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={step.required ?? true}
                        onChange={(e) => updateCircuitStep(step.id, { required: e.target.checked })}
                        disabled={readOnly}
                        className="rounded border-gray-300"
                      />
                      Required step
                    </label>
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

                    {renderCircuitStepConfig(step, updateCircuitStep)}
                  </div>
                  )}
                </div>
              );})}
            </div>
          </div>
        </div>
      );
    }

    case 'DURATION':
      return renderDurationConfig();

    case 'TIMER':
      return renderTimerConfig();

    case 'RATING':
      return renderRatingConfig();

    case 'TEXT':
      return renderTextConfig();

    case 'FORM':
      return renderFormConfig();

    case 'CHOICE':
      return renderChoiceConfig();

    case 'CHECKLIST':
      return renderChecklistConfig();

    case 'SCAN':
      return renderScanConfig();

    case 'LOG':
      return renderLogConfig();

    case 'LOCATION_POINT':
      return renderLocationPointConfig();

    case 'LOCATION_TRAIL':
      return renderLocationTrailConfig();

    case 'ROLL':
      return renderRollConfig();

    case 'CONSUME':
      return renderConsumeConfig();

    default:
      return (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-3 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
          No configuration needed
        </div>
      );
  }
}
