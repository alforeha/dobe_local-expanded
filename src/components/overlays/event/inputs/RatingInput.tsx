import { useState } from 'react';
import type { RatingInputFields } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';

interface RatingInputProps {
  inputFields: RatingInputFields;
  task: Task;
  onComplete: (result: Partial<RatingInputFields>) => void;
}

export function RatingInput({ inputFields, task, onComplete }: RatingInputProps) {
  const isComplete = task.completionState === 'complete';
  const { scale, label } = inputFields;
  const [hovered, setHovered] = useState<number | null>(null);

  if (isComplete) {
    const saved = (task.resultFields as Partial<RatingInputFields>).value;
    return (
      <div className="h-full flex items-center gap-2">
        <span className="text-sm font-medium text-green-600 dark:text-green-400">✓ Rated</span>
        {saved !== undefined && (
          <span className="text-xs text-gray-400">{saved} / {scale}</span>
        )}
      </div>
    );
  }

  const pips = Array.from({ length: scale }, (_, i) => i + 1);
  const displayVal = hovered;

  return (
    <div className="h-full flex flex-col justify-center space-y-2 py-1">
      {label && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {pips.map((pip) => (
          <button
            key={pip}
            type="button"
            onMouseEnter={() => setHovered(pip)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onComplete({ scale, label, value: pip })}
            className={`h-8 min-w-[2rem] rounded-lg border px-2 text-sm font-semibold transition-colors
              ${(displayVal !== null ? pip <= displayVal : false)
                ? 'border-purple-500 bg-purple-500 text-white'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20'
              }`}
          >
            {pip}
          </button>
        ))}
      </div>
    </div>
  );
}
