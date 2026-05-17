import { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { taskTemplateLibrary } from '../../../../../coach';
import { starterTaskTemplates } from '../../../../../coach/StarterQuestLibrary';
import { CUSTOM_ITEM_TEMPLATE_PREFIX, getItemTaskTemplateMeta } from '../../../../../coach/ItemLibrary';
import { useResourceStore } from '../../../../../stores/useResourceStore';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../../stores/useUserStore';
import type { InlineTaskEntry, ResourceTaskEntry, TaskEntry, TaskType, TemplateTaskEntry } from '../../../../../types';
import type { InventoryItemTemplate, ItemRecurringTask } from '../../../../../types/resource';
import type { InputFields, TaskTemplate } from '../../../../../types/taskTemplate';
import type { StatGroupKey } from '../../../../../types/user';
import { normalizeRecurrenceMode } from '../../../../../types/resource';
import { getUserInventoryItemTemplates, mergeInventoryItemTemplates, resolveInventoryItemTemplate } from '../../../../../utils/inventoryItems';
import { getCustomTemplatePool, getLibraryTemplatePool, resolveTaskTemplate } from '../../../../../utils/resolveTaskTemplate';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { IconPicker } from '../../../../shared/IconPicker';
import { TaskTypeConfigEditor } from '../../../../shared/TaskTypeConfigEditor';
import { PopupShell } from '../../../../shared/popups/PopupShell';

type AddPanelTab = 'library' | 'templates' | 'new' | 'resource';
type DraftTaskType = Extract<TaskType, 'CHECK' | 'COUNTER' | 'DURATION' | 'TIMER' | 'RATING' | 'TEXT'>;

const ADD_PANEL_TABS: Array<{ id: AddPanelTab; label: string }> = [
  { id: 'library', label: 'Library' },
  { id: 'templates', label: 'My Templates' },
  { id: 'new', label: 'New Task' },
  { id: 'resource', label: 'Resource Tasks' },
];

const DRAFT_TASK_TYPES: Array<{ value: DraftTaskType; label: string }> = [
  { value: 'CHECK', label: 'Check' },
  { value: 'COUNTER', label: 'Counter' },
  { value: 'DURATION', label: 'Duration' },
  { value: 'TIMER', label: 'Timer' },
  { value: 'RATING', label: 'Rating' },
  { value: 'TEXT', label: 'Text' },
];

const STAT_GROUP_OPTIONS: Array<{ value: StatGroupKey; label: string }> = [
  { value: 'health', label: 'Health' },
  { value: 'strength', label: 'Strength' },
  { value: 'agility', label: 'Agility' },
  { value: 'defense', label: 'Defense' },
  { value: 'charisma', label: 'Charisma' },
  { value: 'wisdom', label: 'Wisdom' },
];

interface TaskPoolAddPanelProps {
  onAdd: (entry: TaskEntry) => void;
  onClose: () => void;
  embedded?: boolean;
  initialTab?: AddPanelTab;
}

interface ResourceTaskRow {
  key: string;
  groupKey?: string;
  groupTitle?: string;
  subgroupKey?: string;
  subgroupTitle?: string;
  resourceId: string;
  resourceName: string;
  resourceIcon: string;
  resourceType: string;
  taskId: string;
  taskName: string;
  detail?: string;
}

function defaultInputFields(taskType: DraftTaskType): InputFields {
  switch (taskType) {
    case 'CHECK':
      return { label: 'Done' };
    case 'COUNTER':
      return { target: 10, unit: 'count', step: 1 };
    case 'DURATION':
      return { targetDuration: 1800, unit: 'seconds' };
    case 'TIMER':
      return { countdownFrom: 300 };
    case 'RATING':
      return { scale: 5, label: 'Rate this' };
    case 'TEXT':
      return { prompt: 'Enter your response', maxLength: null };
  }
}

function buildXpAward(statGroup: StatGroupKey, xpValue: number) {
  return {
    health: 0,
    strength: 0,
    agility: 0,
    defense: 0,
    charisma: 0,
    wisdom: 0,
    [statGroup]: xpValue,
  };
}

function createTemplateEntry(templateRef: string, templateIcon?: string): TemplateTaskEntry {
  return {
    kind: 'template',
    id: uuidv4(),
    templateRef,
    icon: templateIcon,
  };
}

function createResourceEntry(row: ResourceTaskRow): ResourceTaskEntry {
  return {
    kind: 'resource',
    id: uuidv4(),
    resourceId: row.resourceId,
    taskId: row.taskId,
    resourceType: row.resourceType,
    taskName: row.taskName,
    icon: row.resourceIcon,
  };
}

function createInlineEntry(
  name: string,
  taskType: TaskType,
  inputFields: Partial<InputFields>,
  icon: string,
  description: string,
  xpAward: ReturnType<typeof buildXpAward>,
): InlineTaskEntry & {
  icon?: string;
  description: string | null;
  xpAward: ReturnType<typeof buildXpAward>;
} {
  return {
    kind: 'inline',
    id: uuidv4(),
    name,
    taskType,
    inputFields,
    icon: icon || undefined,
    description: description.trim() || null,
    xpAward,
  };
}

function resolveInventoryTaskName(taskTemplateRef: string, itemTemplateRef: string, itemTemplates: ReturnType<typeof mergeInventoryItemTemplates>): string {
  if (itemTemplateRef.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX)) {
    const customTemplate = itemTemplates.find((template) => template.id === itemTemplateRef);
    const customTask = customTemplate?.customTaskTemplates?.find((task) => task.name.trim() === taskTemplateRef);
    if (customTask) return customTask.name;
  }

  const coachTask = taskTemplateLibrary.find((template) => template.id === taskTemplateRef);
  if (coachTask) return coachTask.name;

  const itemTaskMeta = getItemTaskTemplateMeta(taskTemplateRef);
  if (itemTaskMeta) return itemTaskMeta.name;

  return taskTemplateRef;
}

