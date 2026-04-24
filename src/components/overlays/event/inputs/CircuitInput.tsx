import { useEffect, useMemo, useRef, useState } from 'react';
import type { Task } from '../../../../types/task';
import {
  normalizeCircuitInputFields,
  type CheckInputFields,
  type ChoiceInputFields,
  type CounterInputFields,
  type CircuitInputFields,
  type CircuitStep,
  type DurationInputFields,
  type InputFields,
  type RatingInputFields,
  type ScanInputFields,
  type TaskTemplate,
  type TaskType,
  type TextInputFields,
  type TimerInputFields,
} from '../../../../types/taskTemplate';
import { TaskTypeInputContent } from '../TaskTypeInputContent';

interface CircuitInputProps {
  inputFields: CircuitInputFields;
  task: Task;
  onComplete: (result: Partial<CircuitInputFields>) => void;
}

type CircuitStepResults = Record<string, unknown>;

function buildStepKey(stepId: string, round: number): string {
  return `${stepId}-round${round}`;
}

function formatDurationLabel(targetMinutes: number): string {
  return targetMinutes === 1 ? '1 minute' : `${targetMinutes} minutes`;
}

function buildCircuitStepTemplate(step: CircuitStep): TaskTemplate {
  let inputFields: Partial<InputFields>;
  let taskType: TaskType;

  switch (step.stepType) {
    case 'CHECK':
      taskType = 'CHECK';
      inputFields = { label: step.label } satisfies CheckInputFields;
      break;
    case 'CHOICE':
      taskType = 'CHOICE';
      inputFields = {
        options: step.options && step.options.length > 0 ? step.options : ['Pass', 'Fail'],
        multiSelect: false,
      } satisfies ChoiceInputFields;
      break;
    case 'COUNTER':
      taskType = 'COUNTER';
      inputFields = {
        target: step.target ?? 1,
        unit: step.unit ?? '',
        step: 1,
      } satisfies CounterInputFields;
      break;
    case 'DURATION':
      taskType = 'DURATION';
      inputFields = {
        targetDuration: Math.max(1, Math.round((step.target ?? 1) * 60)),
        unit: 'minutes',
      } satisfies DurationInputFields;
      break;
    case 'TIMER':
      taskType = 'TIMER';
      inputFields = { countdownFrom: Math.max(1, Math.round(step.seconds ?? 60)) } satisfies TimerInputFields;
      break;
    case 'RATING':
      taskType = 'RATING';
      inputFields = { scale: step.scale ?? 5, label: step.label } satisfies RatingInputFields;
      break;
    case 'TEXT':
      taskType = 'TEXT';
      inputFields = { prompt: step.label, maxLength: null } satisfies TextInputFields;
      break;
    case 'SCAN':
      taskType = 'SCAN';
      inputFields = { scanType: 'barcode' } satisfies ScanInputFields;
      break;
  }

  return {
    id: `circuit-step-template:${step.id}`,
    isCustom: false,
    isSystem: true,
    name: step.label,
    description: step.label,
    icon: 'circuit',
    taskType,
    secondaryTag: null,
    inputFields: inputFields as InputFields,
    xpAward: {
      health: 0,
      strength: 0,
      agility: 0,
      defense: 0,
      charisma: 0,
      wisdom: 0,
    },
    cooldown: null,
    media: null,
    items: [],
  };
}

function buildPassFailToneMap(step: CircuitStep): Record<string, 'success' | 'danger' | 'neutral'> | undefined {
  if (step.stepType !== 'CHOICE') return undefined;
  const options = step.options ?? [];
  const hasPass = options.some((option) => option.trim().toLowerCase() === 'pass');
  const hasFail = options.some((option) => option.trim().toLowerCase() === 'fail');
  if (!hasPass || !hasFail) return undefined;

  return options.reduce<Record<string, 'success' | 'danger' | 'neutral'>>((acc, option) => {
    const normalized = option.trim().toLowerCase();
    acc[normalized] = normalized === 'pass' ? 'success' : normalized === 'fail' ? 'danger' : 'neutral';
    return acc;
  }, {});
}

