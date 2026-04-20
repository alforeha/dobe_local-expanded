import { useState, useEffect } from 'react';
import type { CounterInputFields } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';

interface CounterInputProps {
  inputFields: CounterInputFields;
  task: Task;
  onComplete: (result: Partial<CounterInputFields>) => void;
  hideSubmit?: boolean;
  onResultChange?: (result: Partial<CounterInputFields>) => void;
}

export function CounterInput({ inputFields, task, onComplete, hideSubmit, onResultChange }: CounterInputProps) {
  const isComplete = task.completionState === 'complete';
  const { target, unit, step } = inputFields;
  const [count, setCount] = useState(0);

  useEffect(() => {
    onResultChange?.({ target, unit, step, count });
  }, [count, target, unit, step, onResultChange]);

  const increment = () => setCount((c) => Math.min(c + step, target));
  const decrement = () => setCount((c) => Math.max(c - step, 0));
  const handleComplete = () => onComplete({ target, unit, step, count });

  const progress = target > 0 ? Math.round((count / target) * 100) : 0;

  if (isComplete) {
    return (
      <div className="h-full flex items-center gap-2">
        <span className="text-sm font-medium text-green-600 dark:text-green-400">✓ Complete</span>
        <span className="text-xs text-gray-400">{target} {unit}</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col justify-center space-y-3 py-1">
      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-1.5 rounded-full bg-purple-500 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={decrement}
          disabled={count <= 0}
          className="h-9 w-9 rounded-full border border-gray-300 dark:border-gray-600 text-lg font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors"
        >
          −
        </button>

        <div className="flex-1 text-center">
          <span className="text-2xl font-bold text-gray-800 dark:text-gray-100">{count}</span>
          <span className="text-sm text-gray-400"> / {target}{unit ? ` ${unit}` : ''}</span>
        </div>

        <button
          type="button"
          onClick={increment}
          disabled={count >= target}
          className="h-9 w-9 rounded-full border border-gray-300 dark:border-gray-600 text-lg font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors"
        >
          +
        </button>
      </div>

      {!hideSubmit && (
        <button
          type="button"
          onClick={handleComplete}
          className="w-full rounded-lg bg-purple-600 py-2 text-sm font-medium text-white hover:bg-purple-700 active:bg-purple-800 transition-colors"
        >
          {count >= target ? 'Complete ✓' : `Complete (${count}/${target})`}
        </button>
      )}
    </div>
  );
}
