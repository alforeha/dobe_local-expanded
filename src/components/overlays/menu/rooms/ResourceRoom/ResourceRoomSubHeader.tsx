import type { ResourceType } from '../../../../../types/resource';

const TYPE_LABELS: Record<ResourceType, string> = {
  contact: 'Contacts',
  home: 'Homes',
  vehicle: 'Vehicles',
  account: 'Accounts',
  inventory: 'Inventory',
  doc: 'Docs',
};

interface ResourceRoomSubHeaderProps {
  type: ResourceType;
}

export function ResourceRoomSubHeader({ type }: ResourceRoomSubHeaderProps) {
  return (
    <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center">
      <h3 className="flex-1 text-sm font-semibold text-gray-600 dark:text-gray-300">{TYPE_LABELS[type]}</h3>
    </div>
  );
}
