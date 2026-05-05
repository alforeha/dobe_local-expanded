import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconDisplay } from '../../shared/IconDisplay';
import './ActionBar.css';

interface ActionBarProps {
  eventId: string;
  activeSection: ActionBarSection;
  onSectionChange: (section: ActionBarSection) => void;
  hasLocationData?: boolean;
  isEditMode: boolean;
  onEnterEdit: () => void;
  onExitEdit: () => void;
  onSectionAdd?: (section: ActionBarSection) => void;
  onDeleteEvent?: () => void;
}

export type ActionBarSection = 'actions' | 'participants' | 'album' | 'globe';

const sectionOrder: Array<Exclude<ActionBarSection, 'globe'>> = ['actions', 'participants', 'album'];

const sectionLabels: Record<Exclude<ActionBarSection, 'globe'>, string> = {
  actions: 'Actions',
  participants: 'Participants',
  album: 'Album',
};

const addButtonLabels: Record<Exclude<ActionBarSection, 'globe'>, string> = {
  actions: '+ Task',
  participants: '+ Participant',
  album: '+ Photo',
};

const sectionIcons: Record<ActionBarSection, string> = {
  actions: 'event-nav-actions',
  participants: 'event-nav-participants',
  album: 'event-nav-album',
  globe: 'event-nav-globe',
};

export function ActionBar({ eventId: _eventId, activeSection, onSectionChange, hasLocationData = false, isEditMode, onEnterEdit, onExitEdit, onSectionAdd, onDeleteEvent }: ActionBarProps) {
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

  return (
    <>
      <div className="relative z-[80] flex shrink-0 items-center justify-between border-b border-gray-200 dark:border-gray-700 px-3 py-2">
        {activeSection === 'globe' ? <div /> : (
          <button
            type="button"
            aria-label={addButtonLabels[activeSection]}
            onClick={handleAddClick}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {addButtonLabels[activeSection]}
          </button>
        )}

        <div className="action-bar-controls">
          <div className="action-bar-nav" role="tablist" aria-label="Event sections">
            {sectionOrder.map((section) => {
              const isActive = activeSection === section;
              return (
                <button
                  key={section}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={sectionLabels[section]}
                  onClick={() => onSectionChange(section)}
                  className={`action-bar-nav-button${isActive ? ' is-active' : ''}`}
                >
                  <IconDisplay iconKey={sectionIcons[section]} size={18} className="h-[18px] w-[18px] object-contain" alt="" />
                </button>
              );
            })}

            {hasLocationData ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeSection === 'globe'}
                aria-label="Globe"
                onClick={() => onSectionChange('globe')}
                className={`action-bar-nav-button${activeSection === 'globe' ? ' is-active' : ''}`}
              >
                <IconDisplay iconKey={sectionIcons.globe} size={18} className="h-[18px] w-[18px] object-contain" alt="" />
              </button>
            ) : null}
          </div>

          <div className="action-bar-menu-wrap">
            <button
              ref={dropdownButtonRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={isDropdownOpen}
              onClick={handleDropdownToggle}
              className="action-bar-menu-button"
            >
              <span aria-hidden="true">...</span>
            </button>

            {isDropdownOpen && dropdownPosition && createPortal(
              <div
                ref={dropdownRef}
                className="action-bar-dropdown action-bar-dropdown-portal"
                role="menu"
                style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleEditToggle}
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
              </div>,
              document.body,
            )}
          </div>
        </div>
      </div>
    </>
  );
}
