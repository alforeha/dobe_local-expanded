import { IconDisplay } from '../../../../shared/IconDisplay';
import type { ResourceType } from '../../../../../types/resource';

interface TypeOption {
  id: ResourceType;
  type: ResourceType;
  iconKey: string;
  label: string;
  available: boolean;
}

const TYPES: TypeOption[] = [
  { id: 'contact', type: 'contact', iconKey: 'resource-contact', label: 'Contact', available: true },
  { id: 'home', type: 'home', iconKey: 'resource-home', label: 'Home', available: true },
  { id: 'vehicle', type: 'vehicle', iconKey: 'resource-vehicle', label: 'Vehicle', available: true },
  { id: 'account', type: 'account', iconKey: 'resource-account', label: 'Account', available: true },
  { id: 'doc', type: 'doc', iconKey: 'resource-doc', label: 'Doc', available: true },
];

interface TypeSelectorSheetProps {
  onSelect: (selection: ResourceType) => void;
  onCancel: () => void;
}

export function TypeSelectorSheet({ onSelect, onCancel }: TypeSelectorSheetProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← Back
        </button>
        <h3 className="flex-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
          Add Resource
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <p className="mb-3 text-xs text-gray-400">What type of resource?</p>
        <div className="space-y-2">
          {TYPES.map(({ id, iconKey, label, available }) => (
            <button
              key={id}
              type="button"
              disabled={!available}
              onClick={() => onSelect(id)}
              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                available
                  ? 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700'
                  : 'cursor-not-allowed border-gray-100 bg-gray-50 opacity-50 dark:border-gray-700 dark:bg-gray-800'
              }`}
            >
              <IconDisplay iconKey={iconKey} size={20} className="h-5 w-5 object-contain" alt="" />
              <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-200">
                {label}
              </span>
              {available ? (
                <span className="text-xs text-gray-300">▶</span>
              ) : (
                <span className="text-xs text-gray-400">Soon</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
