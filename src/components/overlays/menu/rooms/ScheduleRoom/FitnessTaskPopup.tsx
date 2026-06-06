import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { PopupShell } from '../../../../shared/popups/PopupShell';
import { TaskTypeConfigEditor } from '../../../../shared/TaskTypeConfigEditor';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { itemLibrary } from '../../../../../coach/ItemLibrary';
import type { InputFields, TaskTemplate, TaskType, XpAward } from '../../../../../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const FITNESS_TASK_TYPES: TaskType[] = [
  'SETS_REPS',
  'CIRCUIT',
  'DURATION',
  'COUNTER',
  'LOCATION_TRAIL',
];

type MuscleGroup = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'cardio';

const MUSCLE_GROUPS: MuscleGroup[] = [
  'chest',
  'back',
  'legs',
  'shoulders',
  'arms',
  'core',
  'cardio',
];

const INTENSITY_LEVELS = [1, 2, 3, 4, 5] as const;

const ENERGY_COST_MAP: Record<number, number> = {
  1: 5,
  2: 10,
  3: 15,
  4: 25,
  5: 40,
};

function deriveXpAward(muscleGroup: MuscleGroup | ''): XpAward {
  const base: XpAward = {
    health: 0,
    strength: 0,
    agility: 0,
    defense: 0,
    charisma: 0,
    wisdom: 0,
  };
  if (muscleGroup === 'core') return { ...base, agility: 10 };
  if (muscleGroup === 'cardio') return { ...base, agility: 15 };
  return { ...base, strength: 10 };
}

function deriveEnergyCost(intensityRating: number | ''): string {
  if (!intensityRating) return '--';
  return String(ENERGY_COST_MAP[intensityRating] ?? '--');
}

function deriveStatLabel(muscleGroup: MuscleGroup | ''): string {
  if (muscleGroup === 'core' || muscleGroup === 'cardio') return 'Agility';
  return 'Strength';
}

// ── Exercise items from itemLibrary ──────────────────────────────────────────

const exerciseItems = itemLibrary.filter((item) => item.id.startsWith('exercise-item-'));

// ── Props ─────────────────────────────────────────────────────────────────────

