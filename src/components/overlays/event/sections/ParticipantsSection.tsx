import { useEffect, useMemo, useRef, useState } from 'react';
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
  const addSelectRef = useRef<HTMLSelectElement | null>(null);
  const [selectedContactId, setSelectedContactId] = useState('');

  const availableContacts = useMemo(() => {
    const existingContactIds = new Set(event.coAttendees.map((attendee) => attendee.contactId));

    return Object.values(resources)
      .filter(isContact)
      .filter((contact) => !existingContactIds.has(contact.id))
      .sort((left, right) => (left.displayName || left.name).localeCompare(right.displayName || right.name));
  }, [event.coAttendees, resources]);

  useEffect(() => {
    if (availableContacts.length === 0) {
      setSelectedContactId('');
      return;
    }

    if (!availableContacts.some((contact) => contact.id === selectedContactId)) {
      setSelectedContactId(availableContacts[0]?.id ?? '');
    }
  }, [availableContacts, selectedContactId]);

  useEffect(() => {
    if (!isEditMode || addRequestNonce === 0) return;
    addSelectRef.current?.focus();
  }, [addRequestNonce, isEditMode]);

  const handleAddParticipant = () => {
    const selectedContact = availableContacts.find((contact) => contact.id === selectedContactId);
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

        {isEditMode && (
          <div className="mt-auto rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/70">
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Add participant
            </label>

            {availableContacts.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">All contacts are already added.</p>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  ref={addSelectRef}
                  value={selectedContactId}
                  onChange={(event) => setSelectedContactId(event.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  {availableContacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.displayName || contact.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleAddParticipant}
                  disabled={!selectedContactId}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                >
                  Add participant
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}