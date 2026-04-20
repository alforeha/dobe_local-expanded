import { useState } from 'react';
import { PopupShell } from '../../../../../shared/popups/PopupShell';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { createShoppingList } from '../../../../../../engine/listsEngine';

interface AddListPopupProps {
  onClose: () => void;
}

export function AddListPopup({ onClose }: AddListPopupProps) {
  const user = useUserStore((s) => s.user);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('List name is required.');
      return;
    }
    if (!user) return;
    createShoppingList(trimmed, user);
    onClose();
  }

  return (
    <PopupShell title="New Shopping List" onClose={onClose}>
      <div className="space-y-3">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
            List name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            placeholder="e.g. Groceries, Hardware…"
            autoFocus
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            Create
          </button>
        </div>
      </div>
    </PopupShell>
  );
}
