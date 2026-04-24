import type { ChoiceInputFields } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';

interface ChoiceInputProps {
  inputFields: ChoiceInputFields;
  task: Task;
  onComplete: (result: Partial<ChoiceInputFields>) => void;
  optionToneMap?: Record<string, 'success' | 'danger' | 'neutral'>;
}

function getOptionClasses(tone: 'success' | 'danger' | 'neutral' | undefined): string {
  switch (tone) {
    case 'success':
      return 'border-green-200 bg-green-50 text-green-800 hover:border-green-400 hover:bg-green-100 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200 dark:hover:bg-green-900/30';
    case 'danger':
      return 'border-red-200 bg-red-50 text-red-800 hover:border-red-400 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200 dark:hover:bg-red-900/30';
    default:
      return 'border-gray-200 bg-white text-gray-800 hover:border-purple-400 hover:bg-purple-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-purple-900/20';
  }
}

export function ChoiceInput({ inputFields, task, onComplete, optionToneMap }: ChoiceInputProps) {
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
          className={`w-full rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ${getOptionClasses(optionToneMap?.[option] ?? optionToneMap?.[option.toLowerCase()])}`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
