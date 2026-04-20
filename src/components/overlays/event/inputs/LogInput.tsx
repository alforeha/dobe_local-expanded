import { useState, useEffect } from 'react';
import type { LogInputFields } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';

interface LogInputProps {
  inputFields: LogInputFields;
  task: Task;
  onComplete: (result: Partial<LogInputFields>) => void;
  hideSubmit?: boolean;
  onResultChange?: (result: Partial<LogInputFields>) => void;
}

export function LogInput({ inputFields, task, onComplete, hideSubmit, onResultChange }: LogInputProps) {
  const isComplete = task.completionState === 'complete';
  const { prompt, unit, logKind } = inputFields;
  const [value, setValue] = useState('');
  const [amount, setAmount] = useState('');
  const [entryMode, setEntryMode] = useState<'set-total' | 'add-distance'>('set-total');

  const currentValue = inputFields.currentValue ?? 0;
  const numericAmount = amount === '' ? null : Number(amount);
  const nextMileage =
    logKind === 'vehicle-mileage'
      ? entryMode === 'set-total'
        ? numericAmount
        : numericAmount !== null
          ? currentValue + numericAmount
          : null
      : null;
  const distanceDriven =
    logKind === 'vehicle-mileage'
      ? entryMode === 'set-total'
        ? nextMileage !== null
          ? Math.max(0, nextMileage - currentValue)
          : null
        : numericAmount
      : null;
  const canSaveMileage =
    nextMileage != null &&
    Number.isFinite(nextMileage) &&
    nextMileage >= currentValue;

  useEffect(() => {
    if (logKind === 'vehicle-mileage') {
      onResultChange?.({
        logKind,
        prompt: prompt ?? null,
        value: value.trim(),
        resourceRef: inputFields.resourceRef ?? null,
        amount: distanceDriven,
        unit: unit ?? 'mi',
        entryMode,
        currentValue,
        newValue: nextMileage,
      });
    } else {
      onResultChange?.({
        prompt: prompt ?? null,
        value: value.trim(),
        resourceRef: inputFields.resourceRef ?? null,
        amount: amount !== '' ? Number(amount) : null,
        unit: unit ?? null,
      });
    }
  }, [value, amount, entryMode, logKind, prompt, unit, distanceDriven, nextMileage, currentValue, inputFields.resourceRef, onResultChange]);

  if (isComplete) {
    const saved = task.resultFields as Partial<LogInputFields>;
    return (
      <div className="space-y-1 py-2">
        <span className="text-sm font-medium text-green-600 dark:text-green-400">Logged</span>
        {saved.logKind === 'vehicle-mileage' && saved.newValue != null ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 italic">
            Mileage updated to {saved.newValue}
          </p>
        ) : null}
        {saved.value && (
          <p className="text-xs text-gray-500 dark:text-gray-400 italic line-clamp-2">{saved.value}</p>
        )}
      </div>
    );
  }

  const handleSave = () => {
    if (logKind === 'vehicle-mileage') {
      if (!canSaveMileage) return;
      onComplete({
        logKind,
        prompt: prompt ?? null,
        value: value.trim(),
        resourceRef: inputFields.resourceRef ?? null,
        amount: distanceDriven,
        unit: unit ?? 'mi',
        entryMode,
        currentValue,
        newValue: nextMileage,
      });
      return;
    }

    if (!value.trim()) return;
    onComplete({
      prompt: prompt ?? null,
      value: value.trim(),
      resourceRef: inputFields.resourceRef ?? null,
      amount: amount !== '' ? Number(amount) : null,
      unit: unit ?? null,
    });
  };

  return (
    <div className="flex h-full flex-col space-y-2 py-1">
      {prompt && (
        <p className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{prompt}</p>
      )}

      {logKind === 'vehicle-mileage' ? (
        <>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Current mileage: <span className="font-semibold text-gray-900 dark:text-gray-100">{currentValue}</span>
          </div>

          <div className="flex rounded-full bg-gray-100 p-1 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => {
                setEntryMode('set-total');
                setAmount('');
              }}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                entryMode === 'set-total'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              Enter new mileage
            </button>
            <button
              type="button"
              onClick={() => {
                setEntryMode('add-distance');
                setAmount('');
              }}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                entryMode === 'add-distance'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              Add amount driven
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <input
              type="number"
              min={entryMode === 'set-total' ? currentValue : 0}
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={entryMode === 'set-total' ? 'New mileage' : 'Miles driven'}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">{unit ?? 'mi'}</span>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
            <div>
              Updated mileage: <span className="font-semibold text-gray-900 dark:text-gray-100">{nextMileage ?? '--'}</span>
            </div>
            <div>
              Miles driven: <span className="font-semibold text-gray-900 dark:text-gray-100">{distanceDriven ?? '--'}</span>
            </div>
          </div>

          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Optional note"
            className="flex-1 min-h-0 w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </>
      ) : (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Log entry..."
          className="flex-1 min-h-0 w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
      )}

      {logKind !== 'vehicle-mileage' && unit !== undefined && unit !== null && (
        <div className="flex shrink-0 items-center gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">{unit}</span>
        </div>
      )}

      {!hideSubmit && (
        <button
          type="button"
          disabled={logKind === 'vehicle-mileage' ? !canSaveMileage : !value.trim()}
          onClick={handleSave}
          className="shrink-0 w-full rounded-lg bg-purple-600 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-40"
        >
          {logKind === 'vehicle-mileage' ? 'Save Mileage' : 'Save Log'}
        </button>
      )}
    </div>
  );
}
