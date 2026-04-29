import { useEffect } from 'react';
import { itemLibrary } from '../../../../coach/ItemLibrary';
import type { InventoryItemTemplate } from '../../../../types/resource';
import type { Task } from '../../../../types/task';
import type { ConsumeInputFields } from '../../../../types/taskTemplate';
import { useUserStore } from '../../../../stores/useUserStore';
import { getLibraryItem, getUserInventoryItemTemplates, mergeInventoryItemTemplates, resolveInventoryItemTemplate } from '../../../../utils/inventoryItems';

interface ConsumeInputProps {
  inputFields: ConsumeInputFields;
  task: Task;
  onComplete: (result: Partial<ConsumeInputFields>) => void;
  hideSubmit?: boolean;
  onResultChange?: (result: Partial<ConsumeInputFields>) => void;
}

function getEntryActionLabel(action: ConsumeInputFields['entries'][number]['action']): string {
  return action === 'replenish' ? 'Replenish' : 'Consume';
}

export function ConsumeInput({ inputFields, task, onComplete, hideSubmit, onResultChange }: ConsumeInputProps) {
  const isComplete = task.completionState === 'complete';
  const user = useUserStore((state) => state.user);
  const userTemplates = getUserInventoryItemTemplates(user);

  useEffect(() => {
    onResultChange?.({
      label: inputFields.label,
      entries: inputFields.entries,
    });
  }, [inputFields.entries, inputFields.label, onResultChange]);

  const availableTemplates: InventoryItemTemplate[] = mergeInventoryItemTemplates(
    userTemplates,
    itemLibrary
      .map((item) => getLibraryItem(item.id))
      .filter((item): item is InventoryItemTemplate => item != null),
  );

  if (isComplete) {
    const savedEntries = ((task.resultFields as Partial<ConsumeInputFields>).entries ?? inputFields.entries);
    return (
      <div className="flex items-center gap-2 py-2">
        <span className="text-sm font-medium text-green-600 dark:text-green-400">✓ Complete</span>
        <span className="text-xs text-gray-400">{savedEntries.length} item{savedEntries.length === 1 ? '' : 's'} confirmed</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 py-1">
      <div>
        <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{inputFields.label}</div>
      </div>

      {inputFields.entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
          No items configured for this task.
        </div>
      ) : (
        <div className="space-y-2">
          {inputFields.entries.map((entry, index) => {
            const resolvedTemplate = resolveInventoryItemTemplate(entry.itemTemplateRef, availableTemplates);
            const itemName = resolvedTemplate?.name ?? (entry.itemTemplateRef || `Item ${index + 1}`);
            return (
              <div
                key={`${entry.itemTemplateRef || 'unresolved'}:${index}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-800"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{itemName}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Quantity {entry.quantity}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                  entry.action === 'replenish'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                }`}>
                  {getEntryActionLabel(entry.action)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!hideSubmit && (
        <button
          type="button"
          onClick={() => onComplete({ label: inputFields.label, entries: inputFields.entries })}
          className="w-full rounded-lg bg-purple-600 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
        >
          Complete
        </button>
      )}
    </div>
  );
}