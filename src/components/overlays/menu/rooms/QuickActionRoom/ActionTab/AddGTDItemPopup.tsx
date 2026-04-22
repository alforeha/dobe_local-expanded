import { useState } from 'react';
import { PopupShell } from '../../../../../shared/popups/PopupShell';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { addManualGTDItem } from '../../../../../../engine/listsEngine';

const TASK_TYPE_OPTIONS = ['CHECK', 'COUNTER', 'DURATION', 'TIMER', 'RATING', 'TEXT'] as const;

function getDefaultParameters(taskType: string): Record<string, unknown> {
  switch (taskType) {
    case 'COUNTER':
      return { target: 1, unit: '', step: 1 };
    case 'DURATION':
      return { targetDuration: 300, unit: 'minutes' };
    case 'TIMER':
      return { countdownFrom: 60 };
    case 'RATING':
      return { scale: 5, label: '' };
    case 'TEXT':
      return { prompt: '', maxLength: null };
    case 'CHECK':
    default:
      return {};
  }
}

interface AddGTDItemPopupProps {
  onClose: () => void;
}

export function AddGTDItemPopup({ onClose }: AddGTDItemPopupProps) {
  const user = useUserStore((s) => s.user);

  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState<string>('CHECK');
  const [parameters, setParameters] = useState<Record<string, unknown>>(() => getDefaultParameters('CHECK'));
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');

  function setTaskParameter(key: string, value: unknown) {
    setParameters((current) => ({ ...current, [key]: value }));
  }

  function handleTaskTypeChange(nextTaskType: string) {
    setTaskType(nextTaskType);
    setParameters(getDefaultParameters(nextTaskType));
  }

  function renderParameterInputs() {
    switch (taskType) {
      case 'COUNTER':
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                Target
              </label>
              <input
                type="number"
                min={1}
                value={Number(parameters.target ?? 1)}
                onChange={(e) => setTaskParameter('target', Math.max(1, Number(e.target.value) || 1))}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                Unit
              </label>
              <input
                type="text"
                value={String(parameters.unit ?? '')}
                onChange={(e) => setTaskParameter('unit', e.target.value)}
                placeholder="times"
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
          </div>
        );
      case 'DURATION':
        return (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
              Minutes
            </label>
            <input
              type="number"
              min={1}
              value={Math.max(1, Math.round(Number(parameters.targetDuration ?? 300) / 60))}
              onChange={(e) => setTaskParameter('targetDuration', Math.max(1, Number(e.target.value) || 1) * 60)}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
        );
      case 'TIMER':
        return (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
              Seconds
            </label>
            <input
              type="number"
              min={1}
              value={Number(parameters.countdownFrom ?? 60)}
              onChange={(e) => setTaskParameter('countdownFrom', Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
        );
      case 'RATING':
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                Out of
              </label>
              <input
                type="number"
                min={2}
                max={10}
                value={Number(parameters.scale ?? 5)}
                onChange={(e) => {
                  const value = Number(e.target.value) || 5;
                  setTaskParameter('scale', Math.min(10, Math.max(2, value)));
                }}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                Prompt
              </label>
              <input
                type="text"
                value={String(parameters.label ?? '')}
                onChange={(e) => setTaskParameter('label', e.target.value)}
                placeholder="How would you rate this?"
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
          </div>
        );
      case 'TEXT':
        return (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
              Prompt
            </label>
            <input
              type="text"
              value={String(parameters.prompt ?? '')}
              onChange={(e) => setTaskParameter('prompt', e.target.value)}
              placeholder="Add a note."
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
        );
      case 'CHECK':
      default:
        return null;
    }
  }

  function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Title is required.');
      return;
    }
    if (!user) return;

    addManualGTDItem(
      {
        title: trimmedTitle,
        note: note.trim() || null,
        templateRef: null,
        taskType,
        parameters,
        resourceRef: null,
        dueDate: dueDate || null,
      },
      user,
    );
    onClose();
  }

  return (
    <PopupShell title="Add GTD Item" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError('');
            }}
            placeholder="What needs to be done?"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            autoFocus
          />
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
            Task type
          </label>
          <div className="grid grid-cols-3 gap-2">
            {TASK_TYPE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleTaskTypeChange(option)}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                  taskType === option
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {renderParameterInputs()}

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
            Note <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Additional context"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
            Due date <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </PopupShell>
  );
}
