import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { itemLibrary } from '../../coach/ItemLibrary';
import { useScheduleStore } from '../../stores/useScheduleStore';
import { IconDisplay } from './IconDisplay';
import {
  normalizeCircuitInputFields,
  type CircuitInputFields,
  type CircuitStep,
  type CircuitStepType,
  type DurationInputFields,
  type InputFields,
  type SetsRepsInputFields,
} from '../../types/taskTemplate';

export interface FitnessTaskConfigEditorProps {
  taskType: string;
  inputFields: Partial<InputFields>;
  onChange: (updated: Partial<InputFields>) => void;
  readOnly?: boolean;
}

const FITNESS_CIRCUIT_STEP_TYPES: CircuitStepType[] = ['SETS_REPS', 'DURATION', 'COUNTER', 'LOCATION_TRAIL'];

// ---- shared helpers (mirrors TaskTypeConfigEditor) ----

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

function inputClassName(disabled: boolean) {
  return `w-full rounded-xl border px-3 py-2 text-sm focus:outline-none ${
    disabled
      ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500'
      : 'border-gray-300 bg-white text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
  }`;
}

function TextInput({ fieldKey, value, placeholder, readOnly, patch }: TextInputProps) {
  const externalValue = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const [draft, setDraft] = useState(externalValue);
  useEffect(() => { setDraft(externalValue); }, [externalValue]);
  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== externalValue) patch({ [fieldKey]: draft } as Partial<InputFields>); }}
      disabled={readOnly}
      placeholder={placeholder}
      className={inputClassName(readOnly)}
    />
  );
}

function NumberInput({ fieldKey, value, placeholder, min, readOnly, patch }: NumberInputProps) {
  const externalValue = value === null || value === undefined ? '' : String(value);
  const [draft, setDraft] = useState(externalValue);
  useEffect(() => { setDraft(externalValue); }, [externalValue]);
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
        if (Number.isFinite(parsed)) patch({ [fieldKey]: parsed } as Partial<InputFields>);
      }}
      disabled={readOnly}
      placeholder={placeholder}
      className={inputClassName(readOnly)}
    />
  );
}

function makeDefaultFitnessCircuitStep(): CircuitStep {
  // stepType gets set when the user picks an exercise; default to CHECK as a placeholder
  return { id: uuidv4(), label: '', stepType: 'CHECK', required: true };
}

// Exercise items from library (ids starting with 'exercise-item-')
//const exerciseItems = itemLibrary.filter((item) => item.id.startsWith('exercise-item-'));

// ---- main component ----

