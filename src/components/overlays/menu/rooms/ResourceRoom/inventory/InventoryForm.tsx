import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  HomeResource,
  InventoryContainerLink,
  InventoryCustomTaskTemplate,
  InventoryItemTemplate,
  InventoryResource,
  ItemInstance,
  ItemRecurringTask,
  InventoryContainer,
  RecurrenceDayOfWeek,
  ResourceNote,
  ResourceRecurrenceRule,
  VehicleResource,
} from '../../../../../../types/resource';
import { makeDefaultRecurrenceRule, normalizeRecurrenceMode, toRecurrenceRule } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { generateScheduledTasks, generateGTDItems } from '../../../../../../engine/resourceEngine';
import { taskTemplateLibrary } from '../../../../../../coach';
import {
  CUSTOM_ITEM_TEMPLATE_PREFIX,
  getItemTaskTemplateMeta,
  getItemTemplateByRef,
  makeCustomItemTemplateRef,
  type ItemKind,
} from '../../../../../../coach/ItemLibrary';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { TextInput } from '../../../../../shared/inputs/TextInput';
import { NumberInput } from '../../../../../shared/inputs/NumberInput';
import { IconPicker } from '../../../../../shared/IconPicker';
import { NotesLogEditor } from '../../../../../shared/NotesLogEditor';
import {
  getUserInventoryItemTemplates,
  mergeInventoryItemTemplates,
  resolveInventoryItemTemplate,
} from '../../../../../../utils/inventoryItems';

interface InventoryFormProps {
  existing?: InventoryResource;
  onSaved: () => void;
  onCancel: () => void;
  initialItemKind?: ItemKind | null;
  editorMode?: 'all' | 'item' | 'container';
  editingContainerId?: string | null;
}

interface ItemTemplateDraft {
  id: string;
  name: string;
  icon: string;
  kind: ItemKind;
  customTaskTemplates?: InventoryCustomTaskTemplate[];
  templateRef?: string;
}

interface ContainerDraft {
  id: string;
  itemTemplateRef: string;
  quantity: number | '';
  threshold: number | '';
  unit: string;
  recurringTasks: ItemRecurringTask[];
}

type CarryTaskDraft = NonNullable<InventoryContainer['carryTask']>;

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

function makeItemTemplateDraft(): ItemTemplateDraft {
  return {
    id: uuidv4(),
    name: '',
    icon: 'inventory',
    kind: 'consumable',
    customTaskTemplates: [],
    templateRef: undefined,
  };
}

function makeContainerDraft(seedRef = ''): ContainerDraft {
  return {
    id: uuidv4(),
    itemTemplateRef: seedRef,
    quantity: 1,
    threshold: '',
    unit: '',
    recurringTasks: [],
  };
}

function makeCarryTaskDraft(containerName = ''): CarryTaskDraft {
  return {
    id: uuidv4(),
    name: containerName.trim() ? `Carry ${containerName.trim()}` : 'Carry container',
    recurrenceMode: 'never',
    recurrence: makeDefaultRecurrenceRule(),
    reminderLeadDays: 7,
  };
}

