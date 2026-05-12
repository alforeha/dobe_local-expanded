import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { PopupShell } from '../../../../shared/popups/PopupShell';
import { AlbumLocationPicker } from '../../../../shared/AlbumLocationPicker';
import { IconPicker } from '../../../../shared/IconPicker';
import { ColorPicker } from '../../../../shared/ColorPicker';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { useResourceStore } from '../../../../../stores/useResourceStore';
import { materialisePlannedEvent } from '../../../../../engine/materialise';
import { storageDelete, storageKey } from '../../../../../storage';
import { localISODate } from '../../../../../utils/dateUtils';
import { forwardGeocode } from '../../../../../utils/geocode';
import { getLibraryTemplatePool } from '../../../../../utils/resolveTaskTemplate';
import { clampTaskPoolCursor, ensureTaskPools } from '../../../../../utils/taskPools';
import { isContact, isHome } from '../../../../../types';
import type { EventAttendee } from '../../../../../types/event';
import type { PlannedEvent, ConflictMode, EventLocation, TaskSet } from '../../../../../types/plannedEvent';
import type { TaskTemplate } from '../../../../../types/taskTemplate';
import { TaskPoolEditor } from './TaskPoolEditor';

const CONFLICT_MODES: { value: ConflictMode; label: string }[] = [
  { value: 'concurrent', label: 'Concurrent' },
  { value: 'override', label: 'Override' },
  { value: 'shift', label: 'Shift' },
  { value: 'truncate', label: 'Truncate' },
];

function todayISO(): string {
  return localISODate(new Date());
}

function addHour(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const totalMinutes = ((hours * 60 + minutes + 60) % 1440 + 1440) % 1440;
  const nextHours = Math.floor(totalMinutes / 60);
  const nextMinutes = totalMinutes % 60;
  return `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`;
}


interface OneOffEventPopupProps {
  editEvent: PlannedEvent | null;
  onClose: () => void;
}

interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

function Field({ label, hint, children, className }: FieldProps) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <label className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 italic">{hint}</p>}
    </div>
  );
}

interface ResourceLocationOption {
  id: string;
  address: string;
  icon: string;
  placeName: string;
}