function describeSavedResult(step: CircuitStep, result: unknown): string {
  if (result === null || typeof result !== 'object') return 'Step complete';
  const fields = result as Record<string, unknown>;

  switch (step.stepType) {
    case 'CHECK':
      return 'Completed';
    case 'CHOICE': {
      const selected = Array.isArray(fields.selected) ? fields.selected.filter((value): value is string => typeof value === 'string') : [];
      return selected.length > 0 ? selected.join(', ') : 'Choice saved';
    }
    case 'COUNTER':
      return typeof fields.count === 'number' ? `${fields.count} / ${step.target ?? 1}${step.unit ? ` ${step.unit}` : ''}` : 'Counter saved';
    case 'DURATION':
      return typeof fields.actualDuration === 'number' ? `${Math.round(fields.actualDuration / 60)} min logged` : `Target ${formatDurationLabel(step.target ?? 1)}`;
    case 'TIMER':
      return `Timer ${step.seconds ?? 60}s complete`;
    case 'RATING':
      return typeof fields.value === 'number' ? `${fields.value} / ${step.scale ?? 5}` : 'Rating saved';
    case 'TEXT':
      return typeof fields.value === 'string' && fields.value.trim() ? fields.value.trim() : 'Text saved';
    case 'SCAN':
      return typeof fields.scannedValue === 'string' && fields.scannedValue.trim() ? fields.scannedValue.trim() : 'Scan saved';
    default:
      return 'Step complete';
  }
}

