import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getTaskTypeIconKey, normalizeTaskTemplateIconKey } from '../../../../../constants/iconMap';
import { PopupShell } from '../../../../shared/popups/PopupShell';
import { IconPicker } from '../../../../shared/IconPicker';
import { TaskTypeConfigEditor } from '../../../../shared/TaskTypeConfigEditor';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { normalizeCircuitInputFields, type CircuitInputFields, type ConsumeInputFields, type InputFields, type TaskSecondaryTag, type TaskTemplate, type TaskType } from '../../../../../types';
import type { StatGroupKey } from '../../../../../types/user';

const TASK_TYPES: TaskType[] = [
  'CHECK',
  'COUNTER',
  'SETS_REPS',
  'CIRCUIT',
  'DURATION',
  'TIMER',
  'RATING',
  'TEXT',
  'FORM',
  'CHOICE',
  'CHECKLIST',
  'SCAN',
  'LOG',
  'LOCATION_POINT',
  'LOCATION_TRAIL',
  'ROLL',
  'CONSUME',
];

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  CHECK: 'Check',
  COUNTER: 'Counter',
  SETS_REPS: 'Sets & Reps',
  CIRCUIT: 'Circuit',
  DURATION: 'Duration',
  TIMER: 'Timer',
  RATING: 'Rating',
  TEXT: 'Text',
  FORM: 'Form',
  CHOICE: 'Choice',
  CHECKLIST: 'Checklist',
  SCAN: 'Scan',
  LOG: 'Log',
  LOCATION_POINT: 'Location Point',
  LOCATION_TRAIL: 'Location Trail',
  ROLL: 'Roll',
  CONSUME: 'Consume',
};

const SECONDARY_TAGS: TaskSecondaryTag[] = [
  'fitness',
  'health',
  'nutrition',
  'mindfulness',
  'home',
  'admin',
  'finance',
  'social',
  'learning',
];

const STAT_GROUPS: { key: StatGroupKey; label: string }[] = [
  { key: 'health', label: 'Health' },
  { key: 'strength', label: 'Strength' },
  { key: 'agility', label: 'Agility' },
  { key: 'defense', label: 'Defense' },
  { key: 'charisma', label: 'Charisma' },
  { key: 'wisdom', label: 'Wisdom' },
];

