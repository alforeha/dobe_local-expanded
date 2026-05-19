import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useResourceStore } from '../../../../../stores/useResourceStore';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { getAppDate } from '../../../../../utils/dateUtils';
import { isContact } from '../../../../../types';
import type { EventAttendee, PlannedEvent } from '../../../../../types';
import type { EventCenter } from './EventCenterLayer';

interface EventCenterPopupProps {
  center: EventCenter;
  onClose: () => void;
}

export function EventCenterPopup({ center, onClose }: EventCenterPopupProps) {
  const setPlannedEvent = useScheduleStore((state) => state.setPlannedEvent);
  const resources = useResourceStore((state) => state.resources);

  const today = getAppDate();
  const [name, setName] = useState(center.name);
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<string[]>([]);

  const contacts = Object.values(resources).filter(isContact);

  const toggleAttendee = (id: string) => {
    setSelectedAttendeeIds((prev) =>
      prev.includes(id) ? prev.filter((attendeeId) => attendeeId !== id) : [...prev, id],
    );
  };

  const handleSave = () => {
    const coAttendees: EventAttendee[] = selectedAttendeeIds.map((id) => {
      const contact = resources[id];
      return {
        contactId: id,
        displayName: isContact(contact) ? (contact.displayName || contact.name) : id,
      };
    });

    const plannedEvent: PlannedEvent = {
      id: uuidv4(),
      name: name.trim() || center.name,
      description: '',
      icon: 'event-nav-actions',
      color: '#7c3aed',
      seedDate: date,
      dieDate: date,
      recurrenceInterval: {
        frequency: 'daily',
        days: [],
        interval: 1,
        endsOn: date,
        customCondition: null,
      },
      activeState: 'active',
      pools: [],
      taskPoolCursor: 0,
      taskList: [],
      conflictMode: 'concurrent',
      startTime,
      endTime,
      location: {
        latitude: center.latitude,
        longitude: center.longitude,
        placeName: center.name,
      },
      coAttendees,
      sharedWith: null,
      pushReminder: null,
      isOvernight: false,
    };

    setPlannedEvent(plannedEvent);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl dark:bg-gray-800 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Plan Event Here</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            &#x00D7;
          </button>
        </div>

        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          {center.name}
        </p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
              Event name
            </label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
                Start
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
                End
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
          </div>

          {contacts.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
                Co-attendees
              </label>
              <div className="max-h-32 space-y-1 overflow-y-auto">
                {contacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => toggleAttendee(contact.id)}
                    className={`w-full rounded-lg border px-3 py-1.5 text-left text-xs transition-colors ${
                      selectedAttendeeIds.includes(contact.id)
                        ? 'border-purple-400 bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {contact.displayName || contact.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-medium text-gray-600 dark:border-gray-600 dark:text-gray-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded-xl bg-purple-600 py-2 text-sm font-semibold text-white hover:bg-purple-700"
          >
            Save Event
          </button>
        </div>
      </div>
    </div>
  );
}
