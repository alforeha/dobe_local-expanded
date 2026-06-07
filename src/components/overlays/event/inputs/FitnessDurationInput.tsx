import { useEffect, useRef, useState } from 'react';
import type { DurationInputFields, TaskTemplate } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';
import { taskTemplateLibrary } from '../../../../coach';
import { itemLibrary } from '../../../../coach/ItemLibrary';
import { useScheduleStore } from '../../../../stores/useScheduleStore';
import { IconDisplay } from '../../../shared/IconDisplay';

export interface FitnessDurationInputProps {
  inputFields: DurationInputFields;
  task: Task;
  onComplete: (result: Partial<DurationInputFields>) => void;
  onResultChange?: (result: Partial<DurationInputFields>) => void;
  showName?: boolean;
}

const RADIUS = 80;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function FitnessDurationInput({
  inputFields,
  task,
  onComplete,
  showName,
}: FitnessDurationInputProps) {
  const { targetDuration } = inputFields;
  const [phase, setPhase] = useState<'idle' | 'running' | 'complete'>('idle');
  const [remaining, setRemaining] = useState(targetDuration);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const taskTemplates = useScheduleStore((s: ReturnType<typeof useScheduleStore.getState>) => s.taskTemplates);
  const template: TaskTemplate | undefined = task.templateRef
    ? (taskTemplateLibrary.find((t: TaskTemplate) => t.id === task.templateRef)
      ?? (Object.values(taskTemplates) as TaskTemplate[]).find((t) => t.id === task.templateRef))
    : undefined;

  const exerciseName = template?.name ?? task.title ?? 'Exercise';
  const muscleGroup = template?.muscleGroup ?? null;
  const intensityRating = template?.intensityRating ?? null;
  const itemRefs: string[] = template?.items ?? [];
  const resolvedItems = itemRefs
    .map((ref) => itemLibrary.find((item) => item.id === ref))
    .filter((item): item is NonNullable<typeof item> => item != null);

  useEffect(() => {
    if (phase !== 'running') {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setPhase('complete');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [phase]);

  const strokeDashoffset =
    phase === 'idle'
      ? 0
      : phase === 'complete'
        ? CIRCUMFERENCE
        : CIRCUMFERENCE * (1 - remaining / targetDuration);

  const phaseLabel =
    phase === 'idle' ? 'READY' : phase === 'running' ? 'REMAINING' : 'DONE';

  function handleBegin() {
    setPhase('running');
  }

  function handleReset() {
    setRemaining(targetDuration);
    setPhase('idle');
  }

  function handleComplete() {
    onComplete({ targetDuration, actualDuration: targetDuration });
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-4">
      {/* Context header */}
      {(showName || muscleGroup || intensityRating || resolvedItems.length > 0) && (
<div className="flex w-full items-center justify-center gap-2 flex-wrap">
  {showName && exerciseName && (
    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
      {exerciseName}
    </span>
  )}
  {muscleGroup && (
    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-blue-700 dark:bg-blue-900 dark:text-blue-200">
      {capitalize(muscleGroup)}
    </span>
  )}
  {intensityRating && (
    <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
      {Array.from({ length: 5 }, (_, i) => i < intensityRating ? '*' : 'o').join('')}
    </span>
  )}
  {resolvedItems.map((item) => (
    <div key={item.id} className="flex items-center gap-0.5 text-xs text-gray-600 dark:text-gray-300">
      <IconDisplay iconKey={item.icon} size={14} className="h-3.5 w-3.5 object-contain" alt="" />
    </div>
  ))}
</div>
      )}

      {/* Radial ring */}
      <div className="relative flex items-center justify-center">
        <svg viewBox="0 0 200 200" width={200} height={200}>
          {/* Background track */}
          <circle
            cx={100}
            cy={100}
            r={RADIUS}
            fill="none"
            strokeWidth={12}
            className="stroke-gray-200 dark:stroke-gray-700"
          />
          {/* Progress arc */}
          <circle
            cx={100}
            cy={100}
            r={RADIUS}
            fill="none"
            strokeWidth={12}
            className="stroke-blue-500 transition-all duration-1000"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform="rotate(-90 100 100)"
          />
        </svg>

        {/* Center label */}
        <div className="absolute flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
            {formatTime(remaining)}
          </span>
          <span className="mt-1 text-xs font-semibold tracking-widest text-gray-500 dark:text-gray-400">
            {phaseLabel}
          </span>
        </div>
      </div>

      {/* Controls */}
      {phase === 'idle' && (
        <button
          type="button"
          onClick={handleBegin}
          className="w-full rounded-xl bg-blue-500 py-3 text-sm font-bold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors"
        >
          BEGIN
        </button>
      )}

      {phase === 'complete' && (
        <div className="flex w-full gap-2">
          <button
            type="button"
            onClick={handleComplete}
            className="flex-1 rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 active:bg-green-700 transition-colors"
          >
            Complete
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="flex-1 rounded-lg bg-gray-200 dark:bg-gray-700 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