function resolvePlacedTaskName(
  task: ItemRecurringTask,
  itemTemplateRef: string,
  itemTemplates: InventoryItemTemplate[],
  userTemplates: Record<string, TaskTemplate>,
  libraryTemplates: TaskTemplate[],
): string {
  const resolvedTemplate = resolveTaskTemplate(task.taskTemplateRef, userTemplates, starterTaskTemplates, libraryTemplates);
  if (resolvedTemplate?.name) return resolvedTemplate.name;

  const customTemplate = itemTemplates.find((template) => template.id === itemTemplateRef);
  const customTask = customTemplate?.customTaskTemplates?.find((taskTemplate) => (
    taskTemplate.id === task.taskTemplateRef || taskTemplate.name.trim() === task.taskTemplateRef
  ));
  if (customTask?.name) return customTask.name;

  const itemTemplate = resolveInventoryItemTemplate(itemTemplateRef, itemTemplates);
  const builtInTask = itemTemplate?.builtInTasks?.find((entry) => entry.taskTemplateRef === task.taskTemplateRef);
  if (builtInTask?.taskTemplateRef) {
    const itemTaskMeta = getItemTaskTemplateMeta(builtInTask.taskTemplateRef);
    if (itemTaskMeta?.name) return itemTaskMeta.name;
  }

  return task.taskType || 'Task';
}

interface ResourceTaskSubgroup {
  key: string;
  title: string;
  rows: ResourceTaskRow[];
}

interface ResourceTaskGroup {
  key: string;
  title: string;
  rows: ResourceTaskRow[];
  subgroups: ResourceTaskSubgroup[];
}

