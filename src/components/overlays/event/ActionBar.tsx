import { useEffect, useRef, useState } from 'react';
import { PopupShell } from '../../shared/popups/PopupShell';
import './ActionBar.css';

interface ActionBarProps {
  eventId: string;
  activeSection: ActionBarSection;
  onSectionChange: (section: ActionBarSection) => void;
  onEnterEdit: () => void;
  onSectionAdd?: (section: 'actions' | 'participants' | 'location') => void;
  onDeleteEvent?: () => void;
}

export type ActionBarSection = 'actions' | 'participants' | 'location' | 'attachments';

type PopupType = 'addAttachment' | null;

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

export function ActionBar({ eventId: _eventId, activeSection, onSectionChange, onEnterEdit, onSectionAdd, onDeleteEvent }: ActionBarProps) {
  const [openPopup, setOpenPopup] = useState<PopupType>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

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
      onSectionAdd?.('actions');
      return;
    }

    if (activeSection === 'participants') {
      onSectionAdd?.('participants');
      return;
    }

    if (activeSection === 'location') {
      onSectionAdd?.('location');
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

      {openPopup === 'addAttachment' && (
        <PopupShell title="Add Attachment" onClose={() => setOpenPopup(null)}>
          <p className="text-sm text-gray-500 dark:text-gray-400">Attachments - coming in LE-09d</p>
        </PopupShell>
      )}

    </>
  );
}
