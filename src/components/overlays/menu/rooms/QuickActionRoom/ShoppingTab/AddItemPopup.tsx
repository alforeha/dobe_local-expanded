import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { PopupShell } from '../../../../../shared/popups/PopupShell';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { addShoppingItem } from '../../../../../../engine/listsEngine';

const UNIT_OPTIONS = ['qty', 'kg', 'L'];

interface AddItemPopupProps {
  listId: string;
  onClose: () => void;
}

export function AddItemPopup({ listId, onClose }: AddItemPopupProps) {
  const user = useUserStore((s) => s.user);
  const resources = useResourceStore((s) => s.resources);

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [accountRef, setAccountRef] = useState('');
  const [error, setError] = useState('');

  // Collect account resources from the user's account list
  const accountResourceIds = user?.resources.accounts ?? [];
  const accountOptions = accountResourceIds
    .map((id) => resources[id])
    .filter(Boolean);

  function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Item name is required.');
      return;
    }
    if (!user) return;

    const parsedQty = quantity.trim() !== '' ? parseFloat(quantity) : null;

    addShoppingItem(
      listId,
      {
        id: uuidv4(),
        name: trimmedName,
        useableRef: null,
        quantity: parsedQty !== null && !isNaN(parsedQty) ? parsedQty : null,
        unit: unit.trim() || null,
        accountRef: accountRef || null,
        completed: false,
        completedAt: null,
      },
      user,
    );
    onClose();
  }

  return (
    <PopupShell title="Add Item" onClose={onClose}>
      <div className="space-y-3">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
            Item name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            placeholder="e.g. Milk, Screws…"
            autoFocus
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>

        {/* Quantity / Amount */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
              Qty / Amount <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 2, 9.99"
              min="0"
              step="any"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Unit */}
          <div className="w-28">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
              Unit <span className="text-gray-400">(optional)</span>
            </label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-2 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">—</option>
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Account link */}
        {accountOptions.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
              Account <span className="text-gray-400">(optional — for pending transaction)</span>
            </label>
            <select
              value={accountRef}
              onChange={(e) => setAccountRef(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">— None —</option>
              {accountOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}

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
            Add
          </button>
        </div>
      </div>
    </PopupShell>
  );
}
