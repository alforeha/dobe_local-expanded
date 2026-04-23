import { useMemo, useState } from 'react';
import { PopupShell } from '../../shared/popups/PopupShell';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { addTaskToEvent, addUniqueTaskToEvent } from '../../../engine/eventExecution';
import { getCustomTemplatePool, getEventLibraryTemplatePool } from '../../../utils/resolveTaskTemplate';
import type { InputFields, TaskType } from '../../../types';
import type { Task } from '../../../types/task';

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

interface AddTaskPanelProps {
  eventId: string;
  onClose: () => void;
}

function buildUniqueTaskResultFields(taskType: NewTaskType, values: {
  counterTarget: number;
  counterUnit: string;
  durationMinutes: number;
  timerSeconds: number;
  ratingScale: number;
  ratingPrompt: string;
  textPrompt: string;
}): Partial<InputFields> {
  switch (taskType) {
    case 'CHECK':
      return { label: 'Done' };
    case 'COUNTER':
      return { target: values.counterTarget, unit: values.counterUnit.trim(), step: 1 };
    case 'DURATION':
      return { targetDuration: values.durationMinutes * 60, unit: 'minutes' };
    case 'TIMER':
      return { countdownFrom: values.timerSeconds };
    case 'RATING':
      return { scale: values.ratingScale, label: values.ratingPrompt.trim() || 'Rate this' };
    case 'TEXT':
      return { prompt: values.textPrompt.trim(), maxLength: null };
  }
}

export function AddTaskPanel({ eventId, onClose }: AddTaskPanelProps) {
  const taskTemplates = useScheduleStore((state) => state.taskTemplates);
  const [activeTab, setActiveTab] = useState<AddTaskTab>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState<NewTaskType>('CHECK');
  const [counterTarget, setCounterTarget] = useState(10);
  const [counterUnit, setCounterUnit] = useState('count');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [timerSeconds, setTimerSeconds] = useState(300);
  const [ratingScale, setRatingScale] = useState(5);
  const [ratingPrompt, setRatingPrompt] = useState('');
  const [textPrompt, setTextPrompt] = useState('');
  const [error, setError] = useState('');

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

    const newTask: Omit<Task, 'id'> = {
      templateRef: null,
      isUnique: true,
      title: title.trim(),
      taskType,
      completionState: 'pending',
      completedAt: null,
      resultFields: buildUniqueTaskResultFields(taskType, {
        counterTarget,
        counterUnit,
        durationMinutes,
        timerSeconds,
        ratingScale,
        ratingPrompt,
        textPrompt,
      }),
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

            {taskType === 'COUNTER' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Target number</label>
                  <input type="number" min={1} value={counterTarget} onChange={(event) => setCounterTarget(Number(event.target.value) || 1)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Unit text</label>
                  <input type="text" value={counterUnit} onChange={(event) => setCounterUnit(event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                </div>
              </div>
            )}

            {taskType === 'DURATION' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Minutes</label>
                <input type="number" min={1} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value) || 1)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
              </div>
            )}

            {taskType === 'TIMER' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Seconds</label>
                <input type="number" min={1} value={timerSeconds} onChange={(event) => setTimerSeconds(Number(event.target.value) || 1)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
              </div>
            )}

            {taskType === 'RATING' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Out of</label>
                  <input type="number" min={2} value={ratingScale} onChange={(event) => setRatingScale(Number(event.target.value) || 2)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Prompt text</label>
                  <input type="text" value={ratingPrompt} onChange={(event) => setRatingPrompt(event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                </div>
              </div>
            )}

            {taskType === 'TEXT' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Prompt text</label>
                <input type="text" value={textPrompt} onChange={(event) => setTextPrompt(event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
              </div>
            )}

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