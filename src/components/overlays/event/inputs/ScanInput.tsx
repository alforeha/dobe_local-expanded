import { useState } from 'react';
import type { ScanInputFields } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';

interface ScanInputProps {
  inputFields: ScanInputFields;
  task: Task;
  onComplete: (result: Partial<ScanInputFields>) => void;
}

export function ScanInput({ inputFields, task, onComplete }: ScanInputProps) {
  const isComplete = task.completionState === 'complete';
  const { scanType } = inputFields;

  const [value, setValue] = useState('');

  const handleSave = () => {
    if (!value.trim()) return;
    onComplete({ scanType, scannedValue: value.trim() });
  };

  if (isComplete) {
    const saved = task.resultFields as Partial<ScanInputFields>;
    return (
      <div className="space-y-1 py-2">
        <span className="text-sm font-medium text-green-600 dark:text-green-400">✓ Scanned</span>
        {saved.scannedValue && (
          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{saved.scannedValue}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 py-1">
      {/* Web fallback notice */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-700 dark:bg-blue-900/20">
        <span className="mt-0.5 text-blue-500">ℹ</span>
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Camera scan is available in the mobile app. Enter the{' '}
          <span className="font-medium">{scanType}</span> value manually below.
        </p>
      </div>

      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`Enter ${scanType} value…`}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-800 placeholder-gray-400 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      />

      <button
        type="button"
        disabled={!value.trim()}
        onClick={handleSave}
        className="w-full rounded-lg bg-purple-600 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-40"
      >
        Save scan
      </button>
    </div>
  );
}
