import { useMemo, useState, type ReactNode } from 'react';
import { PopupShell } from './PopupShell';

/** Default row shape understood by the built-in renderer. */
export interface AddFromLibraryRow {
  name: string;
  detail?: string;
  pill?: string;
  icon?: ReactNode;
}

export interface AddFromLibraryTab<T> {
  id: string;
  label: string;
  /** Show the shared search input while this tab is active. Defaults to true for item tabs. */
  searchable?: boolean;
  /** Item source — receives the normalized (lowercased, trimmed) search query. */
  getItems?: (search: string) => T[];
  /** Custom item renderer. Falls back to the built-in row renderer via `toRow`. */
  renderItem?: (item: T, pick: () => void) => ReactNode;
  /** Maps an item to the default row shape when `renderItem` is not provided. */
  toRow?: (item: T) => AddFromLibraryRow;
  /** Stable key per item for list rendering. Defaults to the row name + index. */
  getItemKey?: (item: T) => string;
  emptyMessage?: string;
  /** Fully custom tab content (e.g. a create-new form). Overrides item rendering. */
  content?: ReactNode;
}

interface AddFromLibraryPopupProps<T> {
  title?: string;
  tabs: Array<AddFromLibraryTab<T>>;
  initialTabId?: string;
  onPick: (item: T, tabId: string) => void;
  onClose: () => void;
  /** Render only the picker content without the PopupShell wrapper. */
  embedded?: boolean;
  searchPlaceholder?: string;
}

/**
 * Add from Library popup — generic multi-tab picker (catalog / templates /
 * create-new / resource-style tabs) built on PopupShell. Generalized from
 * TaskPoolAddPanel: tabs supply their own item source and renderer, so the
 * picker carries no domain knowledge.
 */
export function AddFromLibraryPopup<T>({
  title = 'Add from Library',
  tabs,
  initialTabId,
  onPick,
  onClose,
  embedded = false,
  searchPlaceholder = 'Search...',
}: AddFromLibraryPopupProps<T>) {
  const [activeTabId, setActiveTabId] = useState<string>(initialTabId ?? tabs[0]?.id ?? '');
  const [searchQuery, setSearchQuery] = useState('');

  // Fall back to the first tab if the active id is no longer present.
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null;
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const showSearch = Boolean(activeTab && !activeTab.content && (activeTab.searchable ?? true));

  const items = useMemo(
    () => (activeTab && !activeTab.content ? activeTab.getItems?.(normalizedSearch) ?? [] : []),
    [activeTab, normalizedSearch],
  );

  function renderDefaultRow(tab: AddFromLibraryTab<T>, item: T, key: string) {
    const row: AddFromLibraryRow = tab.toRow?.(item) ?? { name: String(item) };
    return (
      <button
        key={key}
        type="button"
        onClick={() => onPick(item, tab.id)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
      >
        {row.icon ? <span className="shrink-0" aria-hidden="true">{row.icon}</span> : null}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{row.name}</div>
          {row.detail ? (
            <div className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{row.detail}</div>
          ) : null}
        </div>
        {row.pill ? (
          <span className="shrink-0 rounded-full bg-accent-bg px-2 py-1 text-xs font-medium text-accent">
            {row.pill}
          </span>
        ) : null}
      </button>
    );
  }

  const content = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTabId(tab.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab?.id === tab.id
                ? 'bg-accent text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {showSearch && (
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-accent dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />
      )}

      {activeTab?.content ?? (
        activeTab && (
          items.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {activeTab.emptyMessage ?? 'No matching items.'}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((item, index) => {
                const key = activeTab.getItemKey?.(item) ?? `${activeTab.id}-${index}`;
                if (activeTab.renderItem) {
                  return (
                    <div key={key}>{activeTab.renderItem(item, () => onPick(item, activeTab.id))}</div>
                  );
                }
                return renderDefaultRow(activeTab, item, key);
              })}
            </div>
          )
        )
      )}
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <PopupShell title={title} onClose={onClose} size="large">
      {content}
    </PopupShell>
  );
}
