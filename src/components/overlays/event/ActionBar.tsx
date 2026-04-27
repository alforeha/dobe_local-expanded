import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './ActionBar.css';

interface ActionBarProps {
  eventId: string;
  activeSection: ActionBarSection;
  onSectionChange: (section: ActionBarSection) => void;
  isEditMode: boolean;
  onEnterEdit: () => void;
  onExitEdit: () => void;
  onSectionAdd?: (section: ActionBarSection) => void;
  onDeleteEvent?: () => void;
  showGlobeButton?: boolean;
  isGlobeViewOpen?: boolean;
  onToggleGlobeView?: () => void;
}

export type ActionBarSection = 'actions' | 'participants' | 'location' | 'attachments';

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

export function ActionBar({ eventId: _eventId, activeSection, onSectionChange, isEditMode, onEnterEdit, onExitEdit, onSectionAdd, onDeleteEvent, showGlobeButton = false, isGlobeViewOpen = false, onToggleGlobeView }: ActionBarProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const dropdownButtonRef = useRef<HTMLButtonElement | null>(null);

  const closeDropdown = () => {
    setIsDropdownOpen(false);
    setConfirmDelete(false);
  };

  useEffect(() => {
    if (!isDropdownOpen) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!dropdownRef.current?.contains(target) && !dropdownButtonRef.current?.contains(target)) {
        closeDropdown();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isDropdownOpen]);

  useLayoutEffect(() => {
    if (!isDropdownOpen || !dropdownButtonRef.current) return;

    const updatePosition = () => {
      if (!dropdownButtonRef.current) return;
      const rect = dropdownButtonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.top - 8,
        left: rect.right,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isDropdownOpen]);

  const handleDeleteClick = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    onDeleteEvent?.();
    closeDropdown();
  };

  const handleSectionSelect = (section: ActionBarSection) => {
    onSectionChange(section);
    closeDropdown();
  };

  const handleAddClick = () => {
    onSectionAdd?.(activeSection);
  };

  const handleEditToggle = () => {
    if (isEditMode) {
      onExitEdit();
    } else {
      onEnterEdit();
    }
    closeDropdown();
  };

  const handleDropdownToggle = () => {
    setIsDropdownOpen((open) => {
      const nextOpen = !open;
      if (!nextOpen) {
        setConfirmDelete(false);
      }
      return nextOpen;
    });
  };

  const handleGlobeToggle = () => {
    closeDropdown();
    onToggleGlobeView?.();
  };

  return (
    <>
      <div className="relative z-[80] flex shrink-0 items-center justify-between border-b border-gray-200 dark:border-gray-700 px-3 py-2">
        {isGlobeViewOpen ? <div /> : (
          <button
            type="button"
            aria-label={addButtonLabels[activeSection]}
            onClick={handleAddClick}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {addButtonLabels[activeSection]}
          </button>
        )}

        <div className="action-bar-right-cluster">
          {showGlobeButton && (
            <button
              type="button"
              aria-label={isGlobeViewOpen ? 'Close globe view' : 'Open globe view'}
              aria-pressed={isGlobeViewOpen}
              onClick={handleGlobeToggle}
              className={`action-bar-globe-button${isGlobeViewOpen ? ' is-active' : ''}`}
            >
              <span aria-hidden="true">🌍</span>
            </button>
          )}

          {!isGlobeViewOpen && (
            <div ref={dropdownRef} className="action-bar-menu-wrap">
              <button
                ref={dropdownButtonRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={isDropdownOpen}
                onClick={handleDropdownToggle}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {sectionLabels[activeSection]}
                <span className="text-xs text-gray-400 dark:text-gray-500">▾</span>
              </button>

              {isDropdownOpen && dropdownPosition && createPortal(
                <div
                  ref={dropdownRef}
                  className="action-bar-dropdown action-bar-dropdown-portal"
                  role="menu"
                  style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
                >
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
                    onClick={handleEditToggle}
                    className="action-bar-menu-item"
                  >
                    <span>{isEditMode ? 'Done' : 'Edit'}</span>
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
                </div>,
                document.body,
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
