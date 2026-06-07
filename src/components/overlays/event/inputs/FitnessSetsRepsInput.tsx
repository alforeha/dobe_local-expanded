import { useEffect, useRef, useState } from 'react';
import type { SetsRepsInputFields, TaskTemplate } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';
import { taskTemplateLibrary } from '../../../../coach';
import { itemLibrary } from '../../../../coach/ItemLibrary';
import { useScheduleStore } from '../../../../stores/useScheduleStore';
import { IconDisplay } from '../../../shared/IconDisplay';

export interface FitnessSetsRepsInputProps {
  inputFields: SetsRepsInputFields;
  task: Task;
  onComplete: (result: Partial<SetsRepsInputFields>) => void;
  onResultChange?: (result: Partial<SetsRepsInputFields>) => void;
  showName?: boolean;
}

const RADIUS = 80;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function FitnessSetsRepsInput({
  inputFields,
  task,
  onComplete,
  showName,
}: FitnessSetsRepsInputProps) {
  const { sets, reps, weight, weightUnit, restAfter } = inputFields;

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

  type SetResult = { reps: number; weight: number | null };

  const [phase, setPhase] = useState<'active' | 'logging' | 'resting' | 'complete'>('active');
  const [loggedReps, setLoggedReps] = useState<number>(reps);
  const [loggedWeight, setLoggedWeight] = useState<number | null>(weight ?? null);
  const [setResults, setSetResults] = useState<SetResult[]>([]);
  const [restSeconds, setRestSeconds] = useState(0);
  const firedRef = useRef(false);

  const setsLogged = setResults.length;
  const allLogged = sets > 0 && setsLogged >= sets;

  // Rest countdown — also transitions to complete or active when timer hits 0
  useEffect(() => {
    if (phase !== 'resting') return;
    const id = window.setInterval(() => {
      setRestSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          setPhase(allLogged ? 'complete' : 'active');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, allLogged]);

  // Fire onComplete when phase becomes 'complete'
  useEffect(() => {
    if (phase !== 'complete') return;
    if (firedRef.current) return;
    firedRef.current = true;
    onComplete({
      ...inputFields,
      dropSetValues: setResults.map((r) => ({ reps: r.reps, weight: r.weight })),
    } as Partial<SetsRepsInputFields>);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const restProgress = restAfter && restAfter > 0 ? restSeconds / restAfter : 0;
  const restDashoffset = CIRCUMFERENCE * (1 - restProgress);
  const progressPct = sets > 0 ? Math.min(100, (setsLogged / sets) * 100) : 0;

  function handleCompleteSet() {
    const nextResults = [...setResults, { reps: loggedReps, weight: loggedWeight }];
    setSetResults(nextResults);
    const isLastSet = nextResults.length >= sets;
    if (restAfter && restAfter > 0) {
      setRestSeconds(restAfter);
      setPhase('resting');
    } else if (isLastSet) {
      setPhase('complete');
    } else {
      setLoggedReps(reps);
      setLoggedWeight(weight ?? null);
      setPhase('active');
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Context header */}
      {(showName || muscleGroup || intensityRating || resolvedItems.length > 0) && (
        <div className="flex w-full items-center justify-center gap-2 flex-wrap pt-3 px-3">
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

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4">
        {phase === 'complete' ? (
          /* COMPLETE */
          <div className="w-full flex flex-col items-center gap-3">
            <div className="w-full flex flex-col items-center justify-center bg-green-500 text-white rounded-xl py-6">
              <span className="text-4xl font-black">DONE</span>
            </div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {sets} sets of {reps} reps
            </span>
          </div>
        ) : phase === 'resting' ? (
          /* RESTING */
          <div className="w-full flex flex-col items-center gap-3">
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
              onClick={() => {
                setRestSeconds(0);
                setPhase(allLogged ? 'complete' : 'active');
              }}
              className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              SKIP
            </button>
          </div>
        ) : phase === 'logging' ? (
          /* LOGGING */
          <div className="w-full flex flex-col items-center gap-4">
            <div className="flex flex-col items-center gap-1">
              <span className="text-5xl font-black text-gray-900 dark:text-white tabular-nums">
                {setsLogged + 1} / {sets}
              </span>
              <span className="text-xs uppercase tracking-widest text-gray-400 font-medium">set</span>
            </div>
            <div className="w-full flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-500 dark:text-gray-400 w-12">Reps</label>
                <input
                  type="number"
                  value={loggedReps}
                  onChange={(e) => setLoggedReps(Number(e.target.value))}
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-center text-lg font-bold"
                  min={0}
                />
              </div>
              {weight != null && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-500 dark:text-gray-400 w-12">Weight</label>
                  <input
                    type="number"
                    value={loggedWeight ?? ''}
                    onChange={(e) =>
                      setLoggedWeight(e.target.value === '' ? null : Number(e.target.value))
                    }
                    className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-center text-lg font-bold"
                    min={0}
                  />
                  {weightUnit && (
                    <span className="text-sm text-gray-500 dark:text-gray-400 w-8">{weightUnit}</span>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleCompleteSet}
              className="w-full bg-blue-500 text-white font-bold text-lg rounded-xl py-3 hover:bg-blue-600 active:bg-blue-700 transition-colors"
            >
              Complete Set
            </button>
          </div>
        ) : (
          /* ACTIVE */
          <div className="w-full flex flex-col items-center gap-4">
            <div className="flex flex-col items-center gap-1">
              <span className="text-5xl font-black text-gray-900 dark:text-white tabular-nums">
                {setsLogged + 1} / {sets}
              </span>
              <span className="text-xs uppercase tracking-widest text-gray-400 font-medium">set</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                {loggedWeight != null
                  ? `${loggedReps} reps @ ${loggedWeight}${weightUnit ?? ''}`
                  : `${loggedReps} reps`}
              </span>
              <button
                type="button"
                onClick={() => setPhase('logging')}
                className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg px-3 py-1 text-sm"
              >
                LOG SET
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Progress bar */}
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
