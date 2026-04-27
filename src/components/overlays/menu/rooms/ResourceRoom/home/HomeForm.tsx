import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  type ContactResource,
  type FloorPlanSegmentKind,
  type HomeResource,
  type HomeStory,
  type HomeChore,
  type Resource,
  type ResourceNote,
  type ResourceRecurrenceRule,
  type RecurrenceDayOfWeek,
  isContact,
  makeDefaultRecurrenceRule,
  normalizeRecurrenceMode,
  toRecurrenceRule,
} from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { generateScheduledTasks, generateGTDItems } from '../../../../../../engine/resourceEngine';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { TextInput } from '../../../../../shared/inputs/TextInput';
import { IconPicker } from '../../../../../shared/IconPicker';
import { NotesLogEditor } from '../../../../../shared/NotesLogEditor';
import { HomeLayout } from './HomeLayout';

interface HomeFormProps {
  existing?: HomeResource;
  onSaved: () => void;
  onCancel: () => void;
}

interface ChoreDraft {
  id: string;
  icon: string;
  name: string;
  recurrence: ResourceRecurrenceRule;
  recurrenceMode: 'recurring' | 'never';
  reminderLeadDays: number;
  assignedTo: string;
}

const DOW_LABELS: { key: RecurrenceDayOfWeek; label: string }[] = [
  { key: 'sun', label: 'Su' },
  { key: 'mon', label: 'Mo' },
  { key: 'tue', label: 'Tu' },
  { key: 'wed', label: 'We' },
  { key: 'thu', label: 'Th' },
  { key: 'fri', label: 'Fr' },
  { key: 'sat', label: 'Sa' },
];

const SMALL_INPUT_CLS = 'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

function getDayOfMonth(isoDate: string): number {
  const parsed = Number(isoDate.split('-')[2] ?? 1);
  return Math.min(31, Math.max(1, parsed || 1));
}

function formatDayOfMonth(day: number): string {
  const mod10 = day % 10;
  const mod100 = day % 100;
  if (mod10 === 1 && mod100 !== 11) return `${day}st`;
  if (mod10 === 2 && mod100 !== 12) return `${day}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${day}rd`;
  return `${day}th`;
}

function describeChoreRecurrence(chore: ChoreDraft): string {
  if (normalizeRecurrenceMode(chore.recurrenceMode) === 'never') return 'Intermittent';

  const interval = Math.max(1, chore.recurrence.interval || 1);
  switch (chore.recurrence.frequency) {
    case 'daily':
      return interval === 1 ? 'Daily' : `Every ${interval} days`;
    case 'weekly': {
      const days = chore.recurrence.days.length > 0
        ? chore.recurrence.days.map((day) => DOW_LABELS.find((entry) => entry.key === day)?.label ?? day).join(', ')
        : 'Seed day';
      return interval === 1 ? `Weekly · ${days}` : `Every ${interval} weeks · ${days}`;
    }
    case 'monthly': {
      const day = chore.recurrence.monthlyDay ?? getDayOfMonth(chore.recurrence.seedDate);
      return interval === 1
        ? `Monthly · ${formatDayOfMonth(day)}`
        : `Every ${interval} months · ${formatDayOfMonth(day)}`;
    }
    case 'yearly':
      return interval === 1 ? 'Yearly' : `Every ${interval} years`;
    default:
      return 'Recurring';
  }
}

function describeReminder(leadDays: number): string {
  if (leadDays < 0) return 'No reminder';
  if (leadDays === 0) return 'Day of';
  if (leadDays === 1) return '1 day before';
  return `${leadDays} days before`;
}

function buildHomeFormSnapshot(input: {
  iconKey: string;
  displayName: string;
  address: string;
  notes: ResourceNote[];
  stories: HomeStory[];
  chores: ChoreDraft[];
}): string {
  return JSON.stringify(input);
}

