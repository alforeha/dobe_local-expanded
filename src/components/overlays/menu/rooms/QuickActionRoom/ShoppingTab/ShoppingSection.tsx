import { useState } from 'react';
import { useUserStore } from '../../../../../../stores/useUserStore';
import {
  completeShoppingItem,
  removeShoppingItem,
  completeShoppingList,
  deleteShoppingList,
} from '../../../../../../engine/listsEngine';
import { ShoppingItemBlock } from './ShoppingItemBlock';
import { AddListPopup } from './AddListPopup';
import { AddItemPopup } from './AddItemPopup';

export function ShoppingSection() {
  const user = useUserStore((s) => s.user);
  const shoppingLists = user?.lists.shoppingLists ?? [];

  // Which lists are expanded (default: all collapsed)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // List pending first-tap delete confirm
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // Show add-list popup
  const [showAddList, setShowAddList] = useState(false);
  // Which list the add-item popup is for
  const [addItemListId, setAddItemListId] = useState<string | null>(null);

  function toggleExpand(listId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(listId)) {
        next.delete(listId);
      } else {
        next.add(listId);
      }
      return next;
    });
    // Clear delete confirm if changing focus
    setPendingDeleteId(null);
  }

  function handleToggleItem(listId: string, itemId: string) {
    if (!user) return;
    completeShoppingItem(listId, itemId, user);
  }

  function handleDeleteItem(listId: string, itemId: string) {
    if (!user) return;
    removeShoppingItem(listId, itemId, user);
  }

  function handleCompleteList(listId: string) {
    if (!user) return;
    completeShoppingList(listId, user);
  }

  function handleDeleteListTap(listId: string) {
    if (pendingDeleteId === listId) {
      // Second tap — confirm delete
      if (!user) return;
      deleteShoppingList(listId, user);
      setPendingDeleteId(null);
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(listId);
        return next;
      });
    } else {
      // First tap — arm confirm
      setPendingDeleteId(listId);
    }
  }

  return (
    <>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Shopping Lists
        </h3>
        <button
          type="button"
          onClick={() => setShowAddList(true)}
          className="text-xs text-blue-500 font-medium"
        >
          + New List
        </button>
      </div>

      {shoppingLists.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-6">No shopping lists yet.</p>
      ) : (
        <div className="space-y-3">
          {shoppingLists.map((list) => {
            const isExpanded = expandedIds.has(list.id);
            const isPendingDelete = pendingDeleteId === list.id;
            const allDone = list.items.length > 0 && list.items.every((i) => i.completed);

            return (
              <div
                key={list.id}
                className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                {/* List header */}
                <div className="flex items-center bg-gray-50 dark:bg-gray-800 px-3 py-2 gap-2">
                  {/* Expand toggle */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(list.id)}
                    className="flex-1 flex items-center gap-2 text-left"
                    aria-expanded={isExpanded}
                  >
                    <span className="text-xs text-gray-400 w-3 shrink-0">
                      {isExpanded ? '▾' : '▸'}
                    </span>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                      {list.name}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {list.items.filter((i) => i.completed).length}/{list.items.length}
                    </span>
                  </button>

                  {/* Complete list */}
                  {!allDone && list.items.length > 0 && (
                    <button
                      type="button"
                      aria-label="Complete all items"
                      onClick={() => handleCompleteList(list.id)}
                      className="text-xs text-green-500 font-medium shrink-0 px-1"
                    >
                      ✓ Done
                    </button>
                  )}

                  {/* Add item */}
                  <button
                    type="button"
                    aria-label="Add item"
                    onClick={() => setAddItemListId(list.id)}
                    className="text-xs text-blue-500 font-medium shrink-0 px-1"
                  >
                    + Item
                  </button>

                  {/* Delete list — two-tap confirm */}
                  <button
                    type="button"
                    aria-label={isPendingDelete ? 'Confirm delete list' : 'Delete list'}
                    onClick={() => handleDeleteListTap(list.id)}
                    className={`text-xs font-medium shrink-0 px-1 transition-colors ${
                      isPendingDelete
                        ? 'text-red-500 font-bold'
                        : 'text-gray-300 dark:text-gray-600 hover:text-red-400'
                    }`}
                  >
                    {isPendingDelete ? 'Delete?' : '🗑'}
                  </button>
                </div>

                {/* Items — shown when expanded */}
                {isExpanded && (
                  <div className="px-3 py-2 bg-white dark:bg-gray-900">
                    {list.items.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-2">
                        No items — tap + Item to add.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {list.items.map((item) => (
                          <ShoppingItemBlock
                            key={item.id}
                            item={item}
                            onToggle={(itemId) => handleToggleItem(list.id, itemId)}
                            onDelete={(itemId) => handleDeleteItem(list.id, itemId)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add List popup */}
      {showAddList && <AddListPopup onClose={() => setShowAddList(false)} />}

      {/* Add Item popup */}
      {addItemListId && (
        <AddItemPopup
          listId={addItemListId}
          onClose={() => setAddItemListId(null)}
        />
      )}
    </>
  );
}

