import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useResourceStore } from '../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../stores/useUserStore';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { v4 as uuidv4 } from 'uuid';
import { PopupShell } from '../../../../shared/popups/PopupShell';
import { AlbumLocationPicker } from '../../../../shared/AlbumLocationPicker';
import { IconPicker } from '../../../../shared/IconPicker';
import { ColorPicker } from '../../../../shared/ColorPicker';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { materialisePlannedEvent } from '../../../../../engine/materialise';
import { autoCompleteSystemTask } from '../../../../../engine/resourceEngine';
import { storageDelete, storageKey } from '../../../../../storage';
import { localISODate } from '../../../../../utils/dateUtils';
import { forwardGeocode } from '../../../../../utils/geocode';
import { getLibraryTemplatePool } from '../../../../../utils/resolveTaskTemplate';
import { clampTaskPoolCursor, ensureTaskPools } from '../../../../../utils/taskPools';
import { isContact, isHome } from '../../../../../types';
import type { EventAttendee } from '../../../../../types/event';
import type { PlannedEvent, ConflictMode, EventLocation, TaskSet } from '../../../../../types/plannedEvent';
import type { RecurrenceFrequency, RecurrenceRule, TaskTemplate, Weekday } from '../../../../../types/taskTemplate';
import { TaskPoolEditor } from './TaskPoolEditor';

const WEEKDAYS: { key: Weekday; label: string }[] = [
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'S' },
  { key: 'sun', label: 'S' },
];

const CONFLICT_MODES: { value: ConflictMode; label: string }[] = [
  { value: 'concurrent', label: 'Concurrent' },
  { value: 'override', label: 'Override' },
  { value: 'shift', label: 'Shift' },
  { value: 'truncate', label: 'Truncate' },
];

const WEEKDAY_KEYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function todayISO(): string {
  return localISODate(new Date());
}

function isTodayARecurrenceDay(rule: RecurrenceRule): boolean {
  if (rule.frequency === 'daily') return true;
  if (rule.frequency === 'monthly') return true;
  if (rule.frequency === 'weekly') {
    if (!rule.days || rule.days.length === 0) return true;
    const todayKey = WEEKDAY_KEYS[new Date().getDay()];
    return todayKey !== undefined && rule.days.includes(todayKey);
  }
  return true;
}


function getIntervalHint(frequency: RecurrenceFrequency): string {
  if (frequency === 'daily') return '1 = daily, 2 = every 2 days';
  if (frequency === 'weekly') return '1 = weekly, 2 = every 2 weeks';
  if (frequency === 'monthly') return '1 = monthly, 3 = every 3 months';
  return 'Interval between each custom recurrence cycle';
}

function getIntervalUnitLabel(frequency: RecurrenceFrequency): string {
  if (frequency === 'daily') return 'day(s)';
  if (frequency === 'weekly') return 'week(s)';
  if (frequency === 'monthly') return 'month(s)';
  return 'cycle(s)';
}

export interface RoutinePopupPrefill {
  name: string;
  icon: string;
  color: string;
  startTime?: string;
  endTime?: string;
  isOvernight?: boolean;
  pools: TaskSet[];
  recurrenceInterval: RecurrenceRule;
}

