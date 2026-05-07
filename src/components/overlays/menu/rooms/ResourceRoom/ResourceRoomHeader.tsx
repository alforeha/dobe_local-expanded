import { IconDisplay } from '../../../../shared/IconDisplay';
import type { ResourceType } from '../../../../../types/resource';

const RESOURCE_TYPES: ResourceType[] = [
  'contact',
  'home',
  'vehicle',
  'account',
  'inventory',
  'doc',
];

const TYPE_ICONS: Record<ResourceType, string> = {
  contact: 'resource-tab-contacts',
  home: 'resource-tab-homes',
  vehicle: 'resource-tab-vehicles',
  account: 'resource-tab-accounts',
  inventory: 'resource-tab-inventory',
  doc: 'resource-tab-docs',
};

interface ResourceRoomHeaderProps {
  activeType: ResourceType;
  onTypeChange: (type: ResourceType) => void;
  onAdd: () => void;
}

export function ResourceRoomHeader({ activeType, onTypeChange, onAdd }: ResourceRoomHeaderProps) {
  return (
    <div className="border-b border-gray-100 px-4 pb-2 pt-4 dark:border-gray-700">
      <div className="mb-2 flex items-center">
        <h2 className="flex-1 text-base font-semibold text-gray-800 dark:text-gray-100">Resources</h2>
        <button
          type="button"
          onClick={onAdd}
          aria-label="Add resource"
          className="text-2xl leading-none text-blue-500 transition-colors hover:text-blue-600"
        >
          +
        </button>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {RESOURCE_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onTypeChange(type)}
            aria-label={type}
            title={type}
            className={`flex h-9 w-10 shrink-0 items-center justify-center rounded-full px-1 transition-colors ${
              activeType === type
                ? 'bg-blue-500 text-white'
                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            <IconDisplay iconKey={TYPE_ICONS[type]} size={18} className="leading-none" alt="" />
          </button>
        ))}
      </div>
    </div>
  );
}
