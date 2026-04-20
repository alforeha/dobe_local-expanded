import { useState, useEffect } from 'react';
import type { ChecklistInputFields, ChecklistItem } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';

interface ChecklistInputProps {
  inputFields: ChecklistInputFields;
  task: Task;
  onComplete: (result: Partial<ChecklistInputFields>) => void;
  hideSubmit?: boolean;
  onResultChange?: (result: Partial<ChecklistInputFields>) => void;
}

export function ChecklistInput({ inputFields, task, onComplete, hideSubmit, onResultChange }: ChecklistInputProps) {
  const isComplete = task.completionState === 'complete';
  const { items, requireAll } = inputFields;
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const resultItems: ChecklistItem[] = items.map((item) => ({
      ...item,
      checked: checked.has(item.key),
    }));
    onResultChange?.({ items: resultItems, requireAll });
  }, [checked, items, requireAll, onResultChange]);

  if (isComplete) {
    const saved = (task.resultFields as Partial<ChecklistInputFields>).items;
    const doneCount = saved ? saved.filter((i) => i.checked).length : 0;
    return (
      <div className="flex items-center gap-2 py-2">
        <span className="text-sm font-medium text-green-600 dark:text-green-400">✓ Complete</span>
        <span className="text-xs text-gray-400">{doneCount} / {items.length} checked</span>
      </div>
    );
  }

  const toggle = (key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleComplete = () => {
    const resultItems: ChecklistItem[] = items.map((item) => ({
      ...item,
      checked: checked.has(item.key),
    }));
    onComplete({ items: resultItems, requireAll });
  };

  const allChecked = items.every((item) => checked.has(item.key));
  const canComplete = requireAll ? allChecked : true;

  return (
    <div className="space-y-1 py-1">
      {items.map((item) => {
        const isChecked = checked.has(item.key);
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => toggle(item.key)}
            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors
              ${isChecked
                ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
                : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
          >
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold
              ${isChecked
                ? 'border-green-500 bg-green-500 text-white'
                : 'border-gray-400 dark:border-gray-500 text-transparent'
              }`}
            >
              ✓
            </span>
            <span className={`text-sm ${isChecked ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-100'}`}>
              {item.label}
            </span>
          </button>
        );
      })}

      {!hideSubmit && (
        <button
          type="button"
          disabled={!canComplete}
          onClick={handleComplete}
          className="mt-2 w-full rounded-lg bg-purple-600 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-40 transition-colors"
        >
          Complete ({checked.size}/{items.length})
        </button>
      )}
    </div>
  );
}
