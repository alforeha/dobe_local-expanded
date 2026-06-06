import { useState, useEffect, useRef } from 'react';
import type { SetsRepsInputFields, DurationInputFields, TaskTemplate } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';
import { taskTemplateLibrary } from '../../../../coach';
import { useScheduleStore } from '../../../../stores/useScheduleStore';

interface WorkoutExecutionInputProps {
  inputFields: SetsRepsInputFields | DurationInputFields;
  task: Task;
  onComplete: (result: Partial<SetsRepsInputFields> | Partial<DurationInputFields>) => void;
}

function fmtSecs(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${sec}s`;
}

function fmtMmSs(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

interface DurationExecutionProps {
  inputFields: DurationInputFields;
  exerciseName: string;
  muscleGroup: string | null;
  onComplete: (result: Partial<DurationInputFields>) => void;
}

function DurationExecution({ inputFields, exerciseName, muscleGroup, onComplete }: DurationExecutionProps) {
  const { targetDuration } = inputFields;
  const [phase, setPhase] = useState<'idle' | 'running' | 'complete'>('idle');
  const [remaining, setRemaining] = useState(targetDuration);

  useEffect(() => {
    if (phase !== 'running') return;
    const id = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          setPhase('complete');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  const handleReset = () => {
    setPhase('idle');
    setRemaining(targetDuration);
  };

  const handleComplete = () => {
    onComplete({ targetDuration, actualDuration: targetDuration } as Partial<DurationInputFields>);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* TOP: exercise name + muscle group badge */}
      <div className="flex flex-col items-center pt-6 pb-4 gap-2">
        <h1 className="text-2xl font-bold text-center text-gray-900 dark:text-white leading-tight">
          {exerciseName}
        </h1>
        {muscleGroup && (
          <span className="px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
            {muscleGroup}
          </span>
        )}
      </div>

      {/* MIDDLE */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4">
        {phase === 'idle' && (
          <div className="w-full flex flex-col items-center gap-4">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              DURATION
            </span>
            <span className="text-7xl font-black text-gray-900 dark:text-white tabular-nums">
              {fmtMmSs(targetDuration)}
            </span>
            <button
              onClick={() => setPhase('running')}
              className="w-full bg-blue-500 text-white font-bold text-lg rounded-xl py-4 active:bg-blue-600"
            >
              BEGIN
            </button>
          </div>
        )}

        {phase === 'running' && (
          <div className="w-full flex flex-col items-center gap-4">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              REMAINING
            </span>
            <span className="text-7xl font-black text-gray-900 dark:text-white tabular-nums">
              {fmtMmSs(remaining)}
            </span>
            <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{
                  width: targetDuration > 0 ? `${(remaining / targetDuration) * 100}%` : '0%',
                  transition: 'width 1s linear',
                }}
              />
            </div>
          </div>
        )}

        {phase === 'complete' && (
          <div className="w-full flex flex-col items-center gap-4">
            <div className="w-full flex flex-col items-center justify-center bg-green-500 text-white rounded-xl py-8">
              <span className="text-5xl font-black">DONE</span>
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={handleComplete}
                className="flex-1 bg-green-500 text-white font-bold rounded-lg px-4 py-2"
              >
                Complete
              </button>
              <button
                onClick={handleReset}
                className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold rounded-lg px-4 py-2"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function WorkoutExecutionInput({ inputFields, task, onComplete }: WorkoutExecutionInputProps) {
  const taskTemplates = useScheduleStore((s: ReturnType<typeof useScheduleStore.getState>) => s.taskTemplates);
  const template: TaskTemplate | undefined = task.templateRef
    ? (taskTemplateLibrary.find((t: TaskTemplate) => t.id === task.templateRef)
      ?? (Object.values(taskTemplates) as TaskTemplate[]).find((t) => t.id === task.templateRef))
    : undefined;
  const exerciseName = template?.name ?? task.title ?? 'Exercise';
  const muscleGroup = template?.muscleGroup ?? null;
  const isDuration = template?.taskType === 'DURATION';

  const setsRepsFields = isDuration ? null : inputFields as SetsRepsInputFields;
  const sets = setsRepsFields?.sets ?? 0;
  const reps = setsRepsFields?.reps ?? 0;
  const weight = setsRepsFields?.weight ?? null;
  const weightUnit = setsRepsFields?.weightUnit ?? null;
  const restAfter = setsRepsFields?.restAfter ?? null;

  const [setsLogged, setSetsLogged] = useState(0);
  const [restSeconds, setRestSeconds] = useState(0);
  const firedRef = useRef(false);

  const resting = restSeconds > 0;
  const allLogged = sets > 0 && setsLogged >= sets;

  useEffect(() => {
    if (!resting) return;
    const id = window.setInterval(() => {
      setRestSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resting]);

  if (isDuration) {
    return (
      <DurationExecution
        inputFields={inputFields as DurationInputFields}
        exerciseName={exerciseName}
        muscleGroup={muscleGroup}
        onComplete={onComplete as (result: Partial<DurationInputFields>) => void}
      />
    );
  }

  const handleLogSet = () => {
    if (resting) return;
    const next = setsLogged + 1;
    setSetsLogged(next);
    if (next >= sets) {
      if (!firedRef.current) {
        firedRef.current = true;
        onComplete(inputFields as SetsRepsInputFields);
      }
    } else if (restAfter && restAfter > 0) {
      setRestSeconds(restAfter);
    }
  };

  const progressPct = sets > 0 ? Math.min(100, (setsLogged / sets) * 100) : 0;

  const repsLabel = weight
    ? `${reps} reps @ ${weight}${weightUnit ?? ''}`
    : `${reps} reps`;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-col items-center pt-6 pb-4 gap-2">
        <h1 className="text-2xl font-bold text-center text-gray-900 dark:text-white leading-tight">
          {exerciseName}
        </h1>
        {muscleGroup && (
          <span className="px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
            {muscleGroup}
          </span>
        )}
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4">
        {allLogged ? (
          <div className="w-full flex flex-col items-center justify-center gap-3 bg-green-500 text-white rounded-xl py-8">
            <span className="text-5xl font-black">V</span>
            <span className="text-lg font-bold">DONE</span>
            <span className="text-sm opacity-80">{sets} sets of {reps} reps</span>
          </div>
        ) : resting ? (
          <div className="w-full flex flex-col items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">REST</span>
            <span className="text-7xl font-black text-gray-900 dark:text-white tabular-nums">
              {fmtSecs(restSeconds)}
            </span>
            <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-400 rounded-full"
                style={{
                  width: restAfter && restAfter > 0 ? `${(restSeconds / restAfter) * 100}%` : '0%',
                  transition: 'width 1s linear',
                }}
              />
            </div>
            <button
              onClick={() => setRestSeconds(0)}
              className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 mt-1"
            >
              SKIP
            </button>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center gap-4">
            <div className="flex flex-col items-center gap-1">
              <span className="text-5xl font-black text-gray-900 dark:text-white tabular-nums">
                {setsLogged + 1} / {sets}
              </span>
              <span className="text-xs uppercase tracking-widest text-gray-400 font-medium">set</span>
            </div>
            <span className="text-3xl font-bold text-gray-800 dark:text-gray-100">{repsLabel}</span>
            <button
              onClick={handleLogSet}
              className="w-full bg-blue-500 text-white font-bold text-lg rounded-xl py-4 active:bg-blue-600"
            >
              LOG SET
            </button>
          </div>
        )}
      </div>
      <div className="px-4 pb-4 pt-2">
        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
