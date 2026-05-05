import { useEffect, useMemo, useRef, useState } from 'react';
import { IconDisplay } from '../../../shared/IconDisplay';
import { PopupShell } from '../../../shared/popups/PopupShell';
import { useResourceStore } from '../../../../stores/useResourceStore';
import { useScheduleStore } from '../../../../stores/useScheduleStore';
import { isContact, type Event } from '../../../../types';

interface ParticipantsSectionProps {
  event: Event;
  isEditMode: boolean;
  addRequestNonce: number;
}

export function ParticipantsSection({ event, isEditMode, addRequestNonce }: ParticipantsSectionProps) {
  const updateEvent = useScheduleStore((state) => state.updateEvent);
  const resources = useResourceStore((state) => state.resources);
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const lastHandledAddRequestRef = useRef(addRequestNonce);

  const availableContacts = useMemo(() => {
    const existingContactIds = new Set(event.coAttendees.map((attendee) => attendee.contactId));

    return Object.values(resources)
      .filter(isContact)
      .filter((contact) => !existingContactIds.has(contact.id))
      .sort((left, right) => (left.displayName || left.name).localeCompare(right.displayName || right.name));
  }, [event.coAttendees, resources]);

  const filteredContacts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery) return availableContacts;

    return availableContacts.filter((contact) => (
      (contact.displayName || contact.name).toLocaleLowerCase().includes(normalizedQuery)
    ));
  }, [availableContacts, searchQuery]);

  useEffect(() => {
    if (addRequestNonce > lastHandledAddRequestRef.current) {
      setShowAddPopup(true);
    }

    lastHandledAddRequestRef.current = addRequestNonce;
  }, [addRequestNonce]);

  const handleClosePopup = () => {
    setShowAddPopup(false);
    setSearchQuery('');
  };

  const handleAddParticipant = (contactId: string) => {
    const selectedContact = availableContacts.find((contact) => contact.id === contactId);
    if (!selectedContact) return;

    updateEvent(event.id, {
      coAttendees: [
        ...event.coAttendees,
        {
          contactId: selectedContact.id,
          displayName: selectedContact.displayName || selectedContact.name,
        },
      ],
    });
    handleClosePopup();
  };

  const handleRemoveParticipant = (contactId: string) => {
    updateEvent(event.id, {
      coAttendees: event.coAttendees.filter((attendee) => attendee.contactId !== contactId),
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
        Participants
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
        {event.coAttendees.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No participants added
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {event.coAttendees.map((attendee) => (
              <div
                key={attendee.contactId}
                className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200"
              >
                <span>{attendee.displayName}</span>
                {isEditMode && (
                  <button
                    type="button"
                    onClick={() => handleRemoveParticipant(attendee.contactId)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddPopup ? (
        <PopupShell title="Add Participant" onClose={handleClosePopup}>
          <div className="space-y-3">
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search contacts"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />

            {filteredContacts.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                No contacts found — add contacts in the Resources room
              </p>
            ) : (
              <div className="space-y-2">
                {filteredContacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => handleAddParticipant(contact.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-gray-200 px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/60"
                  >
                    {contact.icon ? (
                      <IconDisplay iconKey={contact.icon} size={18} className="h-[18px] w-[18px] shrink-0 object-contain" alt="" />
                    ) : (
                      <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-200">
                        {(contact.displayName || contact.name).slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-100">
                      {contact.displayName || contact.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </PopupShell>
      ) : null}
    </div>
  );
}
