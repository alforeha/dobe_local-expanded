import { useState, useEffect } from 'react';
import type { TextInputFields } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';

interface TextInputProps {
  inputFields: TextInputFields;
  task: Task;
  onComplete: (result: Partial<TextInputFields>) => void;
  hideSubmit?: boolean;
  onResultChange?: (result: Partial<TextInputFields>) => void;
}

export function TextInput({ inputFields, task, onComplete, hideSubmit, onResultChange }: TextInputProps) {
  const isComplete = task.completionState === 'complete';
  const { prompt, maxLength } = inputFields;
  const [text, setText] = useState('');

  useEffect(() => {
    onResultChange?.({ prompt, maxLength, value: text.trim() });
  }, [text, prompt, maxLength, onResultChange]);

  if (isComplete) {
    const saved = (task.resultFields as Partial<TextInputFields>).value;
    return (
      <div className="space-y-1 py-2">
        <span className="text-sm font-medium text-green-600 dark:text-green-400">✓ Saved</span>
        {saved && (
          <p className="text-xs text-gray-500 dark:text-gray-400 italic line-clamp-2">{saved}</p>
        )}
      </div>
    );
  }

  const handleSave = () => {
    if (!text.trim()) return;
    onComplete({ prompt, maxLength, value: text.trim() });
  };

  return (
    <div className="h-full flex flex-col space-y-2 py-1">
      {prompt && (
        <p className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{prompt}</p>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={maxLength ?? undefined}
        placeholder="Type your response…"
        className="flex-1 min-h-0 w-full resize-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:border-purple-500 focus:outline-none"
      />
      {!hideSubmit && (
        <div className="flex shrink-0 items-center justify-between">
          {maxLength !== null ? (
            <span className="text-xs text-gray-400">{text.length} / {maxLength}</span>
          ) : (
            <span />
          )}
          <button
            type="button"
            disabled={!text.trim()}
            onClick={handleSave}
            className="rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-40 transition-colors"
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}