export function TaskPoolAddPanel({ onAdd, onClose, embedded = false, initialTab = 'library' }: TaskPoolAddPanelProps) {
  const taskTemplates = useScheduleStore((state) => state.taskTemplates);
  const resources = useResourceStore((state) => state.resources);
  const user = useUserStore((state) => state.user);

  const [activeTab, setActiveTab] = useState<AddPanelTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [statGroup, setStatGroup] = useState<StatGroupKey>('health');
  const [taskType, setTaskType] = useState<DraftTaskType>('CHECK');
  const [draftInputFields, setDraftInputFields] = useState<Partial<InputFields>>(defaultInputFields(taskType));
  const [error, setError] = useState('');

  useEffect(() => {
    setDraftInputFields(defaultInputFields(taskType));
  }, [taskType]);

  const libraryTemplates = useMemo(
    () => getLibraryTemplatePool().filter((template): template is TaskTemplate & { id: string } => Boolean(template.id) && template.isSystem !== true),
    [],
  );
  const customTemplates = useMemo(() => getCustomTemplatePool(taskTemplates), [taskTemplates]);
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredLibrary = useMemo(
    () => libraryTemplates.filter((template) => template.name.toLowerCase().includes(normalizedSearch)),
    [libraryTemplates, normalizedSearch],
  );

  const filteredCustom = useMemo(
    () => customTemplates.filter(({ template }) => template.name.toLowerCase().includes(normalizedSearch)),
    [customTemplates, normalizedSearch],
  );

  const intermittentResourceTasks = useMemo(() => {
    const rows: ResourceTaskRow[] = [];
    const userInventoryItemTemplates = getUserInventoryItemTemplates(user);

    for (const resource of Object.values(resources)) {
      if (resource.type === 'home') {
        for (const chore of resource.chores ?? []) {
          if (normalizeRecurrenceMode(chore.recurrenceMode) !== 'never') continue;
          rows.push({
            key: `home:${resource.id}:${chore.id}`,
            resourceId: resource.id,
            resourceName: resource.name,
            resourceIcon: resource.icon,
            resourceType: resource.type,
            taskId: chore.id,
            taskName: chore.name,
          });
        }

        for (const story of resource.stories ?? []) {
          for (const room of story.rooms) {
            for (const placement of room.placedItems) {
              const itemTemplate = resolveInventoryItemTemplate(placement.refId, userInventoryItemTemplates);
              const itemName = itemTemplate?.name ?? 'Unknown Item';

              for (const task of placement.recurringTasks ?? []) {
                if (normalizeRecurrenceMode(task.recurrenceMode) !== 'never') continue;

                rows.push({
                  key: `home:${resource.id}:room:${room.id}:placement:${placement.id}:task:${task.id}`,
                  groupKey: `home:${resource.id}:room:${room.id}`,
                  groupTitle: `${resource.name} — ${room.name}`,
                  subgroupKey: `home:${resource.id}:room:${room.id}:placement:${placement.id}`,
                  subgroupTitle: itemName,
                  resourceId: resource.id,
                  resourceName: resource.name,
                  resourceIcon: resource.icon,
                  resourceType: resource.type,
                  taskId: task.id,
                  taskName: resolvePlacedTaskName(task, placement.refId, userInventoryItemTemplates, taskTemplates, libraryTemplates),
                  detail: story.name,
                });
              }
            }
          }
        }

        continue;
      }

      if (resource.type === 'vehicle') {
        for (const task of resource.maintenanceTasks ?? []) {
          if (normalizeRecurrenceMode(task.recurrenceMode) !== 'never') continue;
          rows.push({
            key: `vehicle:${resource.id}:${task.id}`,
            resourceId: resource.id,
            resourceName: resource.name,
            resourceIcon: resource.icon,
            resourceType: resource.type,
            taskId: task.id,
            taskName: task.name,
          });
        }
        continue;
      }

      if (resource.type === 'account') {
        for (const task of resource.accountTasks ?? []) {
          if (normalizeRecurrenceMode(task.recurrenceMode) !== 'never') continue;
          rows.push({
            key: `account:${resource.id}:${task.id}`,
            resourceId: resource.id,
            resourceName: resource.name,
            resourceIcon: resource.icon,
            resourceType: resource.type,
            taskId: task.id,
            taskName: task.name,
          });
        }
        continue;
      }

      if (resource.type === 'inventory') {
        const mergedTemplates = mergeInventoryItemTemplates(getUserInventoryItemTemplates(user), resource.itemTemplates);
        const sourceItems = [
          ...resource.items.map((item) => ({ item, containerName: null as string | null })),
          ...(resource.containers ?? []).flatMap((container) => container.items.map((item) => ({ item, containerName: container.name }))),
        ];

        for (const { item, containerName } of sourceItems) {
          const itemTemplate = mergedTemplates.find((template) => template.id === item.itemTemplateRef);
          const itemName = itemTemplate?.name ?? item.itemTemplateRef;
          for (const task of item.recurringTasks ?? []) {
            if (normalizeRecurrenceMode(task.recurrenceMode) !== 'never') continue;
            rows.push({
              key: `inventory:${resource.id}:${task.id}`,
              resourceId: resource.id,
              resourceName: resource.name,
              resourceIcon: resource.icon,
              resourceType: resource.type,
              taskId: task.id,
              taskName: resolveInventoryTaskName(task.taskTemplateRef, item.itemTemplateRef, mergedTemplates),
              detail: containerName ? `${itemName} · ${containerName}` : itemName,
            });
          }
        }

        for (const container of resource.containers ?? []) {
          if (container.kind !== 'bag' || !container.carryTask) continue;
          if (normalizeRecurrenceMode(container.carryTask.recurrenceMode) !== 'never') continue;
          rows.push({
            key: `inventory:${resource.id}:bag:${container.id}:${container.carryTask.id}`,
            groupKey: `inventory:${resource.id}:bags`,
            groupTitle: `${resource.name} — Bags`,
            resourceId: resource.id,
            resourceName: resource.name,
            resourceIcon: resource.icon,
            resourceType: resource.type,
            taskId: container.carryTask.id,
            taskName: container.carryTask.name,
            detail: container.name,
          });
        }
      }
    }

    return rows
      .filter((row) => !normalizedSearch || `${row.taskName} ${row.resourceName} ${row.detail ?? ''} ${row.groupTitle ?? ''} ${row.subgroupTitle ?? ''}`.toLowerCase().includes(normalizedSearch))
      .sort((left, right) => (
        left.resourceType.localeCompare(right.resourceType) ||
        left.resourceName.localeCompare(right.resourceName) ||
        (left.groupTitle ?? '').localeCompare(right.groupTitle ?? '') ||
        (left.subgroupTitle ?? '').localeCompare(right.subgroupTitle ?? '') ||
        left.taskName.localeCompare(right.taskName)
      ));
  }, [libraryTemplates, normalizedSearch, resources, taskTemplates, user]);

  const resourceGroups = useMemo(() => {
    const grouped = new Map<string, ResourceTaskGroup>();

    for (const row of intermittentResourceTasks) {
      const key = row.groupKey ?? `${row.resourceType}:${row.resourceId}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          title: row.groupTitle ?? `${row.resourceType.charAt(0).toUpperCase() + row.resourceType.slice(1)} · ${row.resourceName}`,
          rows: [],
          subgroups: [],
        });
      }

      const group = grouped.get(key)!;
      if (!row.subgroupKey) {
        group.rows.push(row);
        continue;
      }

      let subgroup = group.subgroups.find((entry) => entry.key === row.subgroupKey);
      if (!subgroup) {
        subgroup = {
          key: row.subgroupKey,
          title: row.subgroupTitle ?? 'Unknown Item',
          rows: [],
        };
        group.subgroups.push(subgroup);
      }
      subgroup.rows.push(row);
    }

    return Array.from(grouped.values());
  }, [intermittentResourceTasks]);

  function handleTemplateAdd(templateRef: string) {
    const templateIcon = taskTemplates[templateRef]?.icon
      ?? libraryTemplates.find((template) => template.id === templateRef)?.icon;
    onAdd(createTemplateEntry(templateRef, templateIcon));
    onClose();
  }

  function handleResourceAdd(row: ResourceTaskRow) {
    onAdd(createResourceEntry(row));
    onClose();
  }

  function handleCreateTask() {
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    const fields = draftInputFields as Record<string, unknown>;

    const normalizedInputFields: Partial<InputFields> = taskType === 'CHECK'
      ? { ...draftInputFields, label: typeof fields.label === 'string' && fields.label.trim() ? fields.label.trim() : 'Done' }
      : taskType === 'COUNTER'
        ? {
            ...draftInputFields,
            target: typeof fields.target === 'number' && fields.target > 0 ? fields.target : 10,
            step: typeof fields.step === 'number' && fields.step > 0 ? fields.step : 1,
            unit: typeof fields.unit === 'string' ? fields.unit.trim() : '',
          }
        : taskType === 'RATING'
          ? {
              ...draftInputFields,
              scale: typeof fields.scale === 'number' && fields.scale >= 2 ? fields.scale : 5,
              label: typeof fields.label === 'string' && fields.label.trim() ? fields.label.trim() : 'Rate this',
            }
          : taskType === 'TEXT'
            ? {
                ...draftInputFields,
                prompt: typeof fields.prompt === 'string' ? fields.prompt.trim() : '',
              }
            : draftInputFields;

    onAdd(createInlineEntry(
      title.trim(),
      taskType,
      normalizedInputFields,
      icon,
      description,
      buildXpAward(statGroup, 5),
    ));
    onClose();
  }

  function renderTemplateButton(item: { ref: string; name: string; taskType: string }, secondaryText?: string) {
    return (
      <button
        key={item.ref}
        type="button"
        onClick={() => handleTemplateAdd(item.ref)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{item.name}</div>
          {secondaryText ? <div className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{secondaryText}</div> : null}
        </div>
        <span className="shrink-0 rounded-full bg-purple-100 px-2 py-1 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
          {item.taskType}
        </span>
      </button>
    );
  }

  const content = (
      <div className="flex flex-col gap-4">
        {!embedded && (
          <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
            {ADD_PANEL_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {(activeTab === 'library' || activeTab === 'templates' || activeTab === 'resource') && (
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={activeTab === 'resource' ? 'Search resource tasks' : 'Search tasks'}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        )}

        {activeTab === 'library' && (
          filteredLibrary.length === 0
            ? <p className="text-sm text-gray-500 dark:text-gray-400">No matching library templates.</p>
            : <div className="flex flex-col gap-2">{filteredLibrary.map((template) => renderTemplateButton({ ref: template.id, name: template.name, taskType: template.taskType }))}</div>
        )}

        {activeTab === 'templates' && (
          filteredCustom.length === 0
            ? <p className="text-sm text-gray-500 dark:text-gray-400">{customTemplates.length === 0 ? 'No custom templates yet.' : 'No matching custom templates.'}</p>
            : <div className="flex flex-col gap-2">{filteredCustom.map(({ ref, template }) => renderTemplateButton({ ref, name: template.name, taskType: template.taskType }))}</div>
        )}

        {activeTab === 'new' && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Title</label>
              <input
                type="text"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setError('');
                }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>

            <div>
              <IconPicker value={icon} onChange={setIcon} align="left" />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Description</label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional description"
                rows={2}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Stat Group</label>
              <select
                value={statGroup}
                onChange={(event) => setStatGroup(event.target.value as StatGroupKey)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              >
                {STAT_GROUP_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Task type</label>
              <select
                value={taskType}
                onChange={(event) => {
                  setTaskType(event.target.value as DraftTaskType);
                  setDraftInputFields(defaultInputFields(event.target.value as DraftTaskType));
                }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              >
                {DRAFT_TASK_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <TaskTypeConfigEditor
              taskType={taskType ?? 'CHECK'}
              inputFields={draftInputFields}
              onChange={setDraftInputFields}
            />

            {error ? <p className="text-sm text-red-500">{error}</p> : null}

            <div className="flex justify-end">
              <button type="button" onClick={handleCreateTask} className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500">
                Create and Add
              </button>
            </div>
          </div>
        )}

        {activeTab === 'resource' && (
          resourceGroups.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No intermittent resource tasks available.</p>
          ) : (
            <div className="max-h-[26rem] space-y-4 overflow-y-auto pr-1">
              {resourceGroups.map((group) => (
                <div key={group.key} className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    {group.title}
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {group.rows.map((row) => (
                      <button
                        key={row.key}
                        type="button"
                        onClick={() => handleResourceAdd(row)}
                        className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40"
                      >
                        <IconDisplay iconKey={row.resourceIcon} size={16} className="h-4 w-4 shrink-0 object-contain" alt="" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{row.taskName}</div>
                          <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                            {row.detail ? `${row.resourceName} · ${row.detail}` : row.resourceName}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-xs font-medium capitalize text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                          {row.resourceType}
                        </span>
                      </button>
                    ))}
                    {group.subgroups.map((subgroup) => (
                      <div key={subgroup.key}>
                        <div className="bg-gray-50/60 px-3 py-2 text-xs font-semibold text-gray-600 dark:bg-gray-800/60 dark:text-gray-300">
                          {subgroup.title}
                        </div>
                        <div className="divide-y divide-gray-100 dark:divide-gray-700">
                          {subgroup.rows.map((row) => (
                            <button
                              key={row.key}
                              type="button"
                              onClick={() => handleResourceAdd(row)}
                              className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40"
                            >
                              <IconDisplay iconKey={row.resourceIcon} size={16} className="h-4 w-4 shrink-0 object-contain" alt="" />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{row.taskName}</div>
                                <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                                  {row.detail ? `${row.resourceName} · ${row.detail}` : row.resourceName}
                                </div>
                              </div>
                              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-xs font-medium capitalize text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                {row.resourceType}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <PopupShell title="Add Task" onClose={onClose} size="large">
      {content}
    </PopupShell>
  );
}
