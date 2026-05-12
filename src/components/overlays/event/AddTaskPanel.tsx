import { useEffect, useMemo, useState } from 'react';
import { PopupShell } from '../../shared/popups/PopupShell';
import { IconPicker } from '../../shared/IconPicker';
import { TaskTypeConfigEditor } from '../../shared/TaskTypeConfigEditor';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { addTaskToEvent, addUniqueTaskToEvent } from '../../../engine/eventExecution';
import { getCustomTemplatePool, getEventLibraryTemplatePool } from '../../../utils/resolveTaskTemplate';
import type { InputFields, TaskType } from '../../../types';
import type { Task } from '../../../types/task';
import type { StatGroupKey } from '../../../types/user';

type AddTaskTab = 'library' | 'templates' | 'new';
type NewTaskType = Extract<TaskType, 'CHECK' | 'COUNTER' | 'DURATION' | 'TIMER' | 'RATING' | 'TEXT'>;

const NEW_TASK_TYPES: Array<{ value: NewTaskType; label: string }> = [
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

interface AddTaskPanelProps {
  eventId: string;
  onClose: () => void;
}

function defaultInputFields(taskType: NewTaskType): InputFields {
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

export function AddTaskPanel({ eventId, onClose }: AddTaskPanelProps) {
  const taskTemplates = useScheduleStore((state) => state.taskTemplates);
  const [activeTab, setActiveTab] = useState<AddTaskTab>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [statGroup, setStatGroup] = useState<StatGroupKey>('health');
  const [taskType, setTaskType] = useState<NewTaskType>('CHECK');
  const [inputFields, setInputFields] = useState<Partial<InputFields>>(defaultInputFields(taskType));
  const [error, setError] = useState('');

  useEffect(() => {
    setInputFields(defaultInputFields(taskType));
  }, [taskType]);

  const libraryTemplates = useMemo(() => getEventLibraryTemplatePool(), []);
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

  const handleTemplateAdd = (templateRef: string) => {
    addTaskToEvent(templateRef, eventId);
    onClose();
  };

  const handleCreateTask = () => {
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    const fields = inputFields as Record<string, unknown>;

    const normalizedInputFields: Partial<InputFields> = taskType === 'CHECK'
      ? { ...inputFields, label: typeof fields.label === 'string' && fields.label.trim() ? fields.label.trim() : 'Done' }
      : taskType === 'COUNTER'
        ? {
            ...inputFields,
            target: typeof fields.target === 'number' && fields.target > 0 ? fields.target : 10,
            step: typeof fields.step === 'number' && fields.step > 0 ? fields.step : 1,
            unit: typeof fields.unit === 'string' ? fields.unit.trim() : '',
          }
        : taskType === 'RATING'
          ? {
              ...inputFields,
              scale: typeof fields.scale === 'number' && fields.scale >= 2 ? fields.scale : 5,
              label: typeof fields.label === 'string' && fields.label.trim() ? fields.label.trim() : 'Rate this',
            }
          : taskType === 'TEXT'
            ? {
                ...inputFields,
                prompt: typeof fields.prompt === 'string' ? fields.prompt.trim() : '',
              }
            : inputFields;

    const newTask: Omit<Task, 'id'> = {
      templateRef: null,
      isUnique: true,
      title: title.trim(),
      icon: icon || undefined,
      description: description.trim() || null,
      taskType,
      xpAward: buildXpAward(statGroup, 5),
      completionState: 'pending',
      completedAt: null,
      resultFields: normalizedInputFields,
      attachmentRef: null,
      resourceRef: null,
      location: null,
      sharedWith: null,
      questRef: null,
      actRef: null,
      secondaryTag: null,
    };

    addUniqueTaskToEvent(newTask, eventId);
    onClose();
  };

  const renderTemplateList = (items: Array<{ ref: string; name: string; taskType: string }>, emptyMessage: string) => {
    if (items.length === 0) {
      return <p className="text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>;
    }

    return (
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <button
            key={item.ref}
            type="button"
            onClick={() => handleTemplateAdd(item.ref)}
            className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/40"
          >
            <span className="font-medium text-gray-800 dark:text-gray-100">{item.name}</span>
            <span className="rounded-full bg-purple-100 px-2 py-1 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
              {item.taskType}
            </span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <PopupShell title="Add Task" onClose={onClose} size="large">
      <div className="flex flex-col gap-4">
        <div className="flex gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
          {[
            { id: 'library', label: 'Library' },
            { id: 'templates', label: 'My Templates' },
            { id: 'new', label: 'New Task' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as AddTaskTab)}
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

        {(activeTab === 'library' || activeTab === 'templates') && (
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search tasks"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        )}

        {activeTab === 'library' && renderTemplateList(
          filteredLibrary.map((template) => ({ ref: template.id!, name: template.name, taskType: template.taskType })),
          'No matching library templates.',
        )}

        {activeTab === 'templates' && renderTemplateList(
          filteredCustom.map(({ ref, template }) => ({ ref, name: template.name, taskType: template.taskType })),
          customTemplates.length === 0 ? 'No custom templates yet - create one in the Task Room' : 'No matching custom templates.',
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
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Task Type</label>
              <select
                value={taskType}
                onChange={(event) => setTaskType(event.target.value as NewTaskType)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              >
                {NEW_TASK_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <TaskTypeConfigEditor
              taskType={taskType}
              inputFields={inputFields}
              onChange={(updated) => setInputFields((fields) => ({ ...fields, ...updated }))}
            />

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleCreateTask}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </PopupShell>
  );
}