import type { ShoppingItem } from '../../../../../../types/user';

interface ShoppingItemBlockProps {
  item: ShoppingItem;
  onToggle: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}

export function ShoppingItemBlock({ item, onToggle, onDelete }: ShoppingItemBlockProps) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg transition-opacity ${
        item.completed ? 'opacity-50' : ''
      }`}
    >
      {/* Toggle checkbox */}
      <button
        type="button"
        aria-label={item.completed ? 'Mark incomplete' : 'Complete item'}
        onClick={() => onToggle(item.id)}
        className="shrink-0 text-base"
      >
        {item.completed ? '☑️' : '⬜'}
      </button>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm truncate ${
            item.completed ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-200'
          }`}
        >
          {item.name}
        </p>
        {item.quantity !== null && (
          <p className="text-xs text-gray-400">
            {item.quantity}
            {item.unit ? ` ${item.unit}` : ''}
          </p>
        )}
      </div>

      {/* Delete — single tap */}
      <button
        type="button"
        aria-label="Delete item"
        onClick={() => onDelete(item.id)}
        className="shrink-0 text-gray-300 hover:text-red-400 dark:text-gray-600 dark:hover:text-red-400 transition-colors px-1"
      >
        ✕
      </button>
    </div>
  );
}
