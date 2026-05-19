import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { getAppDate } from '../../../../../utils/dateUtils';
import type { Event, EventAlbumEntry } from '../../../../../types';
import type { GalleryPhoto } from './GalleryPinLayer';

interface EventizePopupProps {
  photo: GalleryPhoto;
  onClose: () => void;
}

function roundToNearestHour(isoString: string): string {
  const date = new Date(isoString);
  const minutes = date.getMinutes();
  if (minutes >= 30) {
    date.setHours(date.getHours() + 1);
  }
  date.setMinutes(0, 0, 0);
  return date.toTimeString().slice(0, 5);
}

function formatTimeDisplay(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

export function EventizePopup({ photo, onClose }: EventizePopupProps) {
  const activeEvents = useScheduleStore((state) => state.activeEvents);
  const historyEvents = useScheduleStore((state) => state.historyEvents);
  const setActiveEvent = useScheduleStore((state) => state.setActiveEvent);
  const archiveEvent = useScheduleStore((state) => state.archiveEvent);

  const initialTime = photo.capturedAt ? roundToNearestHour(photo.capturedAt) : '09:00';
  const [name, setName] = useState('Photo Event');
  const [date, setDate] = useState(photo.date);
  const [time, setTime] = useState(initialTime);

  const existingOnDate = useMemo(() => {
    const all = [...Object.values(activeEvents), ...Object.values(historyEvents)];
    return all.filter(
      (event): event is Event =>
        'startDate' in event && event.startDate === date && event.eventType !== 'quickActions',
    );
  }, [activeEvents, historyEvents, date]);

  const [addToEventId, setAddToEventId] = useState<string | null>(null);

  const handleSave = () => {
    const today = getAppDate();
    const isToday = date === today;
    const isPast = date < today;

    const albumEntry: EventAlbumEntry = {
      id: uuidv4(),
      date,
      photoUri: photo.uri,
      location: {
        latitude: photo.latitude,
        longitude: photo.longitude,
      },
    };

    if (addToEventId) {
      const target =
        (activeEvents[addToEventId] as Event | undefined) ??
        (historyEvents[addToEventId] as Event | undefined);
      if (target) {
        const updated: Event = {
          ...target,
          eventAlbum: [...(target.eventAlbum ?? []), albumEntry],
        };
        setActiveEvent(updated);
      }
      onClose();
      return;
    }

    const newEvent: Event = {
      id: uuidv4(),
      eventType: 'standard',
      plannedEventRef: null,
      name: name.trim() || 'Photo Event',
      icon: 'camera',
      color: null,
      startDate: date,
      startTime: time,
      endDate: date,
      endTime: time,
      tasks: [],
      completionState: isPast ? 'complete' : 'pending',
      xpAwarded: 0,
      attachments: [],
      eventAlbum: [albumEntry],
      location: null,
      note: null,
      sharedWith: [],
      coAttendees: [],
    };

    setActiveEvent(newEvent);
    if (isPast && !isToday) {
      archiveEvent(newEvent.id);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl dark:bg-gray-800 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Eventize Photo</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            &#x00D7;
          </button>
        </div>

        {existingOnDate.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
              Add to existing event on {date}
            </p>
            <div className="space-y-1">
              {existingOnDate.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => setAddToEventId(addToEventId === event.id ? null : event.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                    addToEventId === event.id
                      ? 'border-purple-400 bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300'
                  }`}
                >
                  <span className="font-semibold">{event.name}</span>
                  <span className="ml-2 text-gray-400">{event.startTime}</span>
                </button>
              ))}
            </div>
            {addToEventId && (
              <button
                type="button"
                onClick={() => setAddToEventId(null)}
                className="mt-1 text-xs text-gray-400 underline"
              >
                Create new instead
              </button>
            )}
          </div>
        )}

        {!addToEventId && (
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
            <div className="flex gap-3">
              <div className="flex-1">
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
              <div className="flex-1">
                <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
                  Time
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
            </div>
          </div>
        )}

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
            className="flex-1 rounded-xl bg-amber-500 py-2 text-sm font-semibold text-white hover:bg-amber-600"
          >
            {addToEventId ? 'Add to Event' : 'Create Event'}
          </button>
        </div>

        <div className="mt-3 flex justify-center gap-4 text-xs text-gray-400">
          <span>{photo.date}</span>
          <span>{formatTimeDisplay(initialTime)}</span>
        </div>
      </div>
    </div>
  );
}