function defaultInputFields(taskType: TaskType): InputFields {
  switch (taskType) {
    case 'CHECK':
      return { label: 'Done' };
    case 'COUNTER':
      return { target: 10, unit: 'count', step: 1 };
    case 'SETS_REPS':
      return { sets: 3, reps: 10, weight: null, weightUnit: 'kg', restAfter: null, dropSet: false };
    case 'CIRCUIT':
      return { label: 'Circuit', steps: [], rounds: 3, restBetweenRounds: null };
    case 'DURATION':
      return { targetDuration: 1800, unit: 'seconds' };
    case 'TIMER':
      return { countdownFrom: 300 };
    case 'RATING':
      return { scale: 5, label: 'Rate this' };
    case 'TEXT':
      return { prompt: 'Enter your response', maxLength: null };
    case 'FORM':
      return { fields: [] };
    case 'CHOICE':
      return { options: ['Option A', 'Option B'], multiSelect: false };
    case 'CHECKLIST':
      return { items: [], requireAll: false };
    case 'SCAN':
      return { scanType: 'barcode' };
    case 'LOG':
      return { prompt: null };
    case 'LOCATION_POINT':
      return { label: 'Mark location', captureAccuracy: true };
    case 'LOCATION_TRAIL':
      return { label: 'Record trail', captureInterval: null };
    case 'ROLL':
      return { sides: 6 };
    case 'CONSUME':
      return { label: 'Consume items', entries: [] };
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


function inputClassName(disabled: boolean) {
  return `w-full rounded-xl border px-3 py-2 text-sm focus:outline-none ${
    disabled
      ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500'
      : 'border-gray-300 bg-white text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
  }`;
}

interface TaskTemplatePopupProps {
  editKey: string | null;
  editTemplate: TaskTemplate | null;
  onClose: () => void;
  readOnly?: boolean;
}

export function TaskTemplatePopup({
  editKey,
  editTemplate,
  onClose,
  readOnly = false,
}: TaskTemplatePopupProps) {
  const setTaskTemplate = useScheduleStore((s) => s.setTaskTemplate);
  const removeTaskTemplate = useScheduleStore((s) => s.removeTaskTemplate);
  const isEditMode = editKey !== null && editTemplate !== null;

  const initialStatGroup: StatGroupKey = (() => {
    if (!isEditMode || !editTemplate) return 'health';
    const groups: StatGroupKey[] = ['health', 'strength', 'agility', 'defense', 'charisma', 'wisdom'];
    return groups.find((group) => editTemplate.xpAward[group] > 0) ?? 'health';
  })();

  const initialXpValue = isEditMode && editTemplate ? editTemplate.xpAward[initialStatGroup] : 5;

  const [name, setName] = useState(isEditMode && editTemplate ? editTemplate.name : '');
  const [taskType, setTaskType] = useState<TaskType>(isEditMode && editTemplate ? editTemplate.taskType : 'CHECK');
  const [icon, setIcon] = useState(
    isEditMode && editTemplate
      ? normalizeTaskTemplateIconKey(editTemplate.icon, editTemplate.taskType)
      : getTaskTypeIconKey('CHECK'),
  );
  const [secondaryTag, setSecondaryTag] = useState<TaskSecondaryTag | ''>(
    isEditMode && editTemplate ? (editTemplate.secondaryTag ?? '') : '',
  );
  const [statGroup, setStatGroup] = useState<StatGroupKey>(initialStatGroup);
  const [xpValue, _setXpValue] = useState<number | ''>(initialXpValue);
  const [cooldown, setCooldown] = useState<number | ''>(
    isEditMode && editTemplate && editTemplate.cooldown !== null ? editTemplate.cooldown : '',
  );
  const [description, setDescription] = useState(isEditMode && editTemplate ? editTemplate.description : '');
  const [inputFields, setInputFields] = useState<InputFields>(
    isEditMode && editTemplate
      ? (editTemplate.taskType === 'CIRCUIT' ? normalizeCircuitInputFields(editTemplate.inputFields as CircuitInputFields) : editTemplate.inputFields)
      : defaultInputFields(taskType),
  );
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  function handleSave() {
    if (readOnly) return;
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (xpValue === '' || xpValue <= 0) {
      setError('XP value must be greater than 0.');
      return;
    }

    const normalizedInputFields = taskType === 'CONSUME'
      ? {
          ...(inputFields as ConsumeInputFields),
          label: (inputFields as ConsumeInputFields).label.trim() || 'Consume items',
          entries: ((inputFields as ConsumeInputFields).entries ?? []).filter(
            (entry) => entry.itemTemplateRef.trim().length > 0 && entry.quantity > 0,
          ),
        } satisfies ConsumeInputFields
      : inputFields;

    const template: TaskTemplate = {
      name: name.trim(),
      description: description.trim(),
      icon: normalizeTaskTemplateIconKey(icon, taskType),
      taskType,
      secondaryTag: secondaryTag === '' ? null : secondaryTag,
      inputFields: normalizedInputFields,
      xpAward: buildXpAward(statGroup, xpValue),
      cooldown: cooldown === '' ? null : cooldown,
      media: null,
      items: [],
    };

    if (isEditMode && editKey) {
      setTaskTemplate(editKey, {
        ...template,
        id: editTemplate?.id,
        isCustom: editTemplate?.isCustom,
        isSystem: editTemplate?.isSystem,
        xpBonus: editTemplate?.xpBonus,
      });
    } else {
      const id = uuidv4();
      setTaskTemplate(id, { ...template, isCustom: true });
    }

    onClose();
  }

  function handleDelete() {
    if (!isEditMode || !editKey || readOnly) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }

    removeTaskTemplate(editKey);
    onClose();
  }

  const title = readOnly
    ? 'View Task Template'
    : isEditMode
      ? 'Edit Task Template'
      : 'Add Task Template';

  return (
    <PopupShell
      title={title}
      onClose={onClose}
      size="large"
      headerRight={
        readOnly ? (
          <span className="rounded-full bg-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            Prebuilt template no editing
          </span>
        ) : undefined
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden pb-4">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-4">
            <div className="w-24 shrink-0">
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Icon</label>
              <div className={readOnly ? 'pointer-events-none opacity-60' : ''}>
                <IconPicker value={icon} onChange={setIcon} align="left" />
              </div>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                disabled={readOnly}
                placeholder="e.g. Morning walk"
                className={inputClassName(readOnly)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={readOnly}
              rows={4}
              className={`${inputClassName(readOnly)} resize-none`}
              placeholder="Short description of what this task involves"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Stat Group</label>
              <select
                value={statGroup}
                onChange={(e) => setStatGroup(e.target.value as StatGroupKey)}
                disabled={readOnly}
                className={inputClassName(readOnly)}
              >
                {STAT_GROUPS.map(({ key, label }) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Category</label>
              <select
                value={secondaryTag}
                onChange={(e) => setSecondaryTag(e.target.value as TaskSecondaryTag | '')}
                disabled={readOnly}
                className={inputClassName(readOnly)}
              >
                <option value="">None</option>
                {SECONDARY_TAGS.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Task Type</label>
              <select
                value={taskType}
                onChange={(e) => {
                  const t = e.target.value as TaskType;
                  setTaskType(t);
                  setInputFields(defaultInputFields(t));
                }}
                disabled={readOnly}
                className={inputClassName(readOnly)}
              >
                {TASK_TYPES.map((type) => (
                  <option key={type} value={type}>{TASK_TYPE_LABELS[type]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Cooldown (minutes)</label>
              <input
                type="number"
                value={cooldown}
                onChange={(e) => setCooldown(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={readOnly}
                min={1}
                className={inputClassName(readOnly)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-gray-500 dark:text-gray-400">Task inputs</label>
            <div className={`rounded-xl border px-4 py-3 ${
              readOnly
                ? 'border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-900'
                : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40'
            }`}>
              <TaskTypeConfigEditor
                taskType={taskType}
                inputFields={inputFields}
                onChange={(updated) => setInputFields((fields) => ({ ...fields, ...updated }) as InputFields)}
                readOnly={readOnly}
              />
            </div>
          </div>
        </div>

        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
          <div>
            {isEditMode && editTemplate?.isCustom === true && !readOnly ? (
              <button
                type="button"
                onClick={handleDelete}
                className="text-xs text-red-500 hover:text-red-700"
              >
                {confirmingDelete ? 'Confirm delete?' : 'Delete'}
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={readOnly}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              readOnly
                ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            Save
          </button>
          </div>
        </div>
      </div>
    </PopupShell>
  );
}
