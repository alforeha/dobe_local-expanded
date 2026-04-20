import { useState, useEffect, useRef } from 'react';
import type { CircuitInputFields } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';

interface CircuitInputProps {
  inputFields: CircuitInputFields;
  task: Task;
  onComplete: (result: Partial<CircuitInputFields>) => void;
}

function fmtSecs(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${sec}s`;
}

export function CircuitInput({ inputFields, task, onComplete }: CircuitInputProps) {
  const isComplete = task.completionState === 'complete';
  const { exercises, rounds, restBetweenRounds } = inputFields;

  const [round, setRound] = useState(1);
  const [exerciseIdx, setExerciseIdx] = useState(0);
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

  const handleDone = () => {
    if (resting) return;
    const nextExIdx = exerciseIdx + 1;
    if (nextExIdx < exercises.length) {
      setExerciseIdx(nextExIdx);
    } else {
      const nextRound = round + 1;
      if (nextRound > rounds) {
        if (!firedRef.current) {
          firedRef.current = true;
          onComplete(inputFields);
        }
      } else {
        setRound(nextRound);
        setExerciseIdx(0);
        if (restBetweenRounds && restBetweenRounds > 0) {
          setRestSeconds(restBetweenRounds);
        }
      }
    }
  };

  if (isComplete) {
    return (
      <div className="flex items-center gap-2 py-2">
        <span className="text-sm font-medium text-green-600 dark:text-green-400">✓ Complete</span>
        <span className="text-xs text-gray-400">
          {rounds} round{rounds !== 1 ? 's' : ''} · {exercises.length} exercise{exercises.length !== 1 ? 's' : ''}
        </span>
      </div>
    );
  }

  const currentExercise = exercises[exerciseIdx] ?? '—';
  const roundProgress = (round - 1) / rounds;

  return (
    <div className="space-y-3 py-1">
      {/* Round progress */}
      <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-1.5 rounded-full bg-purple-500 transition-all"
          style={{ width: `${roundProgress * 100}%` }}
        />
      </div>

      {/* Round / exercise header */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>
          Round{' '}
          <span className="font-bold text-gray-700 dark:text-gray-200">{round}</span> / {rounds}
        </span>
        <span>
          Exercise{' '}
          <span className="font-bold text-gray-700 dark:text-gray-200">{exerciseIdx + 1}</span> /{' '}
          {exercises.length}
        </span>
      </div>

      {/* Current exercise card or rest timer */}
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
      ) : (
        <>
          <div className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2.5 dark:border-purple-700 dark:bg-purple-900/20">
            <p className="text-sm font-semibold text-purple-800 dark:text-purple-200">
              {currentExercise}
            </p>
          </div>

          {/* All exercises in this round — mini list */}
          <ol className="space-y-0.5">
            {exercises.map((ex, i) => (
              <li
                key={ex}
                className={`flex items-center gap-2 rounded px-2 py-1 text-xs transition-colors ${
                  i < exerciseIdx
                    ? 'text-gray-400 line-through'
                    : i === exerciseIdx
                      ? 'font-medium text-purple-700 dark:text-purple-300'
                      : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                    i < exerciseIdx
                      ? 'border-green-400 bg-green-400 text-white'
                      : i === exerciseIdx
                        ? 'border-purple-500 text-purple-600 dark:text-purple-300'
                        : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {i < exerciseIdx ? '✓' : i + 1}
                </span>
                {ex}
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={handleDone}
            className="w-full rounded-lg bg-purple-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 active:bg-purple-800"
          >
            {exerciseIdx < exercises.length - 1
              ? `Done — next: ${exercises[exerciseIdx + 1]}`
              : round < rounds
                ? 'Finish round →'
                : 'Complete circuit ✓'}
          </button>
        </>
      )}
    </div>
  );
}