function fmtSecs(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${sec}s`;
}

export function CircuitInput({ inputFields, task, onComplete }: CircuitInputProps) {
  const isComplete = task.completionState === 'complete';
  const normalizedInputFields = useMemo(() => normalizeCircuitInputFields(inputFields), [inputFields]);
  const { label, rounds, restBetweenRounds, steps } = normalizedInputFields;
  const savedCircuitFields = task.resultFields as Partial<CircuitInputFields>;

  const [currentRound, setCurrentRound] = useState(1);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepResults, setStepResults] = useState<CircuitStepResults>(() => {
    const saved = savedCircuitFields.stepResults;
    return saved && typeof saved === 'object' ? { ...(saved as CircuitStepResults) } : {};
  });
  const [restSeconds, setRestSeconds] = useState(0);
  const [pendingNextRound, setPendingNextRound] = useState<number | null>(null);
  const firedRef = useRef(false);

  const resting = restSeconds > 0;
  const totalSteps = steps.length;
  const currentStep = steps[currentStepIndex] ?? null;
  const currentStepKey = currentStep ? buildStepKey(currentStep.id, currentRound) : null;
  const currentStepResult = currentStepKey ? stepResults[currentStepKey] : undefined;
  const currentStepTemplate = currentStep ? buildCircuitStepTemplate(currentStep) : null;
  const currentStepTaskType = currentStepTemplate?.taskType;
  const pseudoTask: Task = useMemo(() => ({
    id: `circuit-step:${currentStep?.id ?? 'none'}:${currentRound}`,
    templateRef: null,
    isUnique: true,
    title: currentStep?.label ?? label,
    taskType: currentStep?.stepType ?? 'CHECK',
    completionState: 'pending',
    completedAt: null,
    resultFields: {},
    attachmentRef: null,
    resourceRef: null,
    location: null,
    sharedWith: null,
    questRef: null,
    actRef: null,
    secondaryTag: null,
  }), [currentRound, currentStep?.id, currentStep?.label, currentStep?.stepType, label]);

  useEffect(() => {
    if (!resting) return;
    const id = window.setInterval(() => {
      setRestSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resting]);

  useEffect(() => {
    if (restSeconds !== 0 || pendingNextRound === null) return;
    setCurrentRound(pendingNextRound);
    setCurrentStepIndex(0);
    setPendingNextRound(null);
  }, [pendingNextRound, restSeconds]);

  function saveCurrentStepResult(result: Partial<InputFields>) {
    if (!currentStepKey) return;
    setStepResults((prev) => ({ ...prev, [currentStepKey]: result }));
  }

  function handleBack() {
    if (resting) return;
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
      return;
    }
    if (currentRound > 1) {
      setCurrentRound((prev) => prev - 1);
      setCurrentStepIndex(Math.max(totalSteps - 1, 0));
    }
  }

  function handleNext() {
    if (resting || !currentStep || !currentStepKey || currentStepResult === undefined) return;

    const nextStepIndex = currentStepIndex + 1;
    if (nextStepIndex < totalSteps) {
      setCurrentStepIndex(nextStepIndex);
      return;
    }

    const nextRound = currentRound + 1;
    if (nextRound <= rounds) {
      if (restBetweenRounds && restBetweenRounds > 0) {
        setPendingNextRound(nextRound);
        setRestSeconds(restBetweenRounds);
        return;
      }

      setCurrentRound(nextRound);
      setCurrentStepIndex(0);
      return;
    }

    if (!firedRef.current) {
      firedRef.current = true;
      onComplete({
        ...normalizedInputFields,
        stepResults,
      });
    }
  }

  function clearCurrentStepResult() {
    if (!currentStepKey) return;
    setStepResults((prev) => {
      const next = { ...prev };
      delete next[currentStepKey];
      return next;
    });
  }

  if (isComplete) {
    const savedStepResults = savedCircuitFields.stepResults;
    const savedResultCount = savedStepResults && typeof savedStepResults === 'object'
      ? Object.keys(savedStepResults as CircuitStepResults).length
      : 0;
    return (
      <div className="flex items-center gap-2 py-2">
        <span className="text-sm font-medium text-green-600 dark:text-green-400">✓ Complete</span>
        <span className="text-xs text-gray-400">
          {rounds} round{rounds !== 1 ? 's' : ''} · {steps.length} step{steps.length !== 1 ? 's' : ''} · {savedResultCount} result{savedResultCount !== 1 ? 's' : ''}
        </span>
      </div>
    );
  }

  const roundProgress = rounds > 0 ? ((currentRound - 1) / rounds) * 100 : 0;
  const canGoBack = !resting && (currentStepIndex > 0 || currentRound > 1);
  const canGoNext = !resting && currentStepResult !== undefined;
  const stepToneMap = currentStep ? buildPassFailToneMap(currentStep) : undefined;

  return (
    <div className="space-y-3 py-1">
      <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-1.5 rounded-full bg-purple-500 transition-all"
          style={{ width: `${roundProgress}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>
          Round{' '}
          <span className="font-bold text-gray-700 dark:text-gray-200">{currentRound}</span> of {rounds}
        </span>
        <span>
          Step{' '}
          <span className="font-bold text-gray-700 dark:text-gray-200">{Math.min(currentStepIndex + 1, Math.max(totalSteps, 1))}</span> of {Math.max(totalSteps, 1)}
        </span>
      </div>

      {resting ? (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 py-3 dark:border-orange-700 dark:bg-orange-900/20">
          <span className="text-xs font-medium uppercase tracking-wide text-orange-600 dark:text-orange-400">
            Rest between rounds
          </span>
          <span className="text-3xl font-bold text-orange-500">{fmtSecs(restSeconds)}</span>
          <button
            type="button"
            onClick={() => setRestSeconds(0)}
            className="mt-1 text-xs text-orange-500 underline hover:text-orange-700"
          >
            Skip rest
          </button>
        </div>
      ) : totalSteps === 0 || !currentStep || !currentStepTemplate || !currentStepTaskType ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
          No steps configured for this circuit.
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2.5 dark:border-purple-700 dark:bg-purple-900/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-purple-500 dark:text-purple-300">
                  {label}
                </p>
                <p className="text-sm font-semibold text-purple-800 dark:text-purple-200">{currentStep.label}</p>
              </div>
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-purple-600 dark:bg-purple-950/40 dark:text-purple-200">
                {currentStep.stepType}
              </span>
            </div>
          </div>

          <ol className="space-y-0.5">
            {steps.map((step, index) => {
              const stepKey = buildStepKey(step.id, currentRound);
              const completed = stepResults[stepKey] !== undefined;
              return (
              <li
                key={step.id}
                className={`flex items-center gap-2 rounded px-2 py-1 text-xs transition-colors ${
                  completed
                    ? 'text-gray-400 line-through'
                    : index === currentStepIndex
                      ? 'font-medium text-purple-700 dark:text-purple-300'
                      : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                    completed
                      ? 'border-green-400 bg-green-400 text-white'
                      : index === currentStepIndex
                        ? 'border-purple-500 text-purple-600 dark:text-purple-300'
                        : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {completed ? '✓' : index + 1}
                </span>
                <span>{step.label}</span>
                <span className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{step.stepType}</span>
              </li>
              );
            })}
          </ol>

          {currentStepResult !== undefined ? (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-3 dark:border-green-800 dark:bg-green-900/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-green-700 dark:text-green-300">Step saved</p>
                  <p className="mt-1 text-sm text-green-900 dark:text-green-100">{describeSavedResult(currentStep, currentStepResult)}</p>
                </div>
                <button
                  type="button"
                  onClick={clearCurrentStepResult}
                  className="text-xs font-medium text-green-700 hover:text-green-800 dark:text-green-300 dark:hover:text-green-200"
                >
                  Edit
                </button>
              </div>
            </div>
          ) : (
            <TaskTypeInputContent
              taskType={currentStepTaskType as Exclude<TaskType, 'CIRCUIT'>}
              template={currentStepTemplate}
              task={pseudoTask}
              onComplete={saveCurrentStepResult}
              choiceToneMap={stepToneMap}
            />
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleBack}
              disabled={!canGoBack}
              className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext || totalSteps === 0}
              className="flex-1 rounded-lg bg-purple-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 active:bg-purple-800 disabled:opacity-40"
            >
              {currentStepIndex < totalSteps - 1
                ? `Next: ${steps[currentStepIndex + 1]?.label ?? 'Step'}`
                : currentRound < rounds
                  ? 'Next round →'
                  : 'Complete circuit ✓'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