function getAssignableContactIds(homeId: string | undefined, resources: Record<string, Resource>): string[] {
  if (!homeId) return [];

  const ids = new Set<string>();
  const home = resources[homeId];
  if (home && typeof home === 'object' && 'type' in home && home.type === 'home') {
    for (const memberId of home.members ?? []) ids.add(memberId);
    for (const link of home.links ?? []) {
      const target = resources[link.targetResourceId];
      if (target && typeof target === 'object' && 'type' in target && target.type === 'contact') {
        ids.add(target.id);
      }
    }
  }

  for (const resource of Object.values(resources)) {
    if (!resource || typeof resource !== 'object' || !('type' in resource) || resource.type !== 'contact') continue;
    if (resource.linkedHomeId === homeId) ids.add(resource.id);
    for (const link of resource.links ?? []) {
      if (link.targetResourceId === homeId) ids.add(resource.id);
    }
  }

  return [...ids];
}

export function HomeForm({ existing, onSaved, onCancel }: HomeFormProps) {
  const [draftHomeId] = useState(() => existing?.id ?? uuidv4());
  const [iconKey, setIconKey] = useState(existing?.icon ?? 'home');
  const [displayName, setDisplayName] = useState(existing?.name ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [notes, setNotes] = useState<ResourceNote[]>(existing?.notes ?? []);
  const [stories, setStories] = useState<HomeStory[]>(
    (existing?.stories ?? []).map((story) => ({
      ...story,
      placedItems: story.placedItems ?? [],
      photos: story.photos ?? [],
      rooms: story.rooms.map((room) => ({
        ...room,
        placedItems: room.placedItems ?? [],
        photos: room.photos ?? [],
      })),
    })),
  );
  const [chores, setChores] = useState<ChoreDraft[]>(
    existing?.chores?.map((chore) => ({
      id: chore.id,
      icon: chore.icon ?? '',
      name: chore.name,
      recurrence: toRecurrenceRule(chore.recurrence),
      recurrenceMode: normalizeRecurrenceMode(chore.recurrenceMode),
      reminderLeadDays: chore.reminderLeadDays ?? 0,
      assignedTo: chore.assignedTo ?? 'all',
    })) ?? [],
  );
  const [expandedChoreId, setExpandedChoreId] = useState<string | null>(null);

  const allResources = useResourceStore((s) => s.resources);
  const setResource = useResourceStore((s) => s.setResource);
  const setUser = useUserStore((s) => s.setUser);
  const user = useUserStore((s) => s.user);
  const currentExisting = existing ? allResources[existing.id] as HomeResource | undefined : undefined;

  const allContacts = Object.values(allResources).filter(isContact);
  const homeId = draftHomeId;
  const assignableContactIds = getAssignableContactIds(homeId, allResources);
  const memberContacts = allContacts.filter((contact) => assignableContactIds.includes(contact.id));
  const canSave = displayName.trim().length > 0;
  const [initialSnapshot] = useState(() =>
    buildHomeFormSnapshot({
      iconKey: existing?.icon ?? 'home',
      displayName: existing?.name ?? '',
      address: existing?.address ?? '',
      notes: existing?.notes ?? [],
      stories: existing?.stories ?? [],
      chores:
        existing?.chores?.map((chore) => ({
          id: chore.id,
          icon: chore.icon ?? '',
          name: chore.name,
          recurrence: toRecurrenceRule(chore.recurrence),
          recurrenceMode: normalizeRecurrenceMode(chore.recurrenceMode),
          reminderLeadDays: chore.reminderLeadDays ?? 0,
          assignedTo: chore.assignedTo ?? 'all',
        })) ?? [],
    }),
  );
  const isDirty =
    buildHomeFormSnapshot({
      iconKey,
      displayName,
      address,
      notes,
      stories,
      chores,
    }) !== initialSnapshot;

  function addChore() {
    const nextId = uuidv4();
    setChores((prev) => [...prev, {
      id: nextId,
      icon: '',
      name: '',
      recurrence: makeDefaultRecurrenceRule(),
      recurrenceMode: 'never',
      reminderLeadDays: 0,
      assignedTo: 'all',
    }]);
    setExpandedChoreId(nextId);
  }

  function updateChore(id: string, field: keyof ChoreDraft, value: string | number | ResourceRecurrenceRule) {
    setChores((prev) => prev.map((chore) => (chore.id === id ? { ...chore, [field]: value } : chore)));
  }

  function updateChoreRecurrence(id: string, patch: Partial<ResourceRecurrenceRule>) {
    setChores((prev) =>
      prev.map((chore) =>
        chore.id === id
          ? { ...chore, recurrence: { ...chore.recurrence, ...patch } }
          : chore,
      ),
    );
  }

  function toggleChoreDay(id: string, day: RecurrenceDayOfWeek) {
    setChores((prev) =>
      prev.map((chore) => {
        if (chore.id !== id) return chore;
        const days = chore.recurrence.days.includes(day)
          ? chore.recurrence.days.filter((entry) => entry !== day)
          : [...chore.recurrence.days, day];
        return { ...chore, recurrence: { ...chore.recurrence, days } };
      }),
    );
  }

  function removeChore(id: string) {
    setChores((prev) => prev.filter((chore) => chore.id !== id));
    setExpandedChoreId((prev) => (prev === id ? null : prev));
  }

  function handleSave() {
    if (!canSave) return;
    const now = new Date().toISOString();
    const homeId = draftHomeId;
    const createdAt = existing?.createdAt ?? now;

    const finalChores: HomeChore[] = chores
      .filter((chore) => chore.name.trim())
      .map((chore) => ({
        id: chore.id,
        icon: chore.icon.trim(),
        name: chore.name.trim(),
        recurrenceMode: normalizeRecurrenceMode(chore.recurrenceMode),
        recurrence: chore.recurrence,
        reminderLeadDays: normalizeRecurrenceMode(chore.recurrenceMode) === 'recurring' ? chore.reminderLeadDays : -1,
        assignedTo: chore.assignedTo,
      }));

    const finalStories: HomeStory[] = stories
      .map((story, index) => ({
        ...story,
        name: story.name.trim() || `Story ${index + 1}`,
        outlineOrigin: story.outlineOrigin ? { ...story.outlineOrigin } : undefined,
        outlineSegments: story.outlineSegments?.map((segment) => ({
          direction: segment.direction,
          distance: Math.max(1, Number(segment.distance) || 1),
	          kind: (segment.kind === 'door' ? 'door' : 'wall') as FloorPlanSegmentKind,
        })),
        placedItems: story.placedItems ?? [],
        photos: (story.photos ?? []).filter(Boolean),
        rooms: story.rooms
          .filter((room) => room.name.trim() && room.segments.length > 0)
          .map((room) => ({
            ...room,
            name: room.name.trim(),
            icon: room.icon.trim(),
            color: room.color?.trim() || undefined,
            segments: room.segments.map((segment) => ({
              direction: segment.direction,
              distance: Math.max(1, Number(segment.distance) || 1),
	              kind: (segment.kind === 'door' ? 'door' : 'wall') as FloorPlanSegmentKind,
            })),
            placedItems: room.placedItems ?? [],
            photos: (room.photos ?? []).filter(Boolean),
          })),
      }))
      .filter((story) => story.name.trim() || story.rooms.length > 0);

    const currentLinks = (currentExisting?.links ?? existing?.links ?? []).filter((link) => {
      const target = allResources[link.targetResourceId];
      return target?.type === 'contact' && link.relationship.trim().toLowerCase() === 'member';
    });
    const memberIds = currentLinks.map((link) => link.targetResourceId);

    const resource: HomeResource = {
      type: 'home',
      id: homeId,
      icon: iconKey,
      name: displayName.trim(),
      createdAt,
      updatedAt: now,
      address: address.trim() || undefined,
      members: memberIds.length > 0 ? memberIds : undefined,
      stories: finalStories.length > 0 ? finalStories : undefined,
      chores: finalChores.length > 0 ? finalChores : undefined,
      notes,
      links: currentLinks.length > 0 ? currentLinks : undefined,
      linkedAccountIds: existing?.linkedAccountIds,
      sharedWith: existing?.sharedWith ?? null,
    };

    setResource(resource);

    const previousMembers = new Set(currentExisting?.members ?? existing?.members ?? []);
    const nextMembers = new Set(memberIds);
    for (const contact of allContacts) {
      const wasMember = previousMembers.has(contact.id);
      const isMember = nextMembers.has(contact.id);
      if (wasMember === isMember) continue;
      const updatedContact: ContactResource = {
        ...contact,
        linkedHomeId: isMember ? resource.id : contact.linkedHomeId === resource.id ? undefined : contact.linkedHomeId,
        updatedAt: now,
      };
      setResource(updatedContact);
    }

    if (!existing && user) {
      setUser({
        ...user,
        resources: {
          ...user.resources,
          homes: user.resources.homes.includes(resource.id) ? user.resources.homes : [...user.resources.homes, resource.id],
        },
      });
    }

    generateScheduledTasks(resource);
    generateGTDItems(resource);
    onSaved();
  }

  function handleBack() {
    if (isDirty && !window.confirm('Exit and ignore unsaved changes?')) return;
    onCancel();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-700 shrink-0">
        <button type="button" onClick={handleBack} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">Back</button>
        <h3 className="flex-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{existing ? 'Edit Home' : 'New Home'}</h3>
        <button type="button" onClick={handleSave} disabled={!canSave} className={canSave ? 'text-sm font-semibold text-blue-500 hover:text-blue-600' : 'text-sm font-semibold text-gray-300'}>Save</button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 px-4 py-3">
        <div className="grid grid-cols-[auto_1fr] items-end gap-3">
          <IconPicker value={iconKey} onChange={setIconKey} />
          <TextInput label="Name *" value={displayName} onChange={setDisplayName} placeholder="e.g. Main Home" maxLength={100} />
        </div>

        <TextInput label="Address" value={address} onChange={setAddress} placeholder="123 Main St" maxLength={200} />

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Floor plan</span>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              {stories.length} stor{stories.length === 1 ? 'y' : 'ies'} · {stories.reduce((sum, story) => sum + story.rooms.length, 0)} rooms
            </span>
          </div>
          <HomeLayout stories={stories} onChange={setStories} editable homeId={draftHomeId} />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Chores</span>
            <button type="button" onClick={addChore} className="text-xs font-medium text-blue-500 hover:text-blue-600">+ Add chore</button>
          </div>
          {chores.length === 0 && <p className="text-xs italic text-gray-400">No chores added yet.</p>}
          {chores.map((chore) => {
            const isExpanded = expandedChoreId === chore.id;
            const hasAssignableMembers = memberContacts.length > 0;
            const assignedLabel = chore.assignedTo === 'all'
              ? 'Any member'
              : (memberContacts.find((contact) => contact.id === chore.assignedTo)?.name ?? 'Any member');
            const scheduleSummary = normalizeRecurrenceMode(chore.recurrenceMode) === 'recurring'
              ? `${describeChoreRecurrence(chore)} · ${describeReminder(chore.reminderLeadDays)}`
              : describeChoreRecurrence(chore);
            const summaryMeta = hasAssignableMembers
              ? `${scheduleSummary} · ${assignedLabel}`
              : scheduleSummary;

            return (
              <div key={chore.id} className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700">
                <button
                  type="button"
                  onClick={() => setExpandedChoreId((prev) => (prev === chore.id ? null : chore.id))}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white dark:bg-gray-800">
                    <IconDisplay iconKey={chore.icon?.trim() || 'home'} size={20} className="h-5 w-5 object-contain" alt="" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                      {chore.name.trim() || 'Untitled chore'}
                    </div>
                    <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {summaryMeta}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-blue-500">{isExpanded ? 'Close' : 'Edit'}</span>
                </button>

                {isExpanded ? (
                  <div className="mt-3 space-y-3 border-t border-gray-200 pt-3 dark:border-gray-600">
                    <div className="flex items-center gap-2">
                      <IconPicker value={chore.icon || 'home'} onChange={(value) => updateChore(chore.id, 'icon', value)} align="left" />
                      <input type="text" value={chore.name} onChange={(event) => updateChore(chore.id, 'name', event.target.value)} placeholder="Chore name" className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex rounded-full bg-white p-1 dark:bg-gray-800">
                        {(['recurring', 'never'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => updateChore(chore.id, 'recurrenceMode', mode)}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                              normalizeRecurrenceMode(chore.recurrenceMode) === mode
                                ? 'bg-blue-500 text-white'
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                            }`}
                          >
                            {mode === 'recurring' ? 'Recurring' : 'Intermittent'}
                          </button>
                        ))}
                      </div>

                      {normalizeRecurrenceMode(chore.recurrenceMode) === 'recurring' ? (
                        <select
                          value={chore.recurrence.frequency}
                          onChange={(event) =>
                            updateChoreRecurrence(chore.id, {
                              frequency: event.target.value as ResourceRecurrenceRule['frequency'],
                              days: event.target.value === 'weekly' ? chore.recurrence.days : [],
                              monthlyDay:
                                event.target.value === 'monthly'
                                  ? (chore.recurrence.monthlyDay ?? getDayOfMonth(chore.recurrence.seedDate))
                                  : null,
                            })
                          }
                          className={`ml-auto w-36 ${SMALL_INPUT_CLS}`}
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly</option>
                        </select>
                      ) : null}
                    </div>

                    {normalizeRecurrenceMode(chore.recurrenceMode) === 'recurring' ? (
                      <div className="space-y-2 rounded-md border border-gray-200 bg-white px-3 py-3 dark:border-gray-600 dark:bg-gray-800/70">
                        {chore.recurrence.frequency === 'monthly' ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Every</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={chore.recurrence.interval}
                                  onChange={(event) => updateChoreRecurrence(chore.id, { interval: Math.max(1, Number(event.target.value) || 1) })}
                                  className={SMALL_INPUT_CLS}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Day of month</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={31}
                                  value={chore.recurrence.monthlyDay ?? getDayOfMonth(chore.recurrence.seedDate)}
                                  onChange={(event) =>
                                    updateChoreRecurrence(chore.id, {
                                      monthlyDay: Math.min(31, Math.max(1, Number(event.target.value) || 1)),
                                    })
                                  }
                                  className={SMALL_INPUT_CLS}
                                />
                              </div>
                            </div>
                            <p className="text-[11px] text-gray-400 dark:text-gray-500">
                              Days 29-31 use the last day of shorter months automatically.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Interval</label>
                            <input
                              type="number"
                              min={1}
                              max={99}
                              value={chore.recurrence.interval}
                              onChange={(event) => updateChoreRecurrence(chore.id, { interval: Math.max(1, Number(event.target.value) || 1) })}
                              className={SMALL_INPUT_CLS}
                            />
                          </div>
                        )}

                        {chore.recurrence.frequency === 'weekly' ? (
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Days</label>
                            <div className="flex gap-1">
                              {DOW_LABELS.map(({ key, label }) => (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => toggleChoreDay(chore.id, key)}
                                  className={`h-7 w-7 rounded text-xs font-medium transition-colors ${
                                    chore.recurrence.days.includes(key)
                                      ? 'bg-blue-500 text-white'
                                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Start date</label>
                          <input
                            type="date"
                            value={chore.recurrence.seedDate}
                            onChange={(event) =>
                              updateChoreRecurrence(chore.id, {
                                seedDate: event.target.value,
                                monthlyDay:
                                  chore.recurrence.frequency === 'monthly'
                                    ? (chore.recurrence.monthlyDay ?? getDayOfMonth(event.target.value))
                                    : chore.recurrence.monthlyDay,
                              })
                            }
                            className={SMALL_INPUT_CLS}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Ends on</label>
                          <input
                            type="date"
                            value={chore.recurrence.endsOn ?? ''}
                            onChange={(event) => updateChoreRecurrence(chore.id, { endsOn: event.target.value || null })}
                            className={SMALL_INPUT_CLS}
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">Reminder:</span>
                          <select
                            value={chore.reminderLeadDays}
                            onChange={(event) => updateChore(chore.id, 'reminderLeadDays', Number(event.target.value))}
                            className="ml-auto w-40 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                          >
                            <option value={-1}>No reminder</option>
                            <option value={0}>Day of</option>
                            <option value={1}>1 day before</option>
                            <option value={3}>3 days before</option>
                            <option value={7}>7 days before</option>
                            <option value={14}>14 days before</option>
                          </select>
                        </div>
                      </div>
                    ) : null}

                    {hasAssignableMembers ? (
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">Assign chore to:</span>
                        <select value={chore.assignedTo} onChange={(event) => updateChore(chore.id, 'assignedTo', event.target.value)} className="ml-auto w-40 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
                          <>
                          <option value="all">Any member</option>
                          {memberContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
                          </>
                        </select>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between pt-1">
                      <button type="button" onClick={() => removeChore(chore.id)} className="text-xs text-gray-400 hover:text-red-400">Remove</button>
                      <button type="button" onClick={() => setExpandedChoreId(null)} className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600">
                        Save
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <NotesLogEditor
          notes={notes}
          onChange={setNotes}
          resource={existing}
          linkTabLabel="Members"
          allowedLinkTypes={['contact']}
          fixedLinkRelationship="member"
        />
      </div>
    </div>
  );
}
