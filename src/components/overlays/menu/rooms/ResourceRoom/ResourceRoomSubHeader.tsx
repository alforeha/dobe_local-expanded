import { useState } from 'react';
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
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  selectedGroup?: string;
  onGroupChange?: (value: string) => void;
  groupOptions?: string[];
  onSearchFocusChange?: (focused: boolean) => void;
  onGroupFocusChange?: (focused: boolean) => void;
}

export function ResourceRoomSubHeader({
  type,
  searchValue = '',
  onSearchChange,
  selectedGroup = '',
  onGroupChange,
  groupOptions = [],
  onSearchFocusChange,
  onGroupFocusChange,
}: ResourceRoomSubHeaderProps) {
  const [activeInput, setActiveInput] = useState<'search' | 'filter' | null>(null);

  if (type === 'contact') {
    return (
      <div className="border-b border-gray-100 px-4 py-2 dark:border-gray-700">
        <div className="flex w-full items-center gap-2 overflow-hidden">
          <h3 className="shrink-0 text-sm font-semibold text-gray-600 dark:text-gray-300">Contacts</h3>
          <div className="flex flex-1 min-w-0 gap-2 overflow-hidden">
            {activeInput !== 'filter' ? (
              <input
                type="search"
                value={searchValue}
                onChange={(event) => onSearchChange?.(event.target.value)}
                onFocus={() => {
                  setActiveInput('search');
                  onSearchFocusChange?.(true);
                }}
                onBlur={() => {
                  onSearchFocusChange?.(false);
                  if (!searchValue.trim()) setActiveInput(null);
                }}
                placeholder="Search contacts..."
                className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 outline-none transition focus:border-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            ) : null}

            {activeInput !== 'search' ? (
              <select
                value={selectedGroup}
                onChange={(event) => {
                  onGroupChange?.(event.target.value);
                  setActiveInput('filter');
                }}
                onFocus={() => {
                  setActiveInput('filter');
                  onGroupFocusChange?.(true);
                }}
                onBlur={() => {
                  setActiveInput(null);
                  onGroupFocusChange?.(false);
                }}
                className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 outline-none transition focus:border-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">All Groups</option>
                {groupOptions.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center">
      <h3 className="flex-1 text-sm font-semibold text-gray-600 dark:text-gray-300">{TYPE_LABELS[type]}</h3>
    </div>
  );
}
