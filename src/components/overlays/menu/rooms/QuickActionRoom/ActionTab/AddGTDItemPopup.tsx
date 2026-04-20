import { useState } from 'react';
import { PopupShell } from '../../../../../shared/popups/PopupShell';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { useScheduleStore } from '../../../../../../stores/useScheduleStore';
import { addManualGTDItem } from '../../../../../../engine/listsEngine';

interface AddGTDItemPopupProps {
  onClose: () => void;
}

export function AddGTDItemPopup({ onClose }: AddGTDItemPopupProps) {
  const user = useUserStore((s) => s.user);
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);

  const [title, setTitle] = useState('');
  const [templateRef, setTemplateRef] = useState('');
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');

  const templateOptions = Object.entries(taskTemplates)
    .filter(([, template]) => template.isSystem !== true)
    .sort(([, a], [, b]) => a.name.localeCompare(b.name));

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
        templateRef: templateRef || null,
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
            Template <span className="text-gray-400">(optional)</span>
          </label>
          <select
            value={templateRef}
            onChange={(e) => setTemplateRef(e.target.value)}
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="">Quick check (default)</option>
            {templateOptions.map(([key, template]) => (
              <option key={key} value={key}>
                {template.name} ({template.taskType})
              </option>
            ))}
          </select>
        </div>

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
