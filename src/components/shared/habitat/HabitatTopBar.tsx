import type { ReactNode } from 'react';
import { resolveIcon } from '../../../constants/iconMap';
import { IconDisplay } from '../IconDisplay';

interface HabitatTopBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Opens the Add from Catalog picker (AddFromLibraryPopup). */
  onAddFromLibrary?: () => void;
  /** Opens the Create Custom editor (e.g. TaskTemplatePopup). */
  onCreateCustom?: () => void;
  /** Optional filter row rendered under the search row. */
  children?: ReactNode;
}

/**
 * Habitat top bar — search row plus Add from Catalog / Create Custom actions.
 * Extracted from the retired TaskRoom search row.
 */
export function HabitatTopBar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search...',
  onAddFromLibrary,
  onCreateCustom,
  children,
}: HabitatTopBarProps) {
  return (
    <div className="px-4 pb-2 pt-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 pr-9 text-sm text-gray-800 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-lg leading-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              ×
            </button>
          )}
        </div>

        {onAddFromLibrary && (
          <button
            type="button"
            onClick={onAddFromLibrary}
            aria-label="Add from catalog"
            title="Add from Catalog"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent-border text-accent transition-colors hover:bg-accent-bg"
          >
            <IconDisplay iconKey="task-tab-library" size={18} className="leading-none" alt="" />
          </button>
        )}

        {onCreateCustom && (
          <button
            type="button"
            onClick={onCreateCustom}
            aria-label="Create custom"
            title="Create Custom"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-medium text-white transition-colors hover:bg-accent/90"
          >
            {resolveIcon('add')}
          </button>
        )}
      </div>

      {children}
    </div>
  );
}
