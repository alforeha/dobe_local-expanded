import { useState, useEffect, useRef } from 'react';
import type { SetsRepsInputFields } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';

interface SetsRepsInputProps {
  inputFields: SetsRepsInputFields;
  task: Task;
  onComplete: (result: Partial<SetsRepsInputFields>) => void;
}

function fmtSecs(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${sec}s`;
}

export function SetsRepsInput({ inputFields, task, onComplete }: SetsRepsInputProps) {
  const isComplete = task.completionState === 'complete';
  const { sets, reps, weight, weightUnit, restAfter, dropSet } = inputFields;

  const [setsLogged, setSetsLogged] = useState(0);
  const [restSeconds, setRestSeconds] = useState(0);
  const firedRef = useRef(false);

  const resting = restSeconds > 0;

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

  if (isComplete) {
    return (
      <div className="flex items-center gap-2 py-2">
        <span className="text-sm font-medium text-green-600 dark:text-green-400">✓ Complete</span>
        <span className="text-xs text-gray-400">
          {sets} sets × {reps} reps{weight ? ` @ ${weight}${weightUnit ?? ''}` : ''}
        </span>
      </div>
    );
  }

  const allLogged = setsLogged >= sets;

  return (
    <div className="space-y-3 py-1">
      {/* Progress */}
      <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-1.5 rounded-full bg-purple-500 transition-all"
          style={{ width: `${sets > 0 ? (setsLogged / sets) * 100 : 0}%` }}
        />
      </div>

      {/* Info row */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600 dark:text-gray-300">
          Set{' '}
          <span className="font-bold text-gray-800 dark:text-gray-100">
            {Math.min(setsLogged + 1, sets)}
          </span>{' '}
          / {sets}
        </span>
        <span className="text-gray-500 dark:text-gray-400">
          {reps} reps
          {weight ? ` @ ${weight}${weightUnit ?? ''}` : ''}
          {dropSet ? ' · drop set' : ''}
        </span>
      </div>

      {/* Rest timer or log button */}
      {resting ? (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 py-3 dark:border-orange-700 dark:bg-orange-900/20">
          <span className="text-xs font-medium uppercase tracking-wide text-orange-600 dark:text-orange-400">
            Rest
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
      ) : (
        <button
          type="button"
          disabled={allLogged}
          onClick={handleLogSet}
          className="w-full rounded-lg bg-purple-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 active:bg-purple-800 disabled:opacity-40"
        >
          {allLogged ? 'All sets complete ✓' : `Log set ${setsLogged + 1}`}
        </button>
      )}
    </div>
  );
}
