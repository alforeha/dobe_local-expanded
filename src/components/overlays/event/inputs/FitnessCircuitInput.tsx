import { useEffect, useMemo, useRef, useState } from 'react';
import type { Task } from '../../../../types/task';
import {
  normalizeCircuitInputFields,
  type CircuitInputFields,
  type CircuitStep,
  type CounterInputFields,
  type DurationInputFields,
  type InputFields,
  type LocationTrailInputFields,
  type SetsRepsInputFields,
  type TaskTemplate,
} from '../../../../types/taskTemplate';
import { taskTemplateLibrary } from '../../../../coach';
import { useScheduleStore } from '../../../../stores/useScheduleStore';
import { FitnessSetsRepsInput } from './FitnessSetsRepsInput';
import { FitnessDurationInput } from './FitnessDurationInput';
import { CounterInput } from './CounterInput';
import { LocationTrailInput } from './LocationTrailInput';

export interface FitnessCircuitInputProps {
  inputFields: CircuitInputFields;
  task: Task;
  onComplete: (result: Partial<CircuitInputFields>) => void;
}

const RADIUS = 80;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function buildStepKey(stepId: string, round: number): string {
  return `${stepId}-round${round}`;
}

export function FitnessCircuitInput({ inputFields, task, onComplete }: FitnessCircuitInputProps) {
  void task;
  const normalizedInputFields = useMemo(() => normalizeCircuitInputFields(inputFields), [inputFields]);
  const { label, rounds, restBetweenRounds, steps } = normalizedInputFields;

  const taskTemplates = useScheduleStore((s: ReturnType<typeof useScheduleStore.getState>) => s.taskTemplates);

  const [circuitState, setCircuitState] = useState({ round: 1, stepIndex: 0, restSeconds: 0 });
  const currentRound = circuitState.round;
  const currentStepIndex = circuitState.stepIndex;
  const restSeconds = circuitState.restSeconds;
  const [stepResults, setStepResults] = useState<Record<string, Partial<InputFields>>>({});

const pendingCompleteResults = useRef<Record<string, Partial<InputFields>> | null>(null);

  const firedRef = useRef(false);

  const totalSteps = steps.length;
  const currentStep: CircuitStep | null = steps[currentStepIndex] ?? null;
  const currentStepKey = currentStep ? buildStepKey(currentStep.id, currentRound) : null;
  const currentStepResult = currentStepKey ? stepResults[currentStepKey] : undefined;

  const resting = restSeconds > 0;
  const restProgress = restBetweenRounds && restBetweenRounds > 0 ? restSeconds / restBetweenRounds : 0;
  const restDashoffset = CIRCUMFERENCE * (1 - restProgress);

  useEffect(() => {
    if (!resting) return;
    const id = window.setInterval(() => {
      setCircuitState((prev) => {
        if (prev.restSeconds <= 1) {
          window.clearInterval(id);
if (pendingCompleteResults.current) {
          const results = pendingCompleteResults.current;
          pendingCompleteResults.current = null;
          firedRef.current = true;
          setTimeout(() => onComplete({ ...normalizedInputFields, stepResults: results }), 0);
          return { ...prev, restSeconds: 0 };
        }
        return { round: prev.round + 1, stepIndex: 0, restSeconds: 0 };
        }
        return { ...prev, restSeconds: prev.restSeconds - 1 };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [resting]);

  function resolveStepTemplate(step: CircuitStep): TaskTemplate | undefined {
    const stepAsRecord = step as unknown as Record<string, unknown>;
    const templateRef = typeof stepAsRecord['templateRef'] === 'string' ? stepAsRecord['templateRef'] : null;
    if (!templateRef) return undefined;
    return (
      (taskTemplateLibrary as TaskTemplate[]).find((t) => t.id === templateRef) ??
      (Object.values(taskTemplates) as TaskTemplate[]).find((t) => t.id === templateRef)
    );
  }

  function advance(savedResults: Record<string, Partial<InputFields>>) {
    if (!currentStep) return;

    const nextStepIndex = currentStepIndex + 1;
    if (nextStepIndex < totalSteps) {
      setCircuitState((p) => ({ ...p, stepIndex: nextStepIndex }));
      return;
    }

    const nextRound = currentRound + 1;
    if (nextRound <= rounds) {
      if (restBetweenRounds && restBetweenRounds > 0) {
        setCircuitState((p) => ({ ...p, restSeconds: restBetweenRounds }));
        return;
      }
      setCircuitState((p) => ({ ...p, round: nextRound, stepIndex: 0 }));
      return;
    }

if (!firedRef.current) {
    if (restBetweenRounds && restBetweenRounds > 0) {
      pendingCompleteResults.current = savedResults;
      setCircuitState((p) => ({ ...p, restSeconds: restBetweenRounds }));
      return;
    }
    firedRef.current = true;
    onComplete({ ...normalizedInputFields, stepResults: savedResults });
  }
  }

  function saveStepResult(result: Partial<InputFields>) {
    if (!currentStepKey) return;
    const updated = { ...stepResults, [currentStepKey]: result };
    setStepResults(updated);
    advance(updated);
  }

  function clearCurrentStepResult() {
    if (!currentStepKey) return;
    setStepResults((prev) => {
      const next = { ...prev };
      delete next[currentStepKey];
      return next;
    });
  }

  function handleNext() {
    advance(stepResults);
  }

  const progressFraction = totalSteps > 0 ? currentStepIndex / totalSteps : 0;

  // --- REST STATE ---
  if (resting) {
    return (
      <div className="flex flex-col items-center gap-3 py-2">
        <div className="relative flex items-center justify-center">
          <svg viewBox="0 0 200 200" width={180} height={180}>
            <circle
              cx={100}
              cy={100}
              r={RADIUS}
              fill="none"
              strokeWidth={10}
              className="stroke-gray-200 dark:stroke-gray-700"
            />
            <circle
              cx={100}
              cy={100}
              r={RADIUS}
              fill="none"
              strokeWidth={10}
              className="stroke-orange-400 transition-all duration-1000"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={restDashoffset}
              strokeLinecap="round"
              transform="rotate(-90 100 100)"
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
              REST
            </span>
            <span className="text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
              {restSeconds}s
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCircuitState((p) => ({ round: p.round + 1, stepIndex: 0, restSeconds: 0 }))}
          className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
        >
          SKIP
        </button>
      </div>
    );
  }

  // --- EMPTY STATE ---
  if (totalSteps === 0 || !currentStep) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
        No steps configured for this circuit.
      </div>
    );
  }

  const resolvedTemplate = resolveStepTemplate(currentStep);
  const stepName = resolvedTemplate?.name ?? currentStep.label ?? label;

  const pseudoTask: Task = {
    id: `circuit-step:${currentStep.id}:${currentRound}`,
    templateRef: (currentStep as unknown as Record<string, unknown>)['templateRef'] as string | null ?? null,
    isUnique: true,
    title: currentStep.label,
    taskType: currentStep.stepType,
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
  };

  function renderStepInput() {
    if (!currentStep) return null;

    switch (currentStep.stepType) {
      case 'SETS_REPS': {
        const setsRepsFields: SetsRepsInputFields = {
          sets: 1,
          reps: currentStep.reps ?? 10,
          weight: currentStep.weight ?? null,
          weightUnit: currentStep.weightUnit ?? 'kg',
          restAfter: currentStep.restAfter ?? null,
          dropSet: currentStep.dropSet ?? false,
        };
        return (
          <FitnessSetsRepsInput
            inputFields={setsRepsFields}
            task={pseudoTask}
            onComplete={saveStepResult}
            showName={false}
            disableRest={true}
          />
        );
      }
      case 'DURATION': {
        const durationUnit =
          currentStep.unit === 'seconds' || currentStep.unit === 'minutes' || currentStep.unit === 'hours'
            ? currentStep.unit
            : 'minutes';
        const multiplier = durationUnit === 'seconds' ? 1 : durationUnit === 'hours' ? 3600 : 60;
        const durationFields: DurationInputFields = {
          targetDuration: Math.max(1, Math.round((currentStep.target ?? 1) * multiplier)),
          unit: durationUnit,
        };
        return (
          <FitnessDurationInput
            inputFields={durationFields}
            task={pseudoTask}
            onComplete={saveStepResult}
            showName={false}
          />
        );
      }
      case 'COUNTER': {
        const counterFields: CounterInputFields = {
          target: currentStep.target ?? 1,
          unit: currentStep.unit ?? '',
          step: currentStep.step ?? 1,
        };
        return (
          <CounterInput
            inputFields={counterFields}
            task={pseudoTask}
            onComplete={saveStepResult}
          />
        );
      }
      case 'LOCATION_TRAIL': {
        const trailFields: LocationTrailInputFields = {
          label: currentStep.label,
          captureInterval: null,
        };
        return (
          <LocationTrailInput
            inputFields={trailFields}
            task={pseudoTask}
            onComplete={saveStepResult}
          />
        );
      }
      default:
        return (
          <div className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
            Unsupported step type: {currentStep.stepType}
          </div>
        );
    }
  }

  return (
    <div className="flex flex-col gap-3 py-1">
      {/* TOP BAR */}
      <div className="shrink-0 space-y-1.5">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>
            Round{' '}
            <span className="font-bold text-gray-700 dark:text-gray-200">{currentRound}</span> of {rounds}
          </span>
          <span>
            Step{' '}
            <span className="font-bold text-gray-700 dark:text-gray-200">{currentStepIndex + 1}</span> of {totalSteps}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-1.5 rounded-full bg-purple-500 transition-all"
            style={{ width: `${progressFraction * 100}%` }}
          />
        </div>
      </div>

      {/* STEP NAME */}
      {stepName && (
        <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{stepName}</p>
      )}

      {/* SAVED STEP */}
      {currentStepResult !== undefined ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-3 dark:border-green-800 dark:bg-green-900/20">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-green-700 dark:text-green-300">Step saved</p>
            <button
              type="button"
              onClick={clearCurrentStepResult}
              className="text-xs font-medium text-green-700 hover:text-green-800 dark:text-green-300 dark:hover:text-green-200"
            >
              Edit
            </button>
          </div>
          <button
            type="button"
            onClick={handleNext}
            className="mt-2 w-full rounded-lg bg-purple-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 active:bg-purple-800"
          >
            {currentStepIndex < totalSteps - 1
              ? `Next: ${steps[currentStepIndex + 1]?.label ?? 'Step'}`
              : currentRound < rounds
                ? 'Next round'
                : 'Complete circuit'}
          </button>
        </div>
      ) : (
        /* ACTIVE STEP INPUT */
        renderStepInput()
      )}
    </div>
  );
}
