import { useEffect, useMemo, useRef, useState } from 'react';
import { PopupShell } from '../../shared/popups/PopupShell';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { addTaskToEvent } from '../../../engine/eventExecution';
import { getLibraryTemplatePool } from '../../../utils/resolveTaskTemplate';
import './ActionBar.css';

interface ActionBarProps {
  eventId: string;
  activeSection: ActionBarSection;
  onSectionChange: (section: ActionBarSection) => void;
  onEnterEdit: () => void;
  onDeleteEvent?: () => void;
}

export type ActionBarSection = 'actions' | 'participants' | 'location' | 'attachments';

type PopupType = 'addTask' | 'addParticipant' | 'addLocation' | 'addAttachment' | null;

const sectionOrder: ActionBarSection[] = ['actions', 'participants', 'location', 'attachments'];

const sectionLabels: Record<ActionBarSection, string> = {
  actions: 'Actions',
  participants: 'Participants',
  location: 'Location',
  attachments: 'Attachments',
};

const addButtonLabels: Record<ActionBarSection, string> = {
  actions: '+ Task',
  participants: '+ Participant',
  location: '+ Location',
  attachments: '+ Attachment',
};

export function ActionBar({ eventId, activeSection, onSectionChange, onEnterEdit, onDeleteEvent }: ActionBarProps) {
  const [openPopup, setOpenPopup] = useState<PopupType>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedTemplateRef, setSelectedTemplateRef] = useState('');
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const storeTemplates = useScheduleStore((s) => s.taskTemplates);

  // All non-system templates sorted by name
  const allTemplates = useMemo(() => {
    const map: Record<string, { ref: string; name: string; taskType: string }> = {};
    const libraryTemplates = getLibraryTemplatePool();

    for (const tpl of libraryTemplates) {
      if (tpl.isSystem || !tpl.id) continue;
      map[tpl.id] = { ref: tpl.id, name: tpl.name, taskType: tpl.taskType };
    }

    for (const [key, tpl] of Object.entries(storeTemplates)) {
      if (tpl.isSystem) continue;
      if (key.startsWith('resource-task:')) continue;
      const ref = tpl.id ?? key;
      map[ref] = { ref, name: tpl.name, taskType: tpl.taskType };
    }

    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [storeTemplates]);

  const handleOpenAddTask = () => {
    setSelectedTemplateRef(allTemplates[0]?.ref ?? '');
    setOpenPopup('addTask');
  };

  useEffect(() => {
    if (!isDropdownOpen) {
      setConfirmDelete(false);
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isDropdownOpen]);

  const handleAddTask = () => {
    if (!selectedTemplateRef) return;
    addTaskToEvent(selectedTemplateRef, eventId);
    setOpenPopup(null);
    setSelectedTemplateRef('');
  };

  const handleDeleteClick = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    onDeleteEvent?.();
    setIsDropdownOpen(false);
  };

  const handleSectionSelect = (section: ActionBarSection) => {
    onSectionChange(section);
    setIsDropdownOpen(false);
  };

  const handleAddClick = () => {
    if (activeSection === 'actions') {
      handleOpenAddTask();
      return;
    }

    if (activeSection === 'participants') {
      setOpenPopup('addParticipant');
      return;
    }

    if (activeSection === 'location') {
      setOpenPopup('addLocation');
      return;
    }

    setOpenPopup('addAttachment');
  };

  const handleEnterEdit = () => {
    onEnterEdit();
    setIsDropdownOpen(false);
  };

  return (
    <>
      <div className="relative flex shrink-0 items-center justify-between border-b border-gray-200 dark:border-gray-700 px-3 py-2">
        <button
          type="button"
          aria-label={addButtonLabels[activeSection]}
          onClick={handleAddClick}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          {addButtonLabels[activeSection]}
        </button>

        <div ref={dropdownRef} className="action-bar-menu-wrap">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={isDropdownOpen}
            onClick={() => setIsDropdownOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {sectionLabels[activeSection]}
            <span className="text-xs text-gray-400 dark:text-gray-500">▾</span>
          </button>

          {isDropdownOpen && (
            <div className="action-bar-dropdown" role="menu">
              {sectionOrder.map((section) => (
                <button
                  key={section}
                  type="button"
                  role="menuitem"
                  onClick={() => handleSectionSelect(section)}
                  className={`action-bar-menu-item${activeSection === section ? ' is-active' : ''}`}
                >
                  <span>{sectionLabels[section]}</span>
                </button>
              ))}

              <div className="action-bar-menu-divider" />

              <button
                type="button"
                role="menuitem"
                onClick={handleEnterEdit}
                className="action-bar-menu-item"
              >
                <span>Edit</span>
              </button>

              {onDeleteEvent && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleDeleteClick}
                  className="action-bar-menu-item is-danger"
                >
                  <span>{confirmDelete ? 'Confirm delete' : 'Delete'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {openPopup === 'addParticipant' && (
        <PopupShell title="Add Participant" onClose={() => setOpenPopup(null)}>
          <p className="text-sm text-gray-500 dark:text-gray-400">Participants - coming in LE-09b</p>
        </PopupShell>
      )}

      {openPopup === 'addLocation' && (
        <PopupShell title="Add Location" onClose={() => setOpenPopup(null)}>
          <p className="text-sm text-gray-500 dark:text-gray-400">Location - coming in LE-09b</p>
        </PopupShell>
      )}

      {openPopup === 'addAttachment' && (
        <PopupShell title="Add Attachment" onClose={() => setOpenPopup(null)}>
          <p className="text-sm text-gray-500 dark:text-gray-400">Attachments - coming in LE-09d</p>
        </PopupShell>
      )}

      {openPopup === 'addTask' && (
        <PopupShell title="Add Task" onClose={() => setOpenPopup(null)}>
          <div className="flex flex-col gap-4">
            {allTemplates.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No task templates available.</p>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Select a task
                  </label>
                  <select
                    value={selectedTemplateRef}
                    onChange={(e) => setSelectedTemplateRef(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {allTemplates.map((tpl) => (
                      <option key={tpl.ref} value={tpl.ref}>
                        {tpl.name} — {tpl.taskType}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setOpenPopup(null)}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!selectedTemplateRef}
                    onClick={handleAddTask}
                    className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 active:bg-purple-800 disabled:opacity-40 transition-colors"
                  >
                    Add
                  </button>
                </div>
              </>
            )}
          </div>
        </PopupShell>
      )}
    </>
  );
}