interface FitnessTaskPopupProps {
  editKey: string | null;
  editTemplate: TaskTemplate | null;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FitnessTaskPopup({ editKey, editTemplate, onClose }: FitnessTaskPopupProps) {
  const setTaskTemplate = useScheduleStore((s) => s.setTaskTemplate);
  const removeTaskTemplate = useScheduleStore((s) => s.removeTaskTemplate);

  // Determine mode
  const isConfigMode = editTemplate != null && !!(editTemplate as TaskTemplate & { sourceTemplateId?: string }).sourceTemplateId;
  const isEditMode = editTemplate != null && !(editTemplate as TaskTemplate & { sourceTemplateId?: string }).sourceTemplateId;
 // const isCreateMode = editTemplate == null;

  // Field state
  const [name, setName] = useState(editTemplate?.name ?? '');
  const [description, setDescription] = useState(editTemplate?.description ?? '');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup | ''>(
    (editTemplate as (TaskTemplate & { muscleGroup?: MuscleGroup }) | null)?.muscleGroup ?? ''
  );
  const [intensityRating, setIntensityRating] = useState<1 | 2 | 3 | 4 | 5 | ''>(
    (editTemplate as (TaskTemplate & { intensityRating?: 1 | 2 | 3 | 4 | 5 }) | null)?.intensityRating ?? ''
  );
  const [taskType, setTaskType] = useState<TaskType>(
    (editTemplate?.taskType as TaskType | undefined) && FITNESS_TASK_TYPES.includes(editTemplate!.taskType as TaskType)
      ? (editTemplate!.taskType as TaskType)
      : 'SETS_REPS'
  );
  const [inputFields, setInputFields] = useState<Partial<InputFields>>(
    (editTemplate?.inputFields as Partial<InputFields>) ?? {}
  );
  const [selectedItems, setSelectedItems] = useState<string[]>(editTemplate?.items ?? []);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isLocked = isConfigMode;

  const title = isConfigMode
    ? 'Configure Exercise'
    : isEditMode
    ? 'Edit Exercise'
    : 'Add Exercise';

  function toggleItem(itemId: string) {
    setSelectedItems((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  }

  function handleSave() {
    if (isConfigMode && editKey) {
      setTaskTemplate(editKey, {
        ...(editTemplate as TaskTemplate),
        inputFields: inputFields as InputFields,
      });
    } else if (isEditMode && editKey && editTemplate) {
      setTaskTemplate(editKey, {
        ...(editTemplate as TaskTemplate),
        name,
        description,
        taskType: taskType as TaskType,
        inputFields: inputFields as InputFields,
        muscleGroup: muscleGroup || undefined,
        intensityRating: intensityRating || undefined,
        items: selectedItems,
        xpAward: deriveXpAward(muscleGroup),
      } as TaskTemplate);
    } else {
      // Create mode
      setTaskTemplate(uuidv4(), {
        name,
        description,
        icon: 'exercise-item-dumbbell',
        taskType: taskType as TaskType,
        secondaryTag: 'fitness',
        inputFields: inputFields as InputFields,
        xpAward: deriveXpAward(muscleGroup),
        cooldown: null,
        media: null,
        items: selectedItems,
        isCustom: true,
        muscleGroup: muscleGroup || undefined,
        intensityRating: intensityRating || undefined,
      } as TaskTemplate);
    }
    onClose();
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (editKey) {
      removeTaskTemplate(editKey);
    }
    onClose();
  }

  return (
    <PopupShell fullHeight title={title} onClose={onClose} size="large">
      <div className="flex flex-col h-full">
        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              readOnly={isLocked}
              className={`w-full rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm outline-none ${
                isLocked
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-400'
              }`}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              readOnly={isLocked}
              className={`w-full rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm outline-none resize-none ${
                isLocked
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-400'
              }`}
            />
          </div>

          {/* Muscle Group + Intensity row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Muscle Group
              </label>
              <select
                value={muscleGroup}
                onChange={(e) => setMuscleGroup(e.target.value as MuscleGroup | '')}
                disabled={isLocked}
                className={`w-full rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm outline-none ${
                  isLocked
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                }`}
              >
                <option value="">-- Select --</option>
                {MUSCLE_GROUPS.map((mg) => (
                  <option key={mg} value={mg}>
                    {mg.charAt(0).toUpperCase() + mg.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Intensity
              </label>
              <select
                value={intensityRating}
                onChange={(e) =>
                  setIntensityRating(e.target.value === '' ? '' : (Number(e.target.value) as 1 | 2 | 3 | 4 | 5))
                }
                disabled={isLocked}
                className={`w-full rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm outline-none ${
                  isLocked
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                }`}
              >
                <option value="">-- Select --</option>
                {INTENSITY_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Derived info row — display only */}
          <div className="flex gap-4 text-sm text-gray-500 dark:text-gray-400">
            <span>Stat: {deriveStatLabel(muscleGroup)}</span>
            <span>Energy Cost: {deriveEnergyCost(intensityRating)}</span>
          </div>

          {/* Task Type + Items row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Task Type
              </label>
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as TaskType)}
                disabled={isLocked}
                className={`w-full rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm outline-none ${
                  isLocked
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                }`}
              >
                {FITNESS_TASK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Items — exercise-item-* chips */}
          {exerciseItems.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                Items
              </label>
              <div className="flex flex-wrap gap-2">
                {exerciseItems.map((item) => {
                  const active = selectedItems.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={isLocked}
                      onClick={() => !isLocked && toggleItem(item.id)}
                      className={`rounded-full px-2 py-1 text-xs transition-colors ${
                        active
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      } ${isLocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {item.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Task Config — always editable */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
              Configuration
            </label>
            <TaskTypeConfigEditor
              taskType={taskType}
              inputFields={inputFields}
              onChange={(updated) => setInputFields((prev) => ({ ...prev, ...updated }))}
              readOnly={false}
            />
          </div>

        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 flex justify-between">
          <div>
            {isEditMode && (
              <button
                type="button"
                onClick={handleDelete}
                className="bg-red-500 text-white rounded-lg px-3 py-2 text-sm"
              >
                {confirmDelete ? 'Confirm?' : 'Delete'}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-gray-500 text-sm px-3 py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="bg-blue-500 text-white rounded-lg px-3 py-2 text-sm"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </PopupShell>
  );
}
