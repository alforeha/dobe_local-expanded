import type { ChoiceInputFields } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';

interface ChoiceInputProps {
  inputFields: ChoiceInputFields;
  task: Task;
  onComplete: (result: Partial<ChoiceInputFields>) => void;
}

export function ChoiceInput({ inputFields, task, onComplete }: ChoiceInputProps) {
  const isComplete = task.completionState === 'complete';
  const { options, multiSelect } = inputFields;

  if (isComplete) {
    const saved = (task.resultFields as Partial<ChoiceInputFields>).selected;
    return (
      <div className="flex items-center gap-2 py-2">
        <span className="text-sm font-medium text-green-600 dark:text-green-400">✓ Selected</span>
        {saved && saved.length > 0 && (
          <span className="rounded bg-purple-100 dark:bg-purple-900/40 px-2 py-0.5 text-xs text-purple-700 dark:text-purple-300">
            {saved.join(', ')}
          </span>
        )}
      </div>
    );
  }

  const handleSelect = (option: string) => {
    onComplete({
      options,
      multiSelect,
      selected: [option],
    });
  };

  return (
    <div className="space-y-1.5 py-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => handleSelect(option)}
          className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-left text-sm text-gray-800 dark:text-gray-100 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
        >
          {option}
        </button>
      ))}
    </div>
  );
}
