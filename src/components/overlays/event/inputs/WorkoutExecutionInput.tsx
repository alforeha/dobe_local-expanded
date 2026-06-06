import { useState, useEffect, useRef } from 'react';
import type { SetsRepsInputFields, TaskTemplate } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';
import { taskTemplateLibrary } from '../../../../coach';

interface WorkoutExecutionInputProps {
  inputFields: SetsRepsInputFields;
  task: Task;
  onComplete: (result: Partial<SetsRepsInputFields>) => void;
}

function fmtSecs(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${sec}s`;
}

export function WorkoutExecutionInput({ inputFields, task, onComplete }: WorkoutExecutionInputProps) {
  const { sets, reps, weight, weightUnit, restAfter } = inputFields;

  const [setsLogged, setSetsLogged] = useState(0);
  const [restSeconds, setRestSeconds] = useState(0);
  const firedRef = useRef(false);

  const resting = restSeconds > 0;
  const allLogged = setsLogged >= sets;

  const template = task.templateRef
    ? taskTemplateLibrary.find((t: TaskTemplate) => t.id === task.templateRef)
    : null;
  const exerciseName = template?.name ?? task.title ?? 'Exercise';
  const muscleGroup = template?.muscleGroup ?? null;

  useEffect(() => {
    if (!resting) return;
    const id = window.setInterval(() => {
      setRestSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resting]);

  const handleLogSet = () => {
    if (resting) return;
    const next = setsLogged + 1;
    setSetsLogged(next);
    if (next >= sets) {
      if (!firedRef.current) {
        firedRef.current = true;
        onComplete(inputFields);
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

      {/* MIDDLE: set tracker / rest timer / complete state */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4">

        {allLogged ? (
          /* COMPLETE STATE */
          <div className="w-full flex flex-col items-center justify-center gap-3 bg-green-500 text-white rounded-xl py-8">
            <span className="text-5xl font-black">V</span>
            <span className="text-lg font-bold">DONE</span>
            <span className="text-sm opacity-80">
              {sets} sets of {reps} reps
            </span>
          </div>
        ) : resting ? (
          /* REST TIMER */
          <div className="w-full flex flex-col items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              REST
            </span>
            <span className="text-7xl font-black text-gray-900 dark:text-white tabular-nums">
              {fmtSecs(restSeconds)}
            </span>
            {/* Shrinking progress bar */}
            <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-400 rounded-full"
                style={{
                  width: restAfter && restAfter > 0
                    ? `${(restSeconds / restAfter) * 100}%`
                    : '0%',
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
          /* SET TRACKER */
          <div className="w-full flex flex-col items-center gap-4">
            <div className="flex flex-col items-center gap-1">
              <span className="text-5xl font-black text-gray-900 dark:text-white tabular-nums">
                {setsLogged + 1} / {sets}
              </span>
              <span className="text-xs uppercase tracking-widest text-gray-400 font-medium">
                set
              </span>
            </div>
            <span className="text-3xl font-bold text-gray-800 dark:text-gray-100">
              {repsLabel}
            </span>
            <button
              onClick={handleLogSet}
              className="w-full bg-blue-500 text-white font-bold text-lg rounded-xl py-4 active:bg-blue-600"
            >
              LOG SET
            </button>
          </div>
        )}
      </div>

      {/* BOTTOM: progress bar */}
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