export function FitnessTaskConfigEditor({
  taskType,
  inputFields,
  onChange,
  readOnly = false,
}: FitnessTaskConfigEditorProps) {
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [stepSearchQuery, setStepSearchQuery] = useState<Record<string, string>>({});
  const [stepSelectorOpen, setStepSelectorOpen] = useState<Record<string, boolean>>({});

  const taskTemplates = useScheduleStore((s) => s.taskTemplates);
  const fitnessTemplates = Object.values(taskTemplates).filter(
    (t) => t.isCustom === true && t.secondaryTag === 'fitness' && t.taskType !== 'CIRCUIT',
  );

  useEffect(() => {
    setTimeout(() => { setExpandedStepId(null); }, 0);
  }, [taskType]);

  const f = inputFields as Record<string, unknown>;
  type ConfigFields = Record<string, unknown>;
  type ConfigPatchHandler = (patch: Partial<InputFields>) => void;

  const standalonePatch: ConfigPatchHandler = (patch) => { onChange({ ...inputFields, ...patch }); };

  function labeledRow(label: string, input: ReactNode) {
    return (
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
        {input}
      </div>
    );
  }

  function stringValue(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
  }

  function textInput(fieldKey: string, placeholder?: string, fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch) {
    return <TextInput fieldKey={fieldKey} value={fields[fieldKey]} patch={patch} readOnly={readOnly} placeholder={placeholder} />;
  }

  function numInput(fieldKey: string, placeholder?: string, min?: number, fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch) {
    return <NumberInput fieldKey={fieldKey} value={fields[fieldKey]} min={min} patch={patch} readOnly={readOnly} placeholder={placeholder} />;
  }

  // function checkBox(fieldKey: string, label: string, fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch) {
  //   return (
  //     <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
  //       <input
  //         type="checkbox"
  //         checked={!!fields[fieldKey]}
  //         onChange={(e) => patch({ [fieldKey]: e.target.checked } as Partial<InputFields>)}
  //         disabled={readOnly}
  //         className="rounded border-gray-300"
  //       />
  //       {label}
  //     </label>
  //   );
  // }

  // ---- SETS_REPS config ----

  function renderSetsRepsConfig(fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch, options?: { hideSets?: boolean; hideRestAfter?: boolean }) {
    const isDropSet = !!fields.dropSet;
    const setsCount = typeof fields.sets === 'number' ? fields.sets : 3;
    const dropSetValues: { reps: number; weight: number | null }[] = Array.isArray(fields.dropSetValues)
      ? (fields.dropSetValues as { reps: number; weight: number | null }[])
      : [];

    // Sync dropSetValues length to setsCount
    function syncedDropSetValues(count: number, values: { reps: number; weight: number | null }[]): { reps: number; weight: number | null }[] {
      if (values.length === count) return values;
      if (values.length < count) {
        const defaultReps = typeof fields.reps === 'number' ? fields.reps : 10;
        const defaultWeight = typeof fields.weight === 'number' ? fields.weight : null;
        const extras = Array.from({ length: count - values.length }, () => ({ reps: defaultReps, weight: defaultWeight }));
        return [...values, ...extras];
      }
      return values.slice(0, count);
    }

    function handleSetsCountChange(nextCount: number) {
      const nextValues = syncedDropSetValues(nextCount, dropSetValues);
      patch({ sets: nextCount, dropSetValues: nextValues } as Partial<InputFields>);
    }

    function handleDropSetToggle(enabled: boolean) {
      if (enabled) {
        const defaultReps = typeof fields.reps === 'number' ? fields.reps : 10;
        const defaultWeight = typeof fields.weight === 'number' ? fields.weight : null;
        const initValues = Array.from({ length: setsCount }, () => ({ reps: defaultReps, weight: defaultWeight }));
        patch({ dropSet: true, dropSetValues: initValues } as Partial<InputFields>);
      } else {
        patch({ dropSet: false, dropSetValues: [] } as Partial<InputFields>);
      }
    }

    function patchDropSetRow(rowIdx: number, rowPatch: Partial<{ reps: number; weight: number | null }>) {
      const synced = syncedDropSetValues(setsCount, dropSetValues);
      const next = synced.map((row, i) => (i === rowIdx ? { ...row, ...rowPatch } : row));
      patch({ dropSetValues: next } as Partial<InputFields>);
    }

    return (
      <div className="space-y-3">
        {/* Drop set toggle — always shown */}
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={isDropSet}
              onChange={(e) => handleDropSetToggle(e.target.checked)}
              disabled={readOnly}
              className="rounded border-gray-300"
            />
            Drop set
          </label>
        </div>

        {!isDropSet ? (
          // Standard sets/reps
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
            {!options?.hideRestAfter && labeledRow('Rest after set (sec)', numInput('restAfter', 'None', 0, fields, patch))}
          </div>
        ) : (
          // Drop set mode
          <div className="space-y-3">
            {!options?.hideSets && labeledRow('Sets', (
              <NumberInput
                fieldKey="sets"
                value={fields.sets}
                min={1}
                readOnly={readOnly}
                placeholder="3"
                patch={(p) => {
                  const nextCount = typeof (p as Partial<SetsRepsInputFields>).sets === 'number' ? (p as Partial<SetsRepsInputFields>).sets as number : setsCount;
                  handleSetsCountChange(nextCount);
                }}
              />
            ))}
            <div className="space-y-1.5">
              {syncedDropSetValues(setsCount, dropSetValues).map((row, idx) => (
                <div key={idx} className="grid grid-cols-[2rem_1fr_1fr] items-end gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40">
                  <span className="pb-2 text-xs font-medium text-gray-500 dark:text-gray-400">{idx + 1}</span>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Reps</label>
                    <input
                      type="number"
                      value={row.reps}
                      min={1}
                      disabled={readOnly}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v >= 1) patchDropSetRow(idx, { reps: v });
                      }}
                      className={inputClassName(readOnly)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Weight</label>
                    <input
                      type="number"
                      value={row.weight === null || row.weight === undefined ? '' : row.weight}
                      min={0}
                      disabled={readOnly}
                      placeholder="None"
                      onChange={(e) => {
                        const v = e.target.value === '' ? null : Number(e.target.value);
                        patchDropSetRow(idx, { weight: v });
                      }}
                      className={inputClassName(readOnly)}
                    />
                  </div>
                </div>
              ))}
            </div>
            {!options?.hideRestAfter && labeledRow('Rest after set (sec)', numInput('restAfter', 'None', 0, fields, patch))}
          </div>
        )}
      </div>
    );
  }

  // ---- DURATION config ----

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

  // ---- COUNTER config ----

  function renderCounterConfig(fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {labeledRow('Target', numInput('target', '10', 1, fields, patch))}
        {labeledRow('Step', numInput('step', '1', 0.01, fields, patch))}
        {labeledRow('Unit', textInput('unit', 'count', fields, patch))}
      </div>
    );
  }

  // ---- LOCATION_TRAIL config ----

  function renderLocationTrailConfig(fields: ConfigFields = f, patch: ConfigPatchHandler = standalonePatch) {
    return (
      <div className="space-y-3">
        {labeledRow('Label', textInput('label', 'Record trail', fields, patch))}
        {labeledRow('Capture interval (sec, optional)', numInput('captureInterval', 'Manual', 1, fields, patch))}
      </div>
    );
  }

  // ---- Circuit step config renderer (fitness types only) ----

  function renderFitnessCircuitStepConfig(step: CircuitStep, patchStep: (stepId: string, patch: Partial<CircuitStep>) => void, rounds: number = 1) {
    const stepPatch = (patch: Partial<InputFields>) => {
      const nextFields = patch as ConfigFields;
      switch (step.stepType) {
        case 'SETS_REPS':
          patchStep(step.id, {
            reps: typeof nextFields.reps === 'number' ? nextFields.reps : step.reps,
            weight: typeof nextFields.weight === 'number' || nextFields.weight === null ? nextFields.weight as number | null : step.weight,
            weightUnit: typeof nextFields.weightUnit === 'string' ? nextFields.weightUnit : step.weightUnit,
            restAfter: typeof nextFields.restAfter === 'number' || nextFields.restAfter === null ? nextFields.restAfter as number | null : step.restAfter,
            dropSet: typeof nextFields.dropSet === 'boolean' ? nextFields.dropSet : step.dropSet,
            dropSetValues: Array.isArray(nextFields.dropSetValues) ? nextFields.dropSetValues as { reps: number; weight: number | null }[] : step.dropSetValues,
          });
          break;
        case 'DURATION':
          patchStep(step.id, {
            target: typeof nextFields.targetDuration === 'number' ? nextFields.targetDuration : step.target,
            unit: typeof nextFields.unit === 'string' ? nextFields.unit : step.unit,
          });
          break;
        case 'COUNTER':
          patchStep(step.id, {
            target: typeof nextFields.target === 'number' ? nextFields.target : step.target,
            step: typeof nextFields.step === 'number' ? nextFields.step : step.step,
            unit: typeof nextFields.unit === 'string' ? nextFields.unit : step.unit,
          });
          break;
        default:
          break;
      }
    };

    switch (step.stepType) {
      case 'SETS_REPS':
        return renderSetsRepsConfig({
          sets: rounds,
          reps: step.reps ?? 10,
          weight: step.weight ?? null,
          weightUnit: step.weightUnit ?? 'kg',
          restAfter: step.restAfter ?? null,
          dropSet: step.dropSet ?? false,
          dropSetValues: step.dropSetValues ?? [],
        }, stepPatch, { hideSets: true, hideRestAfter: true });
      case 'DURATION':
        return renderDurationConfig({ targetDuration: step.target ?? 5, unit: step.unit ?? 'minutes' }, stepPatch);
      case 'COUNTER':
        return renderCounterConfig({ target: step.target ?? 1, step: step.step ?? 1, unit: step.unit ?? '' }, stepPatch);
      case 'LOCATION_TRAIL':
        return renderLocationTrailConfig({ label: step.label ?? '', captureInterval: (step as unknown as Record<string, unknown>).captureInterval }, (patch) => {
          const p = patch as ConfigFields;
          patchStep(step.id, {
            label: typeof p.label === 'string' ? p.label : step.label,
          });
        });
      default:
        return null;
    }
  }

  // ---- CIRCUIT ----

  function renderCircuitConfig() {
    const circuitFields = normalizeCircuitInputFields(inputFields as CircuitInputFields);

    function setCircuitFields(next: CircuitInputFields) { onChange(next); }

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
      const newStep = makeDefaultFitnessCircuitStep();
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
            placeholder="e.g. Morning strength circuit"
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
              <button type="button" onClick={addStep} className="text-xs font-medium text-blue-500 hover:text-blue-600">
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
                        <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{step.label.trim() || 'Pick an exercise'}</p>
                        {step.label.trim() !== '' && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">{step.stepType}</p>
                        )}
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
                      {/* Exercise selector — always open when no template selected; collapsed to a row when one is selected */}
                      {(step.label.trim() === '' || stepSelectorOpen[step.id]) ? (
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Exercise</label>
                          <div className="rounded-xl border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
                            <input
                              type="text"
                              value={stepSearchQuery[step.id] ?? ''}
                              onChange={(e) => setStepSearchQuery((prev) => ({ ...prev, [step.id]: e.target.value }))}
                              disabled={readOnly}
                              placeholder="Search exercises..."
                              className="w-full rounded-t-xl border-b border-gray-200 bg-transparent px-3 py-2 text-sm focus:outline-none dark:border-gray-700 dark:text-gray-100"
                            />
                            <div className="max-h-40 overflow-y-auto">
                              {fitnessTemplates
                                .filter((t) => {
                                  const q = (stepSearchQuery[step.id] ?? '').toLowerCase();
                                  return q === '' || t.name.toLowerCase().includes(q);
                                })
                                .map((t) => (
                                  <button
                                    key={t.id ?? t.name}
                                    type="button"
                                    disabled={readOnly}
                                    onClick={() => {
                                      const tType = t.taskType as CircuitStepType;
                                      const tFields = t.inputFields as unknown as Record<string, unknown>;
                                      const stepPatch: Partial<CircuitStep> = {
                                        label: t.name,
                                        stepType: tType,
                                        required: step.required ?? true,
                                      };
                                      if (tType === 'SETS_REPS') {
                                        const sr = t.inputFields as SetsRepsInputFields;
                                        stepPatch.reps = sr.reps;
                                        stepPatch.weight = sr.weight;
                                        stepPatch.weightUnit = sr.weightUnit;
                                        stepPatch.restAfter = sr.restAfter;
                                        stepPatch.dropSet = false;
                                      } else if (tType === 'DURATION') {
                                        const dur = t.inputFields as DurationInputFields;
                                        stepPatch.target = dur.targetDuration;
                                        stepPatch.unit = dur.unit;
                                      } else if (tType === 'COUNTER') {
                                        stepPatch.target = typeof tFields.target === 'number' ? tFields.target : 1;
                                        stepPatch.unit = typeof tFields.unit === 'string' ? tFields.unit : '';
                                      }
                                      const withRef = { ...stepPatch, templateRef: t.id ?? '' } as unknown as Partial<CircuitStep>;
                                      updateCircuitStep(step.id, withRef);
                                      setStepSearchQuery((prev) => { const next = { ...prev }; delete next[step.id]; return next; });
                                      setStepSelectorOpen((prev) => { const next = { ...prev }; delete next[step.id]; return next; });
                                    }}
                                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                                  >
                                    <span className="text-gray-800 dark:text-gray-100">{t.name}</span>
                                    <span className="ml-2 shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">{t.taskType}</span>
                                  </button>
                                ))}
                              {fitnessTemplates.filter((t) => {
                                const q = (stepSearchQuery[step.id] ?? '').toLowerCase();
                                return q === '' || t.name.toLowerCase().includes(q);
                              }).length === 0 && (
                                <p className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">No exercises found</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Collapsed exercise row — click to reopen selector */
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => setStepSelectorOpen((prev) => ({ ...prev, [step.id]: true }))}
                          className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-left hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40 dark:hover:bg-gray-800"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{step.label}</p>
                          </div>
                          <span className="ml-2 shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">{step.stepType}</span>
                        </button>
                      )}

                      {/* Editable values — shown when selector is closed and template is selected */}
                      {step.label.trim() !== '' && !stepSelectorOpen[step.id] && FITNESS_CIRCUIT_STEP_TYPES.includes(step.stepType as CircuitStepType) && (
                        <>
                          {renderFitnessCircuitStepConfig(step, updateCircuitStep, circuitFields.rounds)}

                          {/* Equipment — read-only from template */}
                          {(() => {
                            const asAny = step as unknown as Record<string, unknown>;
                            const ref = typeof asAny.templateRef === 'string' ? asAny.templateRef : '';
                            const tmpl = ref ? fitnessTemplates.find((t) => (t.id ?? '') === ref) : undefined;
                            const tmplItems = tmpl?.items ?? [];
                            if (tmplItems.length === 0) return null;
                            const resolvedItems = tmplItems.map((id) => itemLibrary.find((i) => i.id === id)).filter(Boolean) as import('../../coach/ItemLibrary').ItemTemplate[];
                            if (resolvedItems.length === 0) return null;
                            return (
                              <div>
                                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Equipment</label>
                                <div className="flex flex-wrap gap-2">
                                  {resolvedItems.map((item) => (
                                    <div key={item.id} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
                                      <IconDisplay iconKey={item.icon} size={14} />
                                      <span>{item.name}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      )}
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

  // ---- top-level switch ----

  switch (taskType) {
    case 'SETS_REPS':
      return renderSetsRepsConfig();

    case 'CIRCUIT':
      return renderCircuitConfig();

    case 'DURATION':
      return renderDurationConfig();

    case 'COUNTER':
      return renderCounterConfig();

    case 'LOCATION_TRAIL':
      return renderLocationTrailConfig();

    default:
      return (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-3 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
          Select a task type above
        </div>
      );
  }
}