function formatCoordinateLabel(location: EventLocation): string {
  return `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
}

interface ParticipantsEditorProps {
  coAttendees: EventAttendee[];
  setCoAttendees: React.Dispatch<React.SetStateAction<EventAttendee[]>>;
}

function ParticipantsEditor({ coAttendees, setCoAttendees }: ParticipantsEditorProps) {
  const resources = useResourceStore((state) => state.resources);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const availableContacts = useMemo(() => {
    const existingContactIds = new Set(coAttendees.map((attendee) => attendee.contactId));

    return Object.values(resources)
      .filter(isContact)
      .filter((contact) => !existingContactIds.has(contact.id))
      .sort((left, right) => (left.displayName || left.name).localeCompare(right.displayName || right.name));
  }, [coAttendees, resources]);

  const filteredContacts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery) return availableContacts;

    return availableContacts.filter((contact) => (
      (contact.displayName || contact.name).toLocaleLowerCase().includes(normalizedQuery)
    ));
  }, [availableContacts, searchQuery]);

  function handleAddParticipant(contactId: string) {
    const selectedContact = availableContacts.find((contact) => contact.id === contactId);
    if (!selectedContact) return;

    setCoAttendees((prev) => [
      ...prev,
      {
        contactId: selectedContact.id,
        displayName: selectedContact.displayName || selectedContact.name,
      },
    ]);
    setSearchQuery('');
    setIsPickerOpen(false);
  }

  function handleRemoveParticipant(contactId: string) {
    setCoAttendees((prev) => prev.filter((attendee) => attendee.contactId !== contactId));
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-900/20">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">Participants</div>
        <button
          type="button"
          onClick={() => setIsPickerOpen((current) => !current)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Add Participant
        </button>
      </div>

      {coAttendees.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 px-4 py-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          No participants added.
        </div>
      ) : (
        <div className="mb-3 flex flex-wrap gap-2">
          {coAttendees.map((attendee) => (
            <div
              key={attendee.contactId}
              className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            >
              <span>{attendee.displayName}</span>
              <button
                type="button"
                onClick={() => handleRemoveParticipant(attendee.contactId)}
                className="rounded-full px-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                aria-label={`Remove ${attendee.displayName}`}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {isPickerOpen ? (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800/80">
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search contacts"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          />

          {filteredContacts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              No matching contacts found.
            </p>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
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
      ) : null}
    </div>
  );
}

interface LocationEditorProps {
  location: EventLocation | null;
  setLocation: React.Dispatch<React.SetStateAction<EventLocation | null>>;
}

function LocationEditor({ location, setLocation }: LocationEditorProps) {
  const resources = useResourceStore((state) => state.resources);
  const [isResourcePickerOpen, setIsResourcePickerOpen] = useState(false);
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const resourceOptions = useMemo<ResourceLocationOption[]>(() => {
    const homes = Object.values(resources)
      .filter(isHome)
      .filter((home) => Boolean(home.address?.trim()))
      .map((home) => ({
        id: `home:${home.id}`,
        address: home.address!.trim(),
        icon: home.icon,
        placeName: home.name,
      }));

    const contacts = Object.values(resources)
      .filter(isContact)
      .filter((contact) => Boolean(contact.address?.trim()))
      .map((contact) => ({
        id: `contact:${contact.id}`,
        address: contact.address!.trim(),
        icon: contact.icon,
        placeName: contact.displayName || contact.name,
      }));

    return [...homes, ...contacts].sort((left, right) => left.placeName.localeCompare(right.placeName));
  }, [resources]);

  async function handleResourceSelect(option: ResourceLocationOption) {
    setIsSaving(true);
    setStatusMessage(null);

    try {
      const result = await forwardGeocode(option.address);
      if (!result) {
        setStatusMessage('Unable to resolve that address.');
        return;
      }

      setLocation({
        latitude: result.lat,
        longitude: result.lng,
        placeName: option.placeName,
      });
      setIsResourcePickerOpen(false);
      setStatusMessage('Location saved.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleClearLocation() {
    setLocation(null);
    setStatusMessage('Location cleared.');
  }

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-900/20">
        <div className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">Location</div>

        {location ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-800/70">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                {location.placeName?.trim() || formatCoordinateLabel(location)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{formatCoordinateLabel(location)}</div>
            </div>
            <button
              type="button"
              onClick={handleClearLocation}
              className="shrink-0 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              Clear
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setIsResourcePickerOpen((current) => !current)}
                className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Set from Resource
              </button>
              <button
                type="button"
                onClick={() => setIsMapPickerOpen(true)}
                className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Set from Map
              </button>
            </div>

            {isResourcePickerOpen ? (
              <div className="mt-3 rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700 dark:bg-gray-800/80">
                {resourceOptions.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">No home or contact resources with addresses found.</p>
                ) : (
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {resourceOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => { void handleResourceSelect(option); }}
                        disabled={isSaving}
                        className="flex w-full items-start gap-3 rounded-xl border border-gray-200 px-3 py-2 text-left transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:hover:bg-gray-700/60"
                      >
                        <IconDisplay iconKey={option.icon} size={18} className="mt-0.5 h-[18px] w-[18px] shrink-0 object-contain" alt="" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{option.placeName}</div>
                          <div className="truncate text-xs text-gray-500 dark:text-gray-400">{option.address}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}

        {statusMessage ? <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{statusMessage}</p> : null}
      </div>

      {isMapPickerOpen ? (
        <AlbumLocationPicker
          initialLocation={location ?? undefined}
          onCancel={() => setIsMapPickerOpen(false)}
          onConfirm={(nextLocation) => {
            setLocation(nextLocation ?? null);
            setStatusMessage(nextLocation ? 'Location saved.' : 'Location cleared.');
            setIsMapPickerOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

export function OneOffEventPopup({ editEvent, onClose }: OneOffEventPopupProps) {
  const setPlannedEvent = useScheduleStore((s) => s.setPlannedEvent);
  const removePlannedEvent = useScheduleStore((s) => s.removePlannedEvent);
  const archiveEvent = useScheduleStore((s) => s.archiveEvent);
  const libraryTemplates = useMemo(() => getLibraryTemplatePool(), []);
  const tabOptions: Array<{ key: 'details' | 'tasks' | 'additional'; label: string }> = [
    { key: 'details', label: 'Details' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'additional', label: 'Additional' },
  ];

  const isEditMode = editEvent !== null;
  const initialStartDate = isEditMode ? editEvent.seedDate : todayISO();
  const initialPools = ensureTaskPools(isEditMode ? editEvent.pools : undefined);

  const [name, setName] = useState(isEditMode ? editEvent.name : '');
  const [iconKey, setIconKey] = useState(isEditMode ? editEvent.icon : 'event');
  const [startDate, setStartDate] = useState(initialStartDate);
  const [startTime, setStartTime] = useState(isEditMode ? editEvent.startTime : '09:00');
  const [endDate, setEndDate] = useState(isEditMode ? (editEvent.dieDate ?? editEvent.seedDate) : initialStartDate);
  const [endTime, setEndTime] = useState(isEditMode ? editEvent.endTime : addHour('09:00'));
  const [color, setColor] = useState(isEditMode ? editEvent.color : '#6366f1');
  const [pools, setPools] = useState<TaskSet[]>(initialPools);
  const [taskPoolCursor, setTaskPoolCursor] = useState<number>(clampTaskPoolCursor(initialPools, isEditMode ? editEvent.taskPoolCursor : 0));
  const [conflictMode, setConflictMode] = useState<ConflictMode>(isEditMode ? editEvent.conflictMode : 'concurrent');
  const [description, setDescription] = useState(isEditMode ? editEvent.description : '');
  const [coAttendees, setCoAttendees] = useState<EventAttendee[]>(isEditMode ? (editEvent.coAttendees ?? []) : []);
  const [location, setLocation] = useState<EventLocation | null>(isEditMode ? (editEvent.location ?? null) : null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [dateError, setDateError] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'tasks' | 'additional'>('details');

  const inputCls =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200';
  const startsAt = `${startDate}T${startTime}:00`;
  const endsAt = `${endDate}T${endTime}:00`;
  const endsAfterStart = new Date(endsAt).getTime() > new Date(startsAt).getTime();

  function handleSave() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (startDate > endDate) {
      setDateError('Start date must be before end date');
      return;
    }
    if (!endsAfterStart) {
      setDateError('End date and time must be after the start.');
      return;
    }

    setError('');
    setDateError('');

    const today = todayISO();
    const recurrenceInterval = {
      frequency: 'daily' as const,
      days: [],
      interval: 1,
      endsOn: startDate,
      customCondition: null,
    };
    const shouldMaterialiseImmediately = startDate <= today;
    const isHistoricalEvent = endDate < today;

    if (isEditMode) {
      const updated: PlannedEvent = {
        ...editEvent,
        name: name.trim(),
        description,
        icon: iconKey,
        color,
        seedDate: startDate,
        dieDate: endDate,
        recurrenceInterval,
        conflictMode,
        startTime,
        endTime,
        pools,
        taskPoolCursor,
        location,
        coAttendees,
      };
      setPlannedEvent(updated);

      if (shouldMaterialiseImmediately) {
        const currentTemplates = useScheduleStore.getState().taskTemplates;
        const materialiseTemplates = Object.fromEntries([
          ...libraryTemplates
            .filter((template): template is TaskTemplate & { id: string } => !!template.id)
            .map((template) => [template.id, template] as const),
          ...Object.entries(currentTemplates),
        ]);
        const { event } = materialisePlannedEvent(updated, startDate, materialiseTemplates);
        if (isHistoricalEvent) {
          archiveEvent(event.id);
        }
        // One-off event is now active — remove from plannedEvents
        removePlannedEvent(editEvent.id);
        storageDelete(storageKey.plannedEvent(editEvent.id));
      }
    } else {
      const id = uuidv4();
      const newEvent: PlannedEvent = {
        id,
        name: name.trim(),
        description,
        icon: iconKey,
        color,
        seedDate: startDate,
        dieDate: endDate,
        recurrenceInterval,
        activeState: 'active',
        pools,
        taskPoolCursor,
        taskList: [],
        conflictMode,
        startTime,
        endTime,
        location,
        coAttendees,
        sharedWith: null,
        pushReminder: null,
      };

      if (shouldMaterialiseImmediately) {
        // Materialise immediately — no need to keep in plannedEvents
        setPlannedEvent(newEvent);
        const currentTemplates = useScheduleStore.getState().taskTemplates;
        const materialiseTemplates = Object.fromEntries([
          ...libraryTemplates
            .filter((template): template is TaskTemplate & { id: string } => !!template.id)
            .map((template) => [template.id, template] as const),
          ...Object.entries(currentTemplates),
        ]);
        const { event } = materialisePlannedEvent(newEvent, startDate, materialiseTemplates);
        if (isHistoricalEvent) {
          archiveEvent(event.id);
        }
      } else {
        // Future event — keep in plannedEvents for midnight rollover
        setPlannedEvent(newEvent);
      }
    }

    onClose();
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (editEvent) {
      removePlannedEvent(editEvent.id);
      storageDelete(storageKey.plannedEvent(editEvent.id));
    }
    onClose();
  }

  return (
    <PopupShell title={isEditMode ? 'Edit Event' : 'Add One-off Event'} onClose={onClose} size="large">
      <div className="flex min-h-0 flex-col gap-4" style={{ height: 'calc(100vh - 120px)' }}>
        <div className="shrink-0 grid grid-cols-[56px_minmax(0,1fr)_56px] gap-3 sm:gap-4">
          <Field label="Icon">
            <IconPicker value={iconKey} onChange={setIconKey} align="left" />
          </Field>

          <Field label="Name">
            <input
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError('');
              }}
              placeholder="Doctor appointment"
              className={inputCls}
            />
          </Field>

          <Field label="Color">
            <ColorPicker value={color} onChange={setColor} align="right" />
          </Field>
        </div>

        <div className="inline-flex w-full shrink-0 rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-900/30">
          {tabOptions.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100'
                    : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="space-y-4">
            {activeTab === 'details' && (
              <>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="min-w-0 space-y-3">
                    <label className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">Start</label>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Date</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(event) => {
                          const nextDate = event.target.value;
                          setStartDate(nextDate);
                          if (endDate < nextDate) {
                            setEndDate(nextDate);
                          }
                          setError('');
                          setDateError('');
                        }}
                        className={inputCls}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Time</label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(event) => {
                          const nextTime = event.target.value;
                          setStartTime(nextTime);
                          if (!isEditMode && startDate === endDate) {
                            setEndTime(addHour(nextTime));
                          }
                          setDateError('');
                        }}
                        className={inputCls}
                      />
                    </div>
                  </div>

                  <div className="min-w-0 space-y-3">
                    <label className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">End</label>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Date</label>
                      <input
                        type="date"
                        value={endDate}
                        min={startDate}
                        onChange={(event) => {
                          setEndDate(event.target.value);
                          setError('');
                          setDateError('');
                        }}
                        className={inputCls}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Time</label>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(event) => {
                          setEndTime(event.target.value);
                          setError('');
                          setDateError('');
                        }}
                        className={inputCls}
                      />
                      {!endsAfterStart && <p className="text-xs text-gray-400 italic">End date/time must be after the start.</p>}
                    </div>
                  </div>
                </div>

                {dateError && <p className="text-sm text-red-500">{dateError}</p>}
              </>
            )}

            {activeTab === 'tasks' && (
              <div className="min-h-0 overflow-hidden">
                <Field
                  label="Task pool"
                  hint="Filter by stat, toggle selected-only, and drag rows to control task order."
                  className="h-full min-h-0"
                >
                  <TaskPoolEditor
                    pools={pools}
                    activeCursor={taskPoolCursor}
                    onChange={(nextPools, nextCursor) => {
                      setPools(nextPools);
                      setTaskPoolCursor(nextCursor);
                    }}
                  />
                </Field>
              </div>
            )}

            {activeTab === 'additional' && (
              <>
                <Field label="Note">
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={2}
                    className={`${inputCls} resize-none`}
                    placeholder="Optional notes"
                  />
                </Field>

                <ParticipantsEditor coAttendees={coAttendees} setCoAttendees={setCoAttendees} />

                <LocationEditor location={location} setLocation={setLocation} />

                <Field label="Conflict mode">
                  <select
                    value={conflictMode}
                    onChange={(event) => setConflictMode(event.target.value as ConflictMode)}
                    className={inputCls}
                  >
                    {CONFLICT_MODES.map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </Field>
              </>
            )}
          </div>
        </div>

        {error && <p className="shrink-0 text-sm text-red-500">{error}</p>}

        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {isEditMode && (
              <button
                type="button"
                onClick={handleDelete}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  confirmDelete
                    ? 'bg-red-600 text-white'
                    : 'border border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                }`}
              >
                {confirmDelete ? 'Confirm Delete' : 'Delete'}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </PopupShell>
  );
}
