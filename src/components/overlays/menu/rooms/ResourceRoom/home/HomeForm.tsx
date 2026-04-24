import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  type ContactResource,
  type HomeContainer,
  type HomeResource,
  type HomeRoom,
  type HomeStory,
  type HomeChore,
  type ItemInstance,
  type ItemRecurringTask,
  type Resource,
  type ResourceNote,
  type ResourceRecurrenceRule,
  type RecurrenceDayOfWeek,
  isContact,
  isInventory,
  type InventoryContainer,
  makeDefaultRecurrenceRule,
  normalizeRecurrenceMode,
  toRecurrenceRule,
} from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { generateScheduledTasks, generateGTDItems } from '../../../../../../engine/resourceEngine';
import {
  getItemTemplateByRef,
  itemLibrary,
  makeCustomItemTemplateRef,
  type ItemKind,
} from '../../../../../../coach/ItemLibrary';
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

interface ItemDraft {
  id: string;
  itemTemplateRef: string;
  customName: string;
  customIcon: string;
  kind: ItemKind;
  quantity: number | '';
  threshold: number | '';
  unit: string;
  recurringTasks: ItemRecurringTask[];
}

interface ContainerDraft {
  id: string;
  name: string;
  icon: string;
  items: ItemDraft[];
}

interface RoomDraft {
  id: string;
  icon: string;
  name: string;
  assignedTo: string[];
  containers: ContainerDraft[];
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

function describeRoomAssignment(room: RoomDraft, contacts: ContactResource[]): string | null {
  if (contacts.length === 0) return null;
  if (room.assignedTo.length === 0) return 'Any member';
  const assigned = contacts.find((contact) => contact.id === room.assignedTo[0]);
  return assigned?.name ?? 'Any member';
}

function buildHomeFormSnapshot(input: {
  iconKey: string;
  displayName: string;
  address: string;
  notes: ResourceNote[];
  rooms: RoomDraft[];
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

function itemDraftFromInstance(item: ItemInstance): ItemDraft {
  const template = getItemTemplateByRef(item.itemTemplateRef);
  return {
    id: item.id,
    itemTemplateRef: template?.isCustom ? '__custom__' : item.itemTemplateRef,
    customName: template?.isCustom ? template.name : '',
    customIcon: template?.isCustom ? template.icon : '',
    kind: template?.kind ?? 'consumable',
    quantity: item.quantity ?? '',
    threshold: item.threshold ?? '',
    unit: item.unit ?? '',
    recurringTasks: item.recurringTasks ?? [],
  };
}

function buildItemInstance(item: ItemDraft): ItemInstance | null {
  const itemTemplateRef =
    item.itemTemplateRef === '__custom__'
      ? makeCustomItemTemplateRef(item.customName, item.kind, item.customIcon || 'resource-task')
      : item.itemTemplateRef;
  const template = getItemTemplateByRef(itemTemplateRef);
  if (!template || !itemTemplateRef) return null;

  return {
    id: item.id,
    itemTemplateRef,
    quantity: template.kind === 'consumable' ? (item.quantity === '' ? 0 : item.quantity) : undefined,
    threshold: template.kind === 'consumable' ? (item.threshold === '' ? undefined : item.threshold) : undefined,
    unit: template.kind === 'consumable' ? (item.unit.trim() || undefined) : undefined,
    recurringTasks: template.kind === 'facility' ? item.recurringTasks : undefined,
  };
}

function buildContainer(container: ContainerDraft): HomeContainer | null {
  if (!container.name.trim()) return null;
  return {
    id: container.id,
    name: container.name.trim(),
    icon: container.icon.trim(),
    items: container.items.map(buildItemInstance).filter((item): item is ItemInstance => Boolean(item)),
  };
}

function makeNewItemDraft(): ItemDraft {
  return {
    id: uuidv4(),
    itemTemplateRef: '',
    customName: '',
    customIcon: '',
    kind: 'consumable',
    quantity: 1,
    threshold: '',
    unit: '',
    recurringTasks: [],
  };
}

function buildRecurringTasks(itemTemplateRef: string): ItemRecurringTask[] {
  return (getItemTemplateByRef(itemTemplateRef)?.builtInTasks ?? []).map((task) => ({
    id: uuidv4(),
    taskTemplateRef: task.taskTemplateRef,
    recurrenceMode: 'never',
    recurrence: makeDefaultRecurrenceRule(),
    reminderLeadDays: 7,
  }));
}

export function HomeForm({ existing, onSaved, onCancel }: HomeFormProps) {
  const [iconKey, setIconKey] = useState(existing?.icon ?? 'home');
  const [displayName, setDisplayName] = useState(existing?.name ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [notes, setNotes] = useState<ResourceNote[]>(existing?.notes ?? []);
  const [rooms, setRooms] = useState<RoomDraft[]>(
    existing?.rooms?.map((room) => ({
      id: room.id,
      icon: room.icon ?? '',
      name: room.name,
      assignedTo: room.assignedTo ?? [],
      containers: room.containers.map((container) => ({
        id: container.id,
        name: container.name,
        icon: container.icon,
        items: container.items.map(itemDraftFromInstance),
      })),
    })) ?? [],
  );
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);
  const [stories, setStories] = useState<HomeStory[]>(existing?.stories ?? []);
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
  const homeId = existing?.id;
  const assignableContactIds = getAssignableContactIds(homeId, allResources);

  const inventoryContainersByRoom: Record<string, { container: InventoryContainer; inventoryName: string }[]> = {};
  if (homeId) {
    for (const entry of Object.values(allResources)) {
      if (!isInventory(entry)) continue;
      for (const container of entry.containers ?? []) {
        for (const link of container.links ?? []) {
          if (link.targetKind === 'home-room' && link.targetResourceId === homeId) {
            const roomId = link.targetRoomId ?? '';
            if (!inventoryContainersByRoom[roomId]) inventoryContainersByRoom[roomId] = [];
            inventoryContainersByRoom[roomId].push({ container, inventoryName: entry.name });
          }
        }
      }
    }
  }
  const memberContacts = allContacts.filter((contact) => assignableContactIds.includes(contact.id));
  const canSave = displayName.trim().length > 0;
  const selectableItems = itemLibrary.filter((item) => item.resourceType === 'inventory' || item.resourceType === 'home');
  const [initialSnapshot] = useState(() =>
    buildHomeFormSnapshot({
      iconKey: existing?.icon ?? 'home',
      displayName: existing?.name ?? '',
      address: existing?.address ?? '',
      notes: existing?.notes ?? [],
      stories: existing?.stories ?? [],
      rooms:
        existing?.rooms?.map((room) => ({
          id: room.id,
          icon: room.icon ?? '',
          name: room.name,
          assignedTo: room.assignedTo ?? [],
          containers: room.containers.map((container) => ({
            id: container.id,
            name: container.name,
            icon: container.icon,
            items: container.items.map(itemDraftFromInstance),
          })),
        })) ?? [],
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
      rooms,
      chores,
    }) !== initialSnapshot;

  function addRoom() {
    const nextId = uuidv4();
    setRooms((prev) => [...prev, { id: nextId, icon: '', name: '', assignedTo: [], containers: [] }]);
    setExpandedRoomId(nextId);
  }

  function updateRoom(roomId: string, field: 'name' | 'icon', value: string) {
    setRooms((prev) => prev.map((room) => (room.id === roomId ? { ...room, [field]: value } : room)));
  }

  function updateRoomAssignment(roomId: string, value: string) {
    setRooms((prev) =>
      prev.map((room) =>
        room.id !== roomId
          ? room
          : {
              ...room,
              assignedTo: value === 'all' ? [] : [value],
            },
      ),
    );
  }

  function removeRoom(roomId: string) {
    setRooms((prev) => prev.filter((room) => room.id !== roomId));
    setExpandedRoomId((prev) => (prev === roomId ? null : prev));
  }

  function updateContainer(roomId: string, containerId: string, field: 'name' | 'icon', value: string) {
    setRooms((prev) =>
      prev.map((room) =>
        room.id !== roomId
          ? room
          : {
              ...room,
              containers: room.containers.map((container) =>
                container.id === containerId ? { ...container, [field]: value } : container,
              ),
            },
      ),
    );
  }

  function removeContainer(roomId: string, containerId: string) {
    setRooms((prev) =>
      prev.map((room) =>
        room.id !== roomId ? room : { ...room, containers: room.containers.filter((container) => container.id !== containerId) },
      ),
    );
  }

  function addContainerItem(roomId: string, containerId: string) {
    setRooms((prev) =>
      prev.map((room) =>
        room.id !== roomId
          ? room
          : {
              ...room,
              containers: room.containers.map((container) =>
                container.id !== containerId ? container : { ...container, items: [...container.items, makeNewItemDraft()] },
              ),
            },
      ),
    );
  }

  function updateContainerItem(
    roomId: string,
    containerId: string,
    itemId: string,
    field: keyof ItemDraft,
    value: string | number | '' | ItemRecurringTask[],
  ) {
    setRooms((prev) =>
      prev.map((room) =>
        room.id !== roomId
          ? room
          : {
              ...room,
              containers: room.containers.map((container) =>
                container.id !== containerId
                  ? container
                  : {
                      ...container,
                      items: container.items.map((item) => {
                        if (item.id !== itemId) return item;
                        if (field === 'itemTemplateRef') {
                          const nextRef = String(value);
                          if (nextRef === '__custom__') {
                            return { ...item, itemTemplateRef: nextRef, recurringTasks: [], kind: 'consumable', quantity: 1 };
                          }
                          const template = getItemTemplateByRef(nextRef);
                          return {
                            ...item,
                            itemTemplateRef: nextRef,
                            customName: '',
                            customIcon: '',
                            kind: template?.kind ?? 'consumable',
                            recurringTasks: template?.kind === 'facility' ? buildRecurringTasks(nextRef) : [],
                            quantity: template?.kind === 'consumable' ? (item.quantity === '' ? 1 : item.quantity) : '',
                            threshold: template?.kind === 'consumable' ? item.threshold : '',
                            unit: template?.kind === 'consumable' ? item.unit : '',
                          };
                        }
                        return { ...item, [field]: value };
                      }),
                    },
              ),
            },
      ),
    );
  }

  function removeContainerItem(roomId: string, containerId: string, itemId: string) {
    setRooms((prev) =>
      prev.map((room) =>
        room.id !== roomId
          ? room
          : {
              ...room,
              containers: room.containers.map((container) =>
                container.id !== containerId ? container : { ...container, items: container.items.filter((item) => item.id !== itemId) },
              ),
            },
      ),
    );
  }

  function updateRecurringTask(
    roomId: string,
    containerId: string,
    itemId: string,
    recurringTaskId: string,
    field: keyof ItemRecurringTask,
    value: string | ResourceRecurrenceRule,
  ) {
    setRooms((prev) =>
      prev.map((room) =>
        room.id !== roomId
          ? room
          : {
              ...room,
              containers: room.containers.map((container) =>
                container.id !== containerId
                  ? container
                  : {
                      ...container,
                      items: container.items.map((item) =>
                        item.id !== itemId
                          ? item
                          : {
                              ...item,
                              recurringTasks: item.recurringTasks.map((task) =>
                                task.id === recurringTaskId ? { ...task, [field]: value } : task,
                              ),
                            },
                      ),
                    },
              ),
            },
      ),
    );
  }

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
    const homeId = existing?.id ?? uuidv4();
    const createdAt = existing?.createdAt ?? now;

    const finalRooms: HomeRoom[] = rooms
      .filter((room) => room.name.trim())
      .map((room) => ({
        id: room.id,
        icon: room.icon.trim(),
        name: room.name.trim(),
        assignedTo: room.assignedTo,
        containers: room.containers.map(buildContainer).filter((container): container is HomeContainer => Boolean(container)),
      }));

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
            })),
            placedItems: room.placedItems ?? [],
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
      rooms: finalRooms.length > 0 ? finalRooms : undefined,
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
          <HomeLayout stories={stories} onChange={setStories} editable />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Rooms</span>
            <button type="button" onClick={addRoom} className="text-xs font-medium text-blue-500 hover:text-blue-600">+ Add room</button>
          </div>
          {rooms.length === 0 && <p className="text-xs italic text-gray-400">No rooms added yet.</p>}
          {rooms.map((room) => {
            const isExpanded = expandedRoomId === room.id;
            const hasAssignableMembers = memberContacts.length > 0;
            const assignmentSummary = describeRoomAssignment(room, memberContacts);
            const roomSummary = hasAssignableMembers
              ? (assignmentSummary ? `Assigned to ${assignmentSummary}` : '')
              : '';

            return (
              <div key={room.id} className="rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-700">
                <button
                  type="button"
                  onClick={() => setExpandedRoomId((prev) => (prev === room.id ? null : room.id))}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white dark:bg-gray-800">
                    <IconDisplay iconKey={room.icon?.trim() || 'home'} size={20} className="h-5 w-5 object-contain" alt="" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                      {room.name.trim() || 'Untitled room'}
                    </div>
                    {roomSummary ? (
                      <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {roomSummary}
                      </div>
                    ) : null}
                  </div>
                  {(inventoryContainersByRoom[room.id] ?? []).length > 0 && (
                    <div className="flex items-center gap-1 shrink-0">
                      {(inventoryContainersByRoom[room.id] ?? []).slice(0, 3).map(({ container }) => (
                        <span
                          key={container.id}
                          title={container.name}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white p-1 dark:bg-gray-800"
                        >
                          <IconDisplay iconKey={container.icon || 'resource-inventory'} size={12} className="block max-h-full max-w-full object-contain" alt="" />
                        </span>
                      ))}
                      {(inventoryContainersByRoom[room.id] ?? []).length > 3 && (
                        <span className="text-[11px] font-medium text-gray-400">
                          +{(inventoryContainersByRoom[room.id] ?? []).length - 3}
                        </span>
                      )}
                    </div>
                  )}
                  <span className="text-xs font-medium text-blue-500">{isExpanded ? 'Close' : 'Edit'}</span>
                </button>

                {isExpanded ? (
                  <div className="mt-3 space-y-3 border-t border-gray-200 pt-3 dark:border-gray-600">
                    <div className="flex items-center gap-2">
                      <IconPicker value={room.icon || 'home'} onChange={(value) => updateRoom(room.id, 'icon', value)} align="left" />
                      <input type="text" value={room.name} onChange={(event) => updateRoom(room.id, 'name', event.target.value)} placeholder="Room name" className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                    </div>

                    {hasAssignableMembers ? (
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">Assign room to:</span>
                        <select
                          value={room.assignedTo[0] ?? 'all'}
                          onChange={(event) => updateRoomAssignment(room.id, event.target.value)}
                          className="ml-auto w-40 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        >
                          <option value="all">Any member</option>
                          {memberContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
                        </select>
                      </div>
                    ) : null}

                    <div className="space-y-2 rounded-lg border border-dashed border-gray-200 px-3 py-3 dark:border-gray-600">
                      {(() => {
                        const placed = inventoryContainersByRoom[room.id] ?? [];
                        const hasAny = room.containers.length > 0 || placed.length > 0;
                        return (
                          <>
                            {hasAny && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Containers</span>
                              </div>
                            )}
                            {placed.map(({ container }) => (
                              <div key={container.id} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 opacity-60 dark:bg-gray-800">
                                {container.icon ? (
                                  <IconDisplay iconKey={container.icon} size={14} className="h-3.5 w-3.5 shrink-0 object-contain" alt="" />
                                ) : null}
                                <span className="flex-1 truncate text-sm text-gray-700 dark:text-gray-300">{container.name}</span>
                                <span className="shrink-0 text-xs text-gray-400">{container.items.length} item{container.items.length === 1 ? '' : 's'}</span>
                              </div>
                            ))}
                          </>
                        );
                      })()}
                      {room.containers.map((container) => (
                          <div key={container.id} className="space-y-2 rounded-lg bg-white px-3 py-3 dark:bg-gray-800">
                            <div className="flex items-center gap-2">
                              <input type="text" value={container.icon} onChange={(event) => updateContainer(room.id, container.id, 'icon', event.target.value)} placeholder="Icon" className="w-14 rounded border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
                              <input type="text" value={container.name} onChange={(event) => updateContainer(room.id, container.id, 'name', event.target.value)} placeholder="Container name" className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
                              <button type="button" onClick={() => removeContainer(room.id, container.id)} className="text-xs text-gray-400 hover:text-red-400">Remove</button>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Items</span>
                                <button type="button" onClick={() => addContainerItem(room.id, container.id)} className="text-xs font-medium text-blue-500 hover:text-blue-600">+ Add item</button>
                              </div>
                              {container.items.map((item) => {
                                const itemRef = item.itemTemplateRef === '__custom__' ? makeCustomItemTemplateRef(item.customName || 'Custom Item', item.kind, item.customIcon || 'resource-task') : item.itemTemplateRef;
                                const template = getItemTemplateByRef(itemRef);
                                const kind = item.itemTemplateRef === '__custom__' ? item.kind : template?.kind ?? 'consumable';
                                return (
                                  <div key={item.id} className="space-y-2 rounded-md border border-gray-200 px-2 py-2 dark:border-gray-700">
                                    <div className="grid grid-cols-[1fr_auto] gap-2">
                                      <select value={item.itemTemplateRef} onChange={(event) => updateContainerItem(room.id, container.id, item.id, 'itemTemplateRef', event.target.value)} className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
                                        <option value="">Select item</option>
                                        {selectableItems.map((option) => <option key={option.id} value={option.id}>{option.name} ({option.kind})</option>)}
                                        <option value="__custom__">Custom item</option>
                                      </select>
                                      <button type="button" onClick={() => removeContainerItem(room.id, container.id, item.id)} className="text-xs text-gray-400 hover:text-red-400">Remove</button>
                                    </div>

                                    {item.itemTemplateRef === '__custom__' && (
                                      <div className="grid grid-cols-3 gap-2">
                                        <input type="text" value={item.customName} onChange={(event) => updateContainerItem(room.id, container.id, item.id, 'customName', event.target.value)} placeholder="Custom name" className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
                                        <input type="text" value={item.customIcon} onChange={(event) => updateContainerItem(room.id, container.id, item.id, 'customIcon', event.target.value)} placeholder="Icon" className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
                                        <select value={item.kind} onChange={(event) => updateContainerItem(room.id, container.id, item.id, 'kind', event.target.value)} className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
                                          <option value="consumable">Consumable</option>
                                          <option value="facility">Facility</option>
                                        </select>
                                      </div>
                                    )}

                                    {kind === 'consumable' ? (
                                      <div className="grid grid-cols-3 gap-2">
                                        <input type="number" value={item.quantity} onChange={(event) => updateContainerItem(room.id, container.id, item.id, 'quantity', event.target.value === '' ? '' : Number(event.target.value))} placeholder="Qty" className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
                                        <input type="number" value={item.threshold} onChange={(event) => updateContainerItem(room.id, container.id, item.id, 'threshold', event.target.value === '' ? '' : Number(event.target.value))} placeholder="Threshold" className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
                                        <input type="text" value={item.unit} onChange={(event) => updateContainerItem(room.id, container.id, item.id, 'unit', event.target.value)} placeholder="Unit" className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
                                      </div>
                                    ) : (
                                      <div className="space-y-2">
                                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Recurring tasks</div>
                                        {(item.recurringTasks ?? []).length === 0 ? <p className="text-xs italic text-gray-400">No recurring tasks configured.</p> : item.recurringTasks.map((task) => (
                                          <div key={task.id} className="grid grid-cols-2 gap-2">
                                            <input type="text" value={task.taskTemplateRef} onChange={(event) => updateRecurringTask(room.id, container.id, item.id, task.id, 'taskTemplateRef', event.target.value)} className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
                                            <select value={task.recurrence.frequency} onChange={(event) => updateRecurringTask(room.id, container.id, item.id, task.id, 'recurrence', { ...task.recurrence, frequency: event.target.value as ResourceRecurrenceRule['frequency'], days: [] })} className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
                                              <option value="daily">Daily</option>
                                              <option value="weekly">Weekly</option>
                                              <option value="monthly">Monthly</option>
                                              <option value="custom">Custom</option>
                                            </select>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button type="button" onClick={() => removeRoom(room.id)} className="text-xs text-gray-400 hover:text-red-400">Remove</button>
                      <button type="button" onClick={() => setExpandedRoomId(null)} className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600">
                        Save
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
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
