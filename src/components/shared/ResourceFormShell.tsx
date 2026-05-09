import type { ReactNode } from 'react';

export interface ResourceFormTab {
  key: string;
  label: string;
  hidden?: boolean;
}

interface ResourceFormShellProps {
  title: string;
  onSave: () => void;
  onCancel?: () => void;
  identityRow?: ReactNode;
  hideChrome?: boolean;
  tabs: ResourceFormTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: ReactNode;
  isSaving?: boolean;
}

export function ResourceFormShell({
  title,
  onSave,
  identityRow,
  hideChrome = false,
  tabs,
  activeTab,
  onTabChange,
  children,
  isSaving = false,
}: ResourceFormShellProps) {
  const visibleTabs = tabs.filter((tab) => tab.hidden !== true);

  return (
    <div className="flex h-full flex-col">
      {!hideChrome ? (
        <div className="shrink-0 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              {title}
            </h3>
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className={`text-sm font-semibold transition-colors ${
                isSaving ? 'text-gray-300' : 'text-blue-500 hover:text-blue-600'
              }`}
            >
              Save
            </button>
          </div>

          {identityRow ? <div className="px-4 pb-3">{identityRow}</div> : null}

          <div className="flex items-center gap-4 px-4 pb-2">
            {visibleTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                className={`border-b-2 pb-0.5 text-xs font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-500'
                    : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
