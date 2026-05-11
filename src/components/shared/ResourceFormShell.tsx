import type { ReactNode } from 'react';
import { IconDisplay } from './IconDisplay';

export interface ResourceFormTab {
  key: string;
  label: string;
  hidden?: boolean;
}

interface ResourceFormShellProps {
  title: string;
  onSave: () => void;
  onCancel?: () => void;
  resourceIcon?: string;
  resourceName?: string;
  hideChrome?: boolean;
  hideTabs?: boolean;
  noScrollContent?: boolean;
  tabs: ResourceFormTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: ReactNode;
  isSaving?: boolean;
}

export function ResourceFormShell({
  onSave,
  resourceIcon,
  resourceName,
  hideChrome = false,
  hideTabs = false,
  noScrollContent = false,
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
          <div className="flex flex-row items-center gap-2 px-3 py-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                {resourceIcon ? (
                  <IconDisplay iconKey={resourceIcon} size={20} className="h-5 w-5 object-contain" alt="" />
                ) : null}
              </div>
              <div className="flex-1 min-w-0 truncate text-sm font-semibold text-gray-700 dark:text-gray-200">
                {resourceName?.trim() || 'Untitled'}
              </div>
            </div>
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className={`shrink-0 text-sm font-semibold transition-colors ${
                isSaving ? 'text-gray-300' : 'text-blue-500 hover:text-blue-600'
              }`}
            >
              Save
            </button>
          </div>

          {!hideTabs ? (
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
          ) : null}
        </div>
      ) : null}

      <div className={noScrollContent ? 'overflow-hidden flex-1' : 'flex-1 overflow-y-auto'}>{children}</div>
    </div>
  );
}