function humanizeTaskRef(taskRef: string): string {
  return taskRef
    .replace(/^task-res-/, '')
    .replace(/^item-tmpl-/, '')
    .replace(/-\d+$/, '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

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

function describeTaskRecurrence(rule: ResourceRecurrenceRule): string {
  const interval = Math.max(1, rule.interval || 1);
  switch (rule.frequency) {
    case 'daily':
      return interval === 1 ? 'Daily' : `Every ${interval} days`;
    case 'weekly': {
      const days = rule.days.length > 0
        ? rule.days.map((day) => DOW_LABELS.find((entry) => entry.key === day)?.label ?? day).join(', ')
        : 'Seed day';
      return interval === 1 ? `Weekly · ${days}` : `Every ${interval} weeks · ${days}`;
    }
    case 'monthly': {
      const day = rule.monthlyDay ?? getDayOfMonth(rule.seedDate);
      return interval === 1 ? `Monthly · ${formatDayOfMonth(day)}` : `Every ${interval} months · ${formatDayOfMonth(day)}`;
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

function buildTaskTemplates(itemTemplateRef: string): ItemRecurringTask[] {
  const template = getItemTemplateByRef(itemTemplateRef);
  if (!template) return [];

  const taskRefs = new Set<string>();
  for (const task of template.builtInTasks ?? []) {
    if (task.taskTemplateRef) {
      taskRefs.add(task.taskTemplateRef);
    }
  }

  return [...taskRefs].map((taskTemplateRef) => ({
    id: uuidv4(),
    taskTemplateRef,
    recurrenceMode: 'never',
    recurrence: makeDefaultRecurrenceRule(),
    reminderLeadDays: 7,
  }));
}

function buildCustomTaskTemplates(taskTemplates: InventoryCustomTaskTemplate[]): ItemRecurringTask[] {
  return taskTemplates
    .filter((taskTemplate) => taskTemplate.name.trim().length > 0)
    .map((taskTemplate) => ({
      id: uuidv4(),
      taskTemplateRef: taskTemplate.name.trim(),
      recurrenceMode: 'never' as const,
      recurrence: makeDefaultRecurrenceRule(),
      reminderLeadDays: 7,
    }));
}

function buildItemRecurringTasks(
  itemTemplateRef: string,
  availableTemplates: InventoryItemTemplate[],
): ItemRecurringTask[] {
  const customTemplate = availableTemplates.find((option) => option.id === itemTemplateRef);
  if (itemTemplateRef.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX)) {
    return buildCustomTaskTemplates(customTemplate?.customTaskTemplates ?? []);
  }

  return buildTaskTemplates(itemTemplateRef);
}

function resolveInventoryTaskDisplay(
  taskTemplateRef: string,
  itemTemplateRef: string,
  availableTemplates: InventoryItemTemplate[],
): { name: string; icon: string } {
  if (itemTemplateRef.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX)) {
    const customTemplate = availableTemplates.find((option) => option.id === itemTemplateRef);
    const customTask = customTemplate?.customTaskTemplates?.find((taskTemplate) => taskTemplate.name.trim() === taskTemplateRef);
    if (customTask) {
      return {
        name: customTask.name,
        icon: customTask.icon || 'task',
      };
    }
  }

  const coachTaskTemplate = taskTemplateLibrary.find((template) => template.id === taskTemplateRef);
  if (coachTaskTemplate) {
    return {
      name: coachTaskTemplate.name,
      icon: coachTaskTemplate.icon || 'task',
    };
  }

  const itemTaskTemplate = getItemTaskTemplateMeta(taskTemplateRef);
  if (itemTaskTemplate) {
    return {
      name: itemTaskTemplate.name,
      icon: itemTaskTemplate.icon || 'task',
    };
  }

  return {
    name: humanizeTaskRef(taskTemplateRef),
    icon: 'task',
  };
}

function itemTemplateToRef(item: ItemTemplateDraft | InventoryItemTemplate): string {
  return ('templateRef' in item && item.templateRef)
    ? item.templateRef
    : makeCustomItemTemplateRef(item.name, 'consumable', item.icon || 'inventory');
}

function toFinalItemTemplates(itemTemplates: ItemTemplateDraft[]): InventoryItemTemplate[] {
  return itemTemplates
    .filter((item) => item.name.trim().length > 0)
    .map((item) => ({
      id: itemTemplateToRef(item),
      name: item.name.trim(),
      icon: item.icon || 'inventory',
      kind: item.kind,
      customTaskTemplates: item.kind === 'facility'
        ? (item.customTaskTemplates ?? []).filter((taskTemplate) => taskTemplate.name.trim().length > 0)
        : [],
    }));
}

export function InventoryForm({
  existing,
  onSaved,
  onCancel,
  initialItemKind = null,
  editorMode = 'all',
  editingContainerId = null,
}: InventoryFormProps) {
  const setResource = useResourceStore((s) => s.setResource);
  const resources = useResourceStore((s) => s.resources);
  const setUser = useUserStore((s) => s.setUser);
  const user = useUserStore((s) => s.user);
  const inventoryResources = useMemo(
    () => Object.values(resources).filter((resource): resource is InventoryResource => resource.type === 'inventory'),
    [resources],
  );

  const baseItemTemplates = useMemo(
    () => mergeInventoryItemTemplates(getUserInventoryItemTemplates(user), existing?.itemTemplates),
    [existing?.itemTemplates, user],
  );

  const isContainerMode = editorMode === 'container';
  const editingContainer = isContainerMode && editingContainerId && existing
    ? (existing.containers ?? []).find((container) => container.id === editingContainerId) ?? null
    : null;
  const [iconKey, setIconKey] = useState(isContainerMode ? 'inventory' : (existing?.icon ?? 'inventory'));
  const [displayName, setDisplayName] = useState(
    isContainerMode
      ? (editingContainer?.name ?? '')
      : (existing?.name ?? ''),
  );
  const [containerIconKey, setContainerIconKey] = useState(editingContainer?.icon ?? 'inventory');
  const [containerNotes, setContainerNotes] = useState<ResourceNote[]>(editingContainer?.notes ?? []);
  const [containerLinks, setContainerLinks] = useState<InventoryContainerLink[]>(editingContainer?.links ?? []);
  const [carryTaskEnabled, setCarryTaskEnabled] = useState(Boolean(editingContainer?.carryTask));
  const [carryTask, setCarryTask] = useState<CarryTaskDraft>(
    editingContainer?.carryTask
      ? {
          ...editingContainer.carryTask,
          recurrenceMode: normalizeRecurrenceMode(editingContainer.carryTask.recurrenceMode),
          recurrence: toRecurrenceRule(editingContainer.carryTask.recurrence),
          reminderLeadDays: editingContainer.carryTask.reminderLeadDays ?? 7,
        }
      : makeCarryTaskDraft(editingContainer?.name ?? ''),
  );
  const [newContainerNote, setNewContainerNote] = useState('');
  const [activeContainerMetaTab, setActiveContainerMetaTab] = useState<'location' | 'notes' | 'attachments'>('location');
  const [newContainerLinkType, setNewContainerLinkType] = useState<'home-room' | 'vehicle'>('home-room');
  const [newContainerLinkTarget, setNewContainerLinkTarget] = useState('');
  const [category, setCategory] = useState(isContainerMode ? '' : (existing?.category ?? ''));
  const [linkedHomeId, setLinkedHomeId] = useState(isContainerMode ? '' : (existing?.linkedHomeId ?? ''));
  const [linkedRoomId, setLinkedRoomId] = useState(isContainerMode ? '' : (existing?.linkedRoomId ?? ''));
  const [notes, setNotes] = useState<ResourceNote[]>(isContainerMode ? [] : (existing?.notes ?? []));
  const [itemTemplates, setItemTemplates] = useState<ItemTemplateDraft[]>(
    baseItemTemplates.length > 0
      ? baseItemTemplates.map((item) => ({
          id: item.id,
          name: item.name,
          icon: item.icon,
          kind: item.kind ?? 'consumable',
          customTaskTemplates: item.customTaskTemplates ?? [],
          templateRef: item.id,
        }))
      : (initialItemKind === 'consumable' ? [makeItemTemplateDraft()] : []),
  );
  const [containers, setContainers] = useState<ContainerDraft[]>(
    editorMode === 'container'
      ? (
          editingContainer
            ? editingContainer.items.map((item) => ({
                id: item.id,
                itemTemplateRef: item.itemTemplateRef,
                quantity: item.quantity ?? '',
                threshold: item.threshold ?? '',
                unit: item.unit ?? '',
                recurringTasks: (item.recurringTasks ?? []).map((task) => ({
                  ...task,
                  recurrence: toRecurrenceRule(task.recurrence),
                  reminderLeadDays: task.reminderLeadDays ?? 7,
                })),
              }))
            : []
        )
      : (existing?.items ?? []).map((item) => ({
          id: item.id,
          itemTemplateRef: item.itemTemplateRef,
          quantity: item.quantity ?? '',
          threshold: item.threshold ?? '',
          unit: item.unit ?? '',
          recurringTasks: (item.recurringTasks ?? []).map((task) => ({
            ...task,
            recurrence: toRecurrenceRule(task.recurrence),
            reminderLeadDays: task.reminderLeadDays ?? 7,
          })),
        })),
  );
  const [expandedContainerDraftId, setExpandedContainerDraftId] = useState<string | null>(null);

  const hasValidContainerItems = containers.every((container) => container.itemTemplateRef.trim().length > 0);
  const canSave = editorMode === 'item'
    ? itemTemplates.some((item) => item.name.trim().length > 0)
    : editorMode === 'container'
      ? displayName.trim().length > 0 && hasValidContainerItems && (!carryTaskEnabled || carryTask.name.trim().length > 0)
      : displayName.trim().length > 0;
  const showItemsEditor = editorMode !== 'container';
  const showContainersEditor = editorMode !== 'item';

  const finalItemTemplates = useMemo(
    () => toFinalItemTemplates(itemTemplates),
    [itemTemplates],
  );

  const availableItemOptions = useMemo(
    () =>
      finalItemTemplates.map((item) => ({
        ref: item.id,
        name: item.name,
        icon: item.icon || 'inventory',
      })),
    [finalItemTemplates],
  );
  const homeResources = useMemo(
    () => Object.values(resources).filter((resource): resource is HomeResource => resource.type === 'home'),
    [resources],
  );
  const vehicleResources = useMemo(
    () => Object.values(resources).filter((resource): resource is VehicleResource => resource.type === 'vehicle'),
    [resources],
  );
  const homeRoomOptions = useMemo(
    () => homeResources.flatMap((home) => (home.rooms ?? []).map((room) => ({
      value: `${home.id}::${room.id}`,
      label: `${home.name} - ${room.name}`,
      resourceId: home.id,
      roomId: room.id,
    }))),
    [homeResources],
  );

  function addItemTemplate() {
    setItemTemplates((prev) => [...prev, makeItemTemplateDraft()]);
  }

  function updateItemTemplate(id: string, field: keyof ItemTemplateDraft, value: string) {
    setItemTemplates((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, [field]: value, templateRef: field === 'name' || field === 'icon' ? undefined : item.templateRef }
          : item,
      ),
    );
  }

  function removeItemTemplate(id: string) {
    const template = itemTemplates.find((item) => item.id === id);
    const templateRef = template ? itemTemplateToRef(template) : null;
    setItemTemplates((prev) => prev.filter((item) => item.id !== id));
    if (templateRef) {
      setContainers((prev) => prev.filter((container) => container.itemTemplateRef !== templateRef));
    }
  }

  function addContainer() {
    const next = makeContainerDraft();
    setContainers((prev) => [...prev, next]);
    setExpandedContainerDraftId(next.id);
  }

  function updateContainer(id: string, field: keyof ContainerDraft, value: string | number | '') {
    setContainers((prev) => prev.map((container) => (container.id === id ? { ...container, [field]: value } : container)));
  }

  function updateRecurringTask(
    containerId: string,
    recurringTaskId: string,
    field: keyof ItemRecurringTask,
    value: string | number | ResourceRecurrenceRule,
  ) {
    setContainers((prev) =>
      prev.map((container) =>
        container.id !== containerId
          ? container
          : {
              ...container,
              recurringTasks: container.recurringTasks.map((task) =>
                task.id === recurringTaskId ? { ...task, [field]: value } : task,
              ),
            },
      ),
    );
  }

  function updateRecurringTaskRecurrence(
    containerId: string,
    recurringTaskId: string,
    patch: Partial<ResourceRecurrenceRule>,
  ) {
    setContainers((prev) =>
      prev.map((container) =>
        container.id !== containerId
          ? container
          : {
              ...container,
              recurringTasks: container.recurringTasks.map((task) =>
                task.id === recurringTaskId
                  ? { ...task, recurrence: { ...task.recurrence, ...patch } }
                  : task,
              ),
            },
      ),
    );
  }

  function toggleRecurringTaskDay(containerId: string, recurringTaskId: string, day: RecurrenceDayOfWeek) {
    setContainers((prev) =>
      prev.map((container) =>
        container.id !== containerId
          ? container
          : {
              ...container,
              recurringTasks: container.recurringTasks.map((task) => {
                if (task.id !== recurringTaskId) return task;
                const days = task.recurrence.days.includes(day)
                  ? task.recurrence.days.filter((entry) => entry !== day)
                  : [...task.recurrence.days, day];
                return { ...task, recurrence: { ...task.recurrence, days } };
              }),
            },
      ),
    );
  }

  function removeContainer(id: string) {
    setContainers((prev) => prev.filter((container) => container.id !== id));
    setExpandedContainerDraftId((prev) => (prev === id ? null : prev));
  }

  function closeContainerDraft(id: string) {
    const target = containers.find((container) => container.id === id);
    if (!target) {
      setExpandedContainerDraftId(null);
      return;
    }

    if (!target.itemTemplateRef.trim()) {
      removeContainer(id);
      return;
    }

    setExpandedContainerDraftId(null);
  }

  function addContainerNote() {
    const text = newContainerNote.trim();
    if (!text) return;
    setContainerNotes((prev) => [
      ...prev,
      {
        id: uuidv4(),
        text,
        createdAt: new Date().toISOString(),
      },
    ]);
    setNewContainerNote('');
  }

  function removeContainerNote(id: string) {
    setContainerNotes((prev) => prev.filter((note) => note.id !== id));
  }

  function addContainerLink() {
    if (!newContainerLinkTarget) return;
    const now = new Date().toISOString();
    if (newContainerLinkType === 'home-room') {
      const [targetResourceId, targetRoomId] = newContainerLinkTarget.split('::');
      if (!targetResourceId || !targetRoomId) return;
      setContainerLinks([
        {
          id: uuidv4(),
          targetKind: 'home-room',
          targetResourceId,
          targetRoomId,
          relationship: 'location',
          createdAt: now,
        },
      ]);
    } else if (newContainerLinkType === 'vehicle') {
      setContainerLinks([
        {
          id: uuidv4(),
          targetKind: 'vehicle',
          targetResourceId: newContainerLinkTarget,
          relationship: 'location',
          createdAt: now,
        },
      ]);
    }
    setNewContainerLinkTarget('');
  }

  function removeContainerLink(id: string) {
    setContainerLinks((prev) => prev.filter((link) => link.id !== id));
  }

  function updateCarryTaskField(field: keyof CarryTaskDraft, value: string | number | ResourceRecurrenceRule) {
    setCarryTask((prev) => ({ ...prev, [field]: value }));
  }

  function updateCarryTaskRecurrence(patch: Partial<ResourceRecurrenceRule>) {
    setCarryTask((prev) => ({
      ...prev,
      recurrence: {
        ...prev.recurrence,
        ...patch,
      },
    }));
  }

  function toggleCarryTaskDay(day: RecurrenceDayOfWeek) {
    setCarryTask((prev) => {
      const days = prev.recurrence.days.includes(day)
        ? prev.recurrence.days.filter((entry) => entry !== day)
        : [...prev.recurrence.days, day];
      return {
        ...prev,
        recurrence: {
          ...prev.recurrence,
          days,
        },
      };
    });
  }

  function describeContainerLink(link: InventoryContainerLink): string {
    if (link.targetKind === 'home-room') {
      const home = resources[link.targetResourceId];
      const room = home?.type === 'home' ? (home.rooms ?? []).find((entry) => entry.id === link.targetRoomId) : null;
      return room ? `${home.name} - ${room.name}` : 'Linked room';
    }
    if (link.targetKind === 'vehicle') {
      const vehicle = resources[link.targetResourceId];
      return vehicle?.type === 'vehicle' ? vehicle.name : 'Linked vehicle';
    }
    return 'Linked location';
  }

  function containerLinkTargetIcon(link: InventoryContainerLink): string {
    return link.targetKind === 'vehicle' ? 'vehicle' : 'home';
  }

  function handleSave() {
    if (!canSave || !user) return;
    const now = new Date().toISOString();

    const validRefs = new Set(finalItemTemplates.map((item) => item.id));
    const finalContainers: ItemInstance[] = containers
      .filter((container) => validRefs.has(container.itemTemplateRef))
      .map((container) => ({
        id: container.id,
        itemTemplateRef: container.itemTemplateRef,
        quantity: container.quantity === '' ? 0 : container.quantity,
        threshold: container.threshold === '' ? undefined : container.threshold,
        unit: container.unit.trim() || undefined,
        recurringTasks: container.recurringTasks.length > 0 ? container.recurringTasks : undefined,
      }));

    const nextUser = {
      ...user,
      lists: {
        ...user.lists,
        inventoryItemTemplates: finalItemTemplates,
      },
    };

    if (editorMode === 'item' && !existing) {
      setUser(nextUser);
      onSaved();
      return;
    }

    const baseInventory =
      existing ??
      [...inventoryResources].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ??
      null;
    const nextName = isContainerMode
      ? (baseInventory?.name ?? '')
      : displayName;

    const nextContainerEntries = isContainerMode
      ? [
          ...(existing?.containers ?? []).filter((container) => container.id !== editingContainerId),
          {
            id: editingContainerId ?? uuidv4(),
            name: displayName.trim(),
            icon: containerIconKey || 'inventory',
            items: finalContainers,
            carryTask: carryTaskEnabled
              ? {
                  ...carryTask,
                  name: carryTask.name.trim() || `Carry ${displayName.trim()}`,
                  recurrenceMode: normalizeRecurrenceMode(carryTask.recurrenceMode),
                  reminderLeadDays:
                    normalizeRecurrenceMode(carryTask.recurrenceMode) === 'recurring'
                      ? (carryTask.reminderLeadDays ?? 7)
                      : -1,
                }
              : undefined,
            notes: containerNotes,
            attachments: editingContainer?.attachments ?? [],
            links: containerLinks,
          },
        ]
      : (existing?.containers ?? []);

    const resource: InventoryResource = {
      id: baseInventory?.id ?? uuidv4(),
      name: nextName.trim() || 'Inventory',
      icon: isContainerMode ? (baseInventory?.icon ?? 'inventory') : iconKey,
      description: baseInventory?.description ?? existing?.description ?? '',
      type: 'inventory',
      attachments: baseInventory?.attachments ?? existing?.attachments ?? [],
      log: baseInventory?.log ?? existing?.log ?? [],
      createdAt: baseInventory?.createdAt ?? existing?.createdAt ?? now,
      updatedAt: now,
      category: isContainerMode ? baseInventory?.category : (category.trim() || undefined),
      itemTemplates: undefined,
      containers: isContainerMode ? nextContainerEntries : (existing?.containers ?? []),
      items: isContainerMode
        ? nextContainerEntries.flatMap((container) => container.items)
        : finalContainers,
      linkedHomeId: isContainerMode ? baseInventory?.linkedHomeId : (linkedHomeId.trim() || undefined),
      linkedRoomId: isContainerMode ? baseInventory?.linkedRoomId : (linkedRoomId.trim() || undefined),
      notes: isContainerMode ? (baseInventory?.notes ?? []) : notes,
      links: baseInventory?.links ?? existing?.links,
      sharedWith: baseInventory?.sharedWith ?? existing?.sharedWith ?? null,
    };

    setResource(resource);
    setUser({
      ...nextUser,
      resources: {
        ...nextUser.resources,
        inventory: nextUser.resources.inventory.includes(resource.id)
          ? nextUser.resources.inventory
          : [...nextUser.resources.inventory, resource.id],
      },
    });

    generateScheduledTasks(resource);
    generateGTDItems(resource);
    onSaved();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
        <button type="button" onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          Back
        </button>
        <h3 className="flex-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
          {editorMode === 'container'
            ? (editingContainerId ? 'Edit Container' : 'New Inventory Container')
            : existing
              ? 'Edit Inventory'
              : initialItemKind === 'consumable'
                ? 'New Inventory Item'
                : 'New Inventory'}
        </h3>
        <button type="button" onClick={handleSave} disabled={!canSave} className={canSave ? 'text-sm font-semibold text-blue-500 hover:text-blue-600' : 'text-sm font-semibold text-gray-300'}>
          Save
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {editorMode !== 'item' ? (
          <>
            <div className="grid grid-cols-[auto_1fr] items-end gap-3">
              <IconPicker value={editorMode === 'container' ? containerIconKey : iconKey} onChange={editorMode === 'container' ? setContainerIconKey : setIconKey} />
              <TextInput
                label={editorMode === 'container' ? 'Container name *' : 'Name *'}
                value={displayName}
                onChange={setDisplayName}
                placeholder={editorMode === 'container' ? 'e.g. Pantry' : 'e.g. Inventory'}
                maxLength={100}
              />
            </div>

            {editorMode === 'container' ? (
              <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60">
                <div className="space-y-3 rounded-lg border border-gray-200 bg-white px-3 py-3 dark:border-gray-600 dark:bg-gray-800">
                  <label className="flex items-center justify-between gap-3 text-sm font-medium text-gray-700 dark:text-gray-200">
                    <span>Carry task</span>
                    <input
                      type="checkbox"
                      checked={carryTaskEnabled}
                      onChange={(event) => {
                        const enabled = event.target.checked;
                        setCarryTaskEnabled(enabled);
                        if (enabled) {
                          setCarryTask((prev) => ({
                            ...prev,
                            name: prev.name.trim() || `Carry ${displayName.trim() || 'container'}`,
                          }));
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                    />
                  </label>

                  {carryTaskEnabled ? (
                    <div className="space-y-3">
                      <TextInput
                        label="Task name"
                        value={carryTask.name}
                        onChange={(value) => updateCarryTaskField('name', value)}
                        placeholder={`Carry ${displayName.trim() || 'container'}`}
                        maxLength={80}
                      />

                      <div className="flex rounded-full bg-gray-100 p-1 dark:bg-gray-900/60">
                        {(['recurring', 'never'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => updateCarryTaskField('recurrenceMode', mode)}
                            className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                              normalizeRecurrenceMode(carryTask.recurrenceMode) === mode
                                ? 'bg-blue-500 text-white'
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                            }`}
                          >
                            {mode === 'recurring' ? 'Recurring' : 'Intermittent'}
                          </button>
                        ))}
                      </div>

                      {normalizeRecurrenceMode(carryTask.recurrenceMode) === 'recurring' ? (
                        <div className="space-y-2 rounded-md border border-gray-200 bg-white px-3 py-3 dark:border-gray-600 dark:bg-gray-800/70">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">Frequency</span>
                            <select
                              value={carryTask.recurrence.frequency}
                              onChange={(event) =>
                                updateCarryTaskRecurrence({
                                  frequency: event.target.value as ResourceRecurrenceRule['frequency'],
                                  days: event.target.value === 'weekly' ? carryTask.recurrence.days : [],
                                  monthlyDay:
                                    event.target.value === 'monthly'
                                      ? (carryTask.recurrence.monthlyDay ?? getDayOfMonth(carryTask.recurrence.seedDate))
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
                          </div>

                          {carryTask.recurrence.frequency === 'monthly' ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Every</label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={99}
                                    value={carryTask.recurrence.interval}
                                    onChange={(event) => updateCarryTaskRecurrence({ interval: Math.max(1, Number(event.target.value) || 1) })}
                                    className={SMALL_INPUT_CLS}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Day of month</label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={31}
                                    value={carryTask.recurrence.monthlyDay ?? getDayOfMonth(carryTask.recurrence.seedDate)}
                                    onChange={(event) =>
                                      updateCarryTaskRecurrence({
                                        monthlyDay: Math.min(31, Math.max(1, Number(event.target.value) || 1)),
                                      })
                                    }
                                    className={SMALL_INPUT_CLS}
                                  />
                                </div>
                              </div>
                              <p className="text-[11px] text-gray-400 dark:text-gray-500">Days 29-31 use the last day of shorter months automatically.</p>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Interval</label>
                              <input
                                type="number"
                                min={1}
                                max={99}
                                value={carryTask.recurrence.interval}
                                onChange={(event) => updateCarryTaskRecurrence({ interval: Math.max(1, Number(event.target.value) || 1) })}
                                className={SMALL_INPUT_CLS}
                              />
                            </div>
                          )}

                          {carryTask.recurrence.frequency === 'weekly' ? (
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Days</label>
                              <div className="flex gap-1">
                                {DOW_LABELS.map(({ key, label }) => (
                                  <button
                                    key={key}
                                    type="button"
                                    onClick={() => toggleCarryTaskDay(key)}
                                    className={`h-7 w-7 rounded text-xs font-medium transition-colors ${
                                      carryTask.recurrence.days.includes(key)
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
                              value={carryTask.recurrence.seedDate}
                              onChange={(event) =>
                                updateCarryTaskRecurrence({
                                  seedDate: event.target.value,
                                  monthlyDay:
                                    carryTask.recurrence.frequency === 'monthly'
                                      ? (carryTask.recurrence.monthlyDay ?? getDayOfMonth(event.target.value))
                                      : carryTask.recurrence.monthlyDay,
                                })
                              }
                              className={SMALL_INPUT_CLS}
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Ends on</label>
                            <input
                              type="date"
                              value={carryTask.recurrence.endsOn ?? ''}
                              onChange={(event) => updateCarryTaskRecurrence({ endsOn: event.target.value || null })}
                              className={SMALL_INPUT_CLS}
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">Reminder:</span>
                            <select
                              value={carryTask.reminderLeadDays ?? 7}
                              onChange={(event) => updateCarryTaskField('reminderLeadDays', Number(event.target.value))}
                              className="ml-auto w-40 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                            >
                              <option value={-1}>No reminder</option>
                              <option value={0}>Day of</option>
                              <option value={1}>1 day before</option>
                              <option value={3}>3 days before</option>
                              <option value={7}>7 days before</option>
                              <option value={14}>14 days before</option>
                              <option value={30}>30 days before</option>
                            </select>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs italic text-gray-400">No carry task for this container.</p>
                  )}
                </div>

                <div className="flex gap-4 border-b border-gray-100 pb-1 dark:border-gray-700">
                  {(['location', 'notes', 'attachments'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveContainerMetaTab(tab)}
                      className={`border-b-2 pb-0.5 text-xs font-medium transition-colors ${
                        activeContainerMetaTab === tab
                          ? 'border-blue-500 text-blue-500'
                          : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                      }`}
                    >
                      {tab === 'notes' ? 'Notes' : tab === 'attachments' ? 'Attachments' : 'Location'}
                    </button>
                  ))}
                </div>

                {activeContainerMetaTab === 'location' ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-[140px_1fr_auto] gap-2">
                      <select
                        value={newContainerLinkType}
                        onChange={(event) => {
                          setNewContainerLinkType(event.target.value as 'home-room' | 'vehicle');
                          setNewContainerLinkTarget('');
                        }}
                        className={SMALL_INPUT_CLS}
                      >
                        <option value="home-room">Home room</option>
                        <option value="vehicle">Vehicle</option>
                      </select>

                      <select
                        value={newContainerLinkTarget}
                        onChange={(event) => setNewContainerLinkTarget(event.target.value)}
                        className={SMALL_INPUT_CLS}
                      >
                        <option value="">
                          {newContainerLinkType === 'home-room'
                            ? 'Select room'
                            : 'Select vehicle'}
                        </option>
                        {newContainerLinkType === 'home-room'
                          ? homeRoomOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))
                          : null}
                        {newContainerLinkType === 'vehicle'
                          ? vehicleResources.map((vehicle) => (
                            <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>
                          ))
                          : null}
                      </select>

                      <button
                        type="button"
                        onClick={addContainerLink}
                        disabled={!newContainerLinkTarget}
                        className={newContainerLinkTarget
                          ? 'rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600'
                          : 'rounded-md bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-400 dark:bg-gray-700'}
                      >
                        {containerLinks.length > 0 ? 'Move' : 'Add'}
                      </button>
                    </div>

                    {containerLinks.length === 0 ? (
                      <p className="text-xs italic text-gray-400">No location set.</p>
                    ) : (
                      <div className="space-y-2">
                        {containerLinks.map((link) => (
                          <div key={link.id} className="flex items-center gap-2 rounded-md bg-white px-2.5 py-2 dark:bg-gray-900/40">
                            <IconDisplay iconKey="location_point" size={16} className="h-4 w-4 shrink-0 object-contain" />
                            <IconDisplay iconKey={containerLinkTargetIcon(link)} size={16} className="h-4 w-4 shrink-0 object-contain" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm text-gray-800 dark:text-gray-100">
                                {describeContainerLink(link)}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeContainerLink(link.id)}
                              className="text-xs text-gray-400 hover:text-red-400"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {activeContainerMetaTab === 'attachments' ? (
                  <div className="rounded-lg bg-white px-3 py-4 text-center dark:bg-gray-900/40">
                    <p className="text-xs italic text-gray-400">Attachments coming soon.</p>
                  </div>
                ) : null}

                {activeContainerMetaTab === 'notes' ? (
                  <div className="flex flex-col gap-2">
                    {containerNotes.length === 0 ? (
                      <p className="text-xs italic text-gray-400">No notes yet.</p>
                    ) : (
                      [...containerNotes].reverse().map((note) => (
                        <div
                          key={note.id}
                          className="flex items-start gap-2 rounded-md bg-white px-2.5 py-2 dark:bg-gray-900/40"
                        >
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {new Date(note.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                              {new Date(note.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="whitespace-pre-line break-words text-sm text-gray-800 dark:text-gray-100">
                              {note.text}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeContainerNote(note.id)}
                            className="mt-0.5 shrink-0 text-xs font-bold leading-none text-gray-400 hover:text-red-400"
                          >
                            x
                          </button>
                        </div>
                      ))
                    )}

                    <div className="flex items-start gap-2">
                      <input
                        type="text"
                        value={newContainerNote}
                        onChange={(event) => setNewContainerNote(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addContainerNote();
                          }
                        }}
                        placeholder="Add a note..."
                        maxLength={500}
                        className="flex-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                      />
                      <button
                        type="button"
                        onClick={addContainerNote}
                        disabled={!newContainerNote.trim()}
                        className="shrink-0 rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {editorMode === 'all' ? (
              <div className="grid grid-cols-3 gap-3">
                <TextInput label="Category" value={category} onChange={setCategory} placeholder="e.g. Kitchen" maxLength={60} />
                <TextInput label="Linked home" value={linkedHomeId} onChange={setLinkedHomeId} placeholder="Home resource id" maxLength={120} />
                <TextInput label="Linked room" value={linkedRoomId} onChange={setLinkedRoomId} placeholder="Room id" maxLength={120} />
              </div>
            ) : null}
          </>
        ) : null}

        {showItemsEditor ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Available Items</span>
              <button type="button" onClick={addItemTemplate} className="text-xs font-medium text-blue-500 hover:text-blue-600">
                + Add item
              </button>
            </div>
            {itemTemplates.length === 0 ? <p className="text-xs italic text-gray-400">No items added yet.</p> : null}
            {itemTemplates.map((item) => (
              <div key={item.id} className="grid grid-cols-[auto_1fr_auto] items-end gap-2 rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-700">
                <IconPicker value={item.icon || 'inventory'} onChange={(value) => updateItemTemplate(item.id, 'icon', value)} align="left" />
                <TextInput
                  label="Item name"
                  value={item.name}
                  onChange={(value) => updateItemTemplate(item.id, 'name', value)}
                  placeholder="e.g. Coffee Beans"
                  maxLength={80}
                />
                <button type="button" onClick={() => removeItemTemplate(item.id)} className="mb-1 text-xs text-gray-400 hover:text-red-400">
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {showContainersEditor ? (
          <div className="flex flex-col gap-2">
            {editorMode !== 'container' ? (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Available Containers</span>
                <button type="button" onClick={addContainer} className="text-xs font-medium text-blue-500 hover:text-blue-600">
                  + Add container
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Items In Container</span>
                <button type="button" onClick={addContainer} className="text-xs font-medium text-blue-500 hover:text-blue-600">
                  + Add item
                </button>
              </div>
            )}
            {containers.map((container) => {
              const selectedTemplate = resolveInventoryItemTemplate(container.itemTemplateRef, finalItemTemplates);
              const templateKind = getItemTemplateByRef(container.itemTemplateRef)?.kind ?? selectedTemplate?.kind ?? 'consumable';
              const isExpanded = expandedContainerDraftId === container.id;
              const hasSelectedItem = container.itemTemplateRef.trim().length > 0;
              const summaryName = selectedTemplate?.name ?? 'Select item';
              const summaryLines: Array<{ text: string; icon?: string }> = templateKind === 'consumable'
                ? [{
                    text: [
                      container.quantity !== '' ? `Qty ${container.quantity}` : null,
                      container.threshold !== '' ? `Min ${container.threshold}` : null,
                      container.unit.trim() ? container.unit.trim() : null,
                    ].filter(Boolean).join(' · ') || 'Consumable item',
                  }]
                : (container.recurringTasks ?? []).length > 0
                  ? container.recurringTasks.map((task) => {
                    const taskDisplay = resolveInventoryTaskDisplay(task.taskTemplateRef, container.itemTemplateRef, finalItemTemplates);
                    return {
                      text: `${taskDisplay.name}: ${
                        (task.recurrenceMode ?? 'never') === 'recurring'
                          ? `${describeTaskRecurrence(task.recurrence)} · ${describeReminder(task.reminderLeadDays ?? 7)}`
                          : 'Intermittent'
                      }`,
                      icon: taskDisplay.icon,
                    };
                  })
                  : [{ text: 'Facility item' }];
              return (
                <div key={container.id} className="space-y-2 rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-700">
                  <button
                    type="button"
                    onClick={() => {
                      if (isExpanded) {
                        closeContainerDraft(container.id);
                        return;
                      }
                      setExpandedContainerDraftId(container.id);
                    }}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white dark:bg-gray-800">
                      <IconDisplay iconKey={selectedTemplate?.icon || 'inventory'} size={20} className="h-5 w-5 object-contain" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                        {summaryName}
                      </div>
                      <div className="mt-1 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                        {summaryLines.map((line, index) => (
                          <div key={`${container.id}-summary-${index}`} className="flex items-start gap-1.5 leading-relaxed">
                            {line.icon ? <IconDisplay iconKey={line.icon} size={12} className="mt-0.5 h-3 w-3 shrink-0 object-contain" /> : null}
                            <span>{line.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <span className="text-xs font-medium text-blue-500">{isExpanded ? 'Close' : 'Edit'}</span>
                  </button>

                  {isExpanded ? (
                    <div className="mt-3 space-y-3 border-t border-gray-200 pt-3 dark:border-gray-600">
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <select
                          value={container.itemTemplateRef}
                          onChange={(event) => {
                            const nextRef = event.target.value;
                            const template = getItemTemplateByRef(nextRef);
                            const customTemplate = finalItemTemplates.find((option) => option.id === nextRef);
                            const nextKind = template?.kind ?? customTemplate?.kind ?? 'consumable';
                            setContainers((prev) => prev.map((entry) => (
                              entry.id === container.id
                                ? {
                                    ...entry,
                                    itemTemplateRef: nextRef,
                                    recurringTasks: nextKind === 'facility'
                                      ? buildItemRecurringTasks(nextRef, finalItemTemplates)
                                      : [],
                                    threshold: nextKind === 'consumable' ? entry.threshold : '',
                                    quantity: nextKind === 'consumable' ? (entry.quantity === '' ? 1 : entry.quantity) : '',
                                  }
                                : entry
                            )));
                          }}
                          className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        >
                          <option value="">Select item</option>
                          {availableItemOptions.map((option) => (
                            <option key={option.ref} value={option.ref}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {!hasSelectedItem ? null : templateKind === 'consumable' ? (
                        <>
                          <div className="grid grid-cols-3 gap-2">
                            <NumberInput
                              label="Qty"
                              value={container.quantity}
                              onChange={(value) => updateContainer(container.id, 'quantity', value)}
                              placeholder="1"
                              min={0}
                            />
                            <NumberInput
                              label="Min on hand"
                              value={container.threshold}
                              onChange={(value) => updateContainer(container.id, 'threshold', value)}
                              placeholder="0"
                              min={0}
                            />
                            <TextInput
                              label="Unit"
                              value={container.unit}
                              onChange={(value) => updateContainer(container.id, 'unit', value)}
                              placeholder="bag"
                              maxLength={20}
                            />
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Replenishment tasks will trigger when quantity reaches the minimum on hand.
                          </p>
                        </>
                      ) : templateKind === 'facility' ? (
                        <div className="rounded-lg border border-gray-200 bg-white px-3 py-3 text-xs text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
                          <p className="font-medium text-gray-700 dark:text-gray-200">Task Templates</p>
                          {(container.recurringTasks ?? []).length === 0 ? (
                            <p className="mt-1 italic text-gray-400">No built-in task templates.</p>
                          ) : (
                            <div className="mt-2 space-y-3">
                              {container.recurringTasks.map((task) => (
                                <div key={task.id} className="rounded-lg border border-gray-200 px-3 py-3 dark:border-gray-700">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <IconDisplay
                                          iconKey={resolveInventoryTaskDisplay(task.taskTemplateRef, container.itemTemplateRef, finalItemTemplates).icon}
                                          size={16}
                                          className="h-4 w-4 shrink-0 object-contain"
                                        />
                                        <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                                          {resolveInventoryTaskDisplay(task.taskTemplateRef, container.itemTemplateRef, finalItemTemplates).name}
                                        </div>
                                      </div>
                                      <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                        {(task.recurrenceMode ?? 'never') === 'recurring'
                                          ? `${describeTaskRecurrence(task.recurrence)} · ${describeReminder(task.reminderLeadDays ?? 7)}`
                                          : 'Intermittent'}
                                      </div>
                                    </div>
                                    <div className="flex rounded-full bg-gray-100 p-1 dark:bg-gray-900/60">
                                      {(['recurring', 'never'] as const).map((mode) => (
                                        <button
                                          key={mode}
                                          type="button"
                                          onClick={() => updateRecurringTask(container.id, task.id, 'recurrenceMode', mode)}
                                          className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                                            (task.recurrenceMode ?? 'never') === mode
                                              ? 'bg-blue-500 text-white'
                                              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                                          }`}
                                        >
                                          {mode === 'recurring' ? 'Recurring' : 'Intermittent'}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {(task.recurrenceMode ?? 'never') === 'recurring' ? (
                                    <div className="mt-3 space-y-2 rounded-md border border-gray-200 bg-white px-3 py-3 dark:border-gray-600 dark:bg-gray-800/70">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                                          Frequency
                                        </span>
                                        <select
                                          value={task.recurrence.frequency}
                                          onChange={(event) =>
                                            updateRecurringTaskRecurrence(container.id, task.id, {
                                              frequency: event.target.value as ResourceRecurrenceRule['frequency'],
                                              days: event.target.value === 'weekly' ? task.recurrence.days : [],
                                              monthlyDay:
                                                event.target.value === 'monthly'
                                                  ? (task.recurrence.monthlyDay ?? getDayOfMonth(task.recurrence.seedDate))
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
                                      </div>

                                      {task.recurrence.frequency === 'monthly' ? (
                                        <div className="space-y-2">
                                          <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Every</label>
                                              <input
                                                type="number"
                                                min={1}
                                                max={99}
                                                value={task.recurrence.interval}
                                                onChange={(event) => updateRecurringTaskRecurrence(container.id, task.id, { interval: Math.max(1, Number(event.target.value) || 1) })}
                                                className={SMALL_INPUT_CLS}
                                              />
                                            </div>
                                            <div className="space-y-1">
                                              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Day of month</label>
                                              <input
                                                type="number"
                                                min={1}
                                                max={31}
                                                value={task.recurrence.monthlyDay ?? getDayOfMonth(task.recurrence.seedDate)}
                                                onChange={(event) =>
                                                  updateRecurringTaskRecurrence(container.id, task.id, {
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
                                        <>
                                          <div className="space-y-1">
                                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Interval</label>
                                            <input
                                              type="number"
                                              min={1}
                                              max={99}
                                              value={task.recurrence.interval}
                                              onChange={(event) => updateRecurringTaskRecurrence(container.id, task.id, { interval: Math.max(1, Number(event.target.value) || 1) })}
                                              className={SMALL_INPUT_CLS}
                                            />
                                          </div>
                                        </>
                                      )}

                                      {task.recurrence.frequency === 'weekly' ? (
                                        <div className="space-y-1">
                                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Days</label>
                                          <div className="flex gap-1">
                                            {DOW_LABELS.map(({ key, label }) => (
                                              <button
                                                key={key}
                                                type="button"
                                                onClick={() => toggleRecurringTaskDay(container.id, task.id, key)}
                                                className={`h-7 w-7 rounded text-xs font-medium transition-colors ${
                                                  task.recurrence.days.includes(key)
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
                                          value={task.recurrence.seedDate}
                                          onChange={(event) =>
                                            updateRecurringTaskRecurrence(container.id, task.id, {
                                              seedDate: event.target.value,
                                              monthlyDay:
                                                task.recurrence.frequency === 'monthly'
                                                  ? (task.recurrence.monthlyDay ?? getDayOfMonth(event.target.value))
                                                  : task.recurrence.monthlyDay,
                                            })
                                          }
                                          className={SMALL_INPUT_CLS}
                                        />
                                      </div>

                                      <div className="space-y-1">
                                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Ends on</label>
                                        <input
                                          type="date"
                                          value={task.recurrence.endsOn ?? ''}
                                          onChange={(event) => updateRecurringTaskRecurrence(container.id, task.id, { endsOn: event.target.value || null })}
                                          className={SMALL_INPUT_CLS}
                                        />
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">Reminder:</span>
                                        <select
                                          value={task.reminderLeadDays ?? 7}
                                          onChange={(event) => updateRecurringTask(container.id, task.id, 'reminderLeadDays', Number(event.target.value))}
                                          className="ml-auto w-40 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                                        >
                                          <option value={-1}>No reminder</option>
                                          <option value={0}>Day of</option>
                                          <option value={1}>1 day before</option>
                                          <option value={3}>3 days before</option>
                                          <option value={7}>7 days before</option>
                                          <option value={14}>14 days before</option>
                                          <option value={30}>30 days before</option>
                                        </select>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="mt-2 text-gray-500 dark:text-gray-400">
                            Built-in items bring their task templates with them. Turn on recurrence only where you want it scheduled.
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-end pb-2 text-xs text-gray-500 dark:text-gray-400">
                          {selectedTemplate?.name ?? 'Item'}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        <button type="button" onClick={() => removeContainer(container.id)} className="text-xs text-gray-400 hover:text-red-400">
                          Remove
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!hasSelectedItem) return;
                            closeContainerDraft(container.id);
                          }}
                          disabled={!hasSelectedItem}
                          className={hasSelectedItem
                            ? 'rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600'
                            : 'rounded-md bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-400 dark:bg-gray-700'}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {editorMode === 'all' ? <NotesLogEditor notes={notes} onChange={setNotes} resource={existing} /> : null}
      </div>
    </div>
  );
}