interface RoutinePopupProps {
  editRoutine: PlannedEvent | null;
  prefill?: RoutinePopupPrefill;
  onClose: () => void;
  isPrebuilt?: boolean;
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

export function RoutinePopup({ editRoutine, prefill, onClose, isPrebuilt = false }: RoutinePopupProps) {
  const setPlannedEvent = useScheduleStore((s) => s.setPlannedEvent);
  const removePlannedEvent = useScheduleStore((s) => s.removePlannedEvent);
  const addRoutineRef = useUserStore((s) => s.addRoutineRef);
  const removeRoutineRef = useUserStore((s) => s.removeRoutineRef);
  const libraryTemplates = useMemo(() => getLibraryTemplatePool(), []);

  const isEditMode = editRoutine !== null;
  void isPrebuilt;
  const initialPools = ensureTaskPools(isEditMode ? editRoutine.pools : prefill?.pools);

  const [name, setName] = useState(isEditMode ? editRoutine.name : (prefill?.name ?? ''));
  const [iconKey, setIconKey] = useState(isEditMode ? editRoutine.icon : (prefill?.icon ?? 'routine'));
  const [color, setColor] = useState(isEditMode ? editRoutine.color : (prefill?.color ?? '#6366f1'));
  const [pools, setPools] = useState<TaskSet[]>(initialPools);
  const [taskPoolCursor, setTaskPoolCursor] = useState<number>(clampTaskPoolCursor(initialPools, isEditMode ? editRoutine.taskPoolCursor : 0));
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(
    isEditMode ? editRoutine.recurrenceInterval.frequency : (prefill?.recurrenceInterval.frequency ?? 'daily'),
  );
  const [days, setDays] = useState<Weekday[]>(
    isEditMode ? editRoutine.recurrenceInterval.days : (prefill?.recurrenceInterval.days ?? []),
  );
  const [interval, setInterval] = useState<number | ''>(
    isEditMode ? editRoutine.recurrenceInterval.interval : (prefill?.recurrenceInterval.interval ?? 1),
  );
  const [monthlyDay, setMonthlyDay] = useState<number | ''>(
    isEditMode
      ? (editRoutine.recurrenceInterval.monthlyDay ?? Number(editRoutine.seedDate.split('-')[2] ?? 1))
      : (prefill?.recurrenceInterval.monthlyDay ?? Number((prefill ? todayISO() : todayISO()).split('-')[2] ?? 1)),
  );
  const [dieDate, setDieDate] = useState<string>(isEditMode ? (editRoutine.dieDate ?? '') : '');
  const [customCondition, setCustomCondition] = useState<string>(
    isEditMode && editRoutine.recurrenceInterval.customCondition
      ? editRoutine.recurrenceInterval.customCondition
      : (prefill?.recurrenceInterval.customCondition ?? ''),
  );
  const [conflictMode, setConflictMode] = useState<ConflictMode>(isEditMode ? editRoutine.conflictMode : 'concurrent');
  const [startTime, setStartTime] = useState(isEditMode ? editRoutine.startTime : (prefill?.startTime ?? '09:00'));
  const [endTime, setEndTime] = useState(isEditMode ? editRoutine.endTime : (prefill?.endTime ?? '10:00'));
  const [coAttendees, setCoAttendees] = useState<EventAttendee[]>(isEditMode ? (editRoutine.coAttendees ?? []) : []);
  const [location, setLocation] = useState<EventLocation | null>(isEditMode ? (editRoutine.location ?? null) : null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [seedDate, setSeedDate] = useState(isEditMode ? editRoutine.seedDate : todayISO());

  const isOvernight = prefill?.isOvernight === true || (startTime !== '' && endTime !== '' && endTime < startTime);
  const inputCls =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200';
  const inputNoWidthCls = inputCls.replace('w-full ', '');

  function toggleDay(day: Weekday) {
    setDays((prev) => (prev.includes(day) ? prev.filter((entry) => entry !== day) : [...prev, day]));
  }

  function handleSave() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    if (interval !== '' && interval < 1) {
      setError('Recurrence interval must be at least 1.');
      return;
    }
    if (frequency === 'monthly' && (monthlyDay === '' || monthlyDay < 1 || monthlyDay > 31)) {
      setError('Monthly day must be between 1 and 31.');
      return;
    }

    if (dieDate && dieDate < seedDate) {
      setError('Die date cannot be before seed date.');
      return;
    }

    const today = todayISO();

    const recurrenceInterval: RecurrenceRule = {
      frequency,
      days: frequency === 'weekly' ? days : [],
      monthlyDay: frequency === 'monthly' ? (monthlyDay === '' ? null : monthlyDay) : null,
      interval: interval === '' ? 1 : interval,
      endsOn: dieDate || null,
      customCondition: frequency === 'custom' ? (customCondition.trim() || null) : null,
    };

    if (isEditMode) {
      const updated: PlannedEvent = {
        ...editRoutine,
        name: name.trim(),
        icon: iconKey,
        color,
        seedDate,
        dieDate: dieDate || null,
        pools,
        taskPoolCursor,
        recurrenceInterval,
        conflictMode,
        startTime,
        endTime,
        isOvernight,
        location,
        coAttendees,
      };
      setPlannedEvent(updated);
    } else {
      const id = uuidv4();
      const newRoutine: PlannedEvent = {
        id,
        name: name.trim(),
        description: '',
        icon: iconKey,
        color,
        seedDate,
        dieDate: dieDate || null,
        recurrenceInterval,
        activeState: 'active',
        pools,
        taskPoolCursor,
        taskList: [],
        conflictMode,
        startTime,
        endTime,
        isOvernight,
        location,
        coAttendees,
        sharedWith: null,
        pushReminder: null,
      };

      setPlannedEvent(newRoutine);
      addRoutineRef(id);
      autoCompleteSystemTask('task-sys-add-routine');

      if (seedDate <= today && isTodayARecurrenceDay(recurrenceInterval)) {
        const currentTemplates = useScheduleStore.getState().taskTemplates;
        const materialiseTemplates = Object.fromEntries([
          ...libraryTemplates
            .filter((template): template is TaskTemplate & { id: string } => !!template.id)
            .map((template) => [template.id, template] as const),
          ...Object.entries(currentTemplates),
        ]);
        materialisePlannedEvent(newRoutine, today, materialiseTemplates);
      }
    }

    onClose();
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (editRoutine) {
      removePlannedEvent(editRoutine.id);
      storageDelete(storageKey.plannedEvent(editRoutine.id));
      removeRoutineRef(editRoutine.id);
    }
    onClose();
  }

  return (
    <PopupShell title={isEditMode ? 'Edit Routine' : 'Add Routine'} onClose={onClose} size="large">
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="grid grid-cols-[56px_minmax(0,1fr)_56px] gap-3 sm:gap-4">
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
              placeholder="Morning routine"
              className={inputCls}
            />
          </Field>

          <Field label="Color">
            <ColorPicker value={color} onChange={setColor} align="right" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="min-w-0 space-y-3">
            <label className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">Start</label>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Date</label>
              <input type="date" value={seedDate} onChange={(event) => setSeedDate(event.target.value)} className={inputCls} />
              <p className="text-xs text-gray-400 italic">When this routine begins.</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Time</label>
              <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="min-w-0 space-y-3">
            <label className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">End</label>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Date</label>
              <input type="date" value={dieDate} onChange={(event) => setDieDate(event.target.value)} className={inputCls} />
              <p className="text-xs text-gray-400 italic">Leave empty to keep this routine forever.</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Time</label>
              <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className={inputCls} />
              {isOvernight && <p className="text-xs text-gray-400 italic">Overnight routine: ends the following day.</p>}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-900/20">
          <div className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-300">Repeats</div>
          <div className="mb-3 flex flex-wrap items-end gap-3 pb-1">
            <div className="flex shrink-0 flex-col gap-1">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-300">Frequency</label>
              <select
                value={frequency}
                onChange={(event) => setFrequency(event.target.value as RecurrenceFrequency)}
                className={`${inputCls} w-[8.5rem] shrink-0`}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-300">Every</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={interval}
                  onChange={(event) => setInterval(event.target.value === '' ? '' : Number(event.target.value))}
                  className={`${inputNoWidthCls} w-14 shrink-0`}
                  title={getIntervalHint(frequency)}
                />
                <span className="shrink-0 text-sm text-gray-500 dark:text-gray-300">{getIntervalUnitLabel(frequency)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
              {frequency === 'monthly' && (
                <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-[110px_minmax(0,1fr)]">
                  {frequency === 'monthly' && (
                    <Field label="Day" hint="31 uses the last day in shorter months.">
                      <input
                        type="number"
                        min={1}
                        max={31}
                        step={1}
                        value={monthlyDay}
                        onChange={(event) => setMonthlyDay(event.target.value === '' ? '' : Number(event.target.value))}
                        className={inputCls}
                      />
                    </Field>
                  )}
                </div>
              )}

              {frequency === 'weekly' && (
                <div className="grid grid-cols-1 gap-3">
                  <Field label="Days">
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map(({ key, label }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleDay(key)}
                          className={`h-9 w-9 rounded-full border text-xs font-semibold transition-colors ${
                            days.includes(key)
                              ? 'border-purple-500 bg-purple-500 text-white'
                              : 'border-gray-300 bg-white text-gray-600 hover:border-purple-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>
              )}

              {frequency === 'custom' && (
                <div className="grid grid-cols-1 gap-3">
                  <Field label="Expression">
                    <input
                      type="text"
                      value={customCondition}
                      onChange={(event) => setCustomCondition(event.target.value)}
                      placeholder="last-monday-of-month"
                      className={inputCls}
                    />
                  </Field>
                </div>
              )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <Field
            label="Task pool"
            hint="Filter by stat, switch to selected-only to drag the order, and use the list below as the rotation pool."
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

        <ParticipantsEditor coAttendees={coAttendees} setCoAttendees={setCoAttendees} />

        <LocationEditor location={location} setLocation={setLocation} />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div>
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
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
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
