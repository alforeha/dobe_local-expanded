import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useUserStore } from '../../../../../stores/useUserStore';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { taskTemplateLibrary } from '../../../../../coach';
import { WorkoutExecutionInput } from '../../../event/inputs/WorkoutExecutionInput';
import { completeFavourite } from '../../../../../engine/listsEngine';
import type { TaskTemplate, SetsRepsInputFields, DurationInputFields, InputFields  } from '../../../../../types/taskTemplate';
import { itemLibrary } from '../../../../../coach/ItemLibrary';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { FitnessTaskPopup } from './FitnessTaskPopup';
//import { ref } from 'process';



type MuscleGroupFilter =
  | 'all'
  | 'chest'
  | 'back'
  | 'legs'
  | 'shoulders'
  | 'arms'
  | 'core'
  | 'cardio';

type PowerBayTabValue = 'exercises' | 'workoutplan';

interface PowerBayTabProps {
  activeTab: PowerBayTabValue;
}

export function PowerBayTab({ activeTab }: PowerBayTabProps) {
  const user = useUserStore((s) => s.user);
  const customTemplates = useScheduleStore((s) => s.taskTemplates);
  const setTaskTemplate = useScheduleStore((s) => s.setTaskTemplate);
  const energy = user?.progression.stats.energy;

  type FitnessPopupState =
    | { mode: 'add' }
    | { mode: 'config'; key: string; template: TaskTemplate }
    | null;

  const [fitnessPopup, setFitnessPopup] = useState<FitnessPopupState>(null);
  const [search, setSearch] = useState('');
  const [muscleGroupFilter, setMuscleGroupFilter] = useState<MuscleGroupFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);

  if (activeTab === 'workoutplan') {
    return <div className="px-4 py-4 text-sm text-gray-700 dark:text-gray-200">Workout Plan</div>;
  }

  // --- Derived fitness template list ---
  // Build a set of library template IDs that already have a user copy.
  const clonedLibraryIds = new Set(
    Object.values(customTemplates)
      .filter((t) => t.sourceTemplateId != null)
      .map((t) => t.sourceTemplateId as string),
  );

  // Library templates that have NOT been added to custom yet.
  const libraryFitness: TaskTemplate[] = (taskTemplateLibrary as TaskTemplate[]).filter(
    (t) => t.secondaryTag === 'fitness' && !clonedLibraryIds.has(t.id ?? ''),
  );

  // User custom fitness templates (includes copies of library templates).
const customFitness: TaskTemplate[] = Object.entries(customTemplates)
  .filter(([, t]) => t.secondaryTag === 'fitness')
  .map(([key, t]) => ({ ...t, id: t.id ?? key })
);

  const allFitness: TaskTemplate[] = [...libraryFitness, ...customFitness];

  const filtered = allFitness
    .filter((t) => {
      const q = search.trim().toLowerCase();
      return q === '' || t.name.toLowerCase().includes(q);
    })
    .filter((t) => {
      if (muscleGroupFilter === 'all') return true;
      return t.muscleGroup === muscleGroupFilter;
    });

  // --- Energy bar values ---
  const energyCurrent = energy?.current ?? 0;
  const energyCap = energy?.cap ?? 0;
  const energyPct = energyCap > 0 ? Math.min(100, (energyCurrent / energyCap) * 100) : 0;

  const handleAddToMyList = (template: TaskTemplate) => {
    const alreadyAdded = Object.values(customTemplates).some(
      (t) => t.sourceTemplateId === template.id,
    );
    if (alreadyAdded) return;
    const newKey = uuidv4();
    setTaskTemplate(newKey, {
      ...template,
      isCustom: true,
      id: newKey,
      sourceTemplateId: template.id,
      name: template.name,
    });
  };

  const handleRowPress = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExecutingId(null);
    } else {
      setExpandedId(id);
      setExecutingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 px-4 py-4">

      {/* --- Energy bar --- */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs font-semibold text-gray-600 dark:text-gray-300">
          <span>Energy</span>
          <span>{energyCurrent} / {energyCap}</span>
        </div>
        <div className="w-full h-3 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className="h-full bg-green-400 rounded-full transition-all duration-300"
            style={{ width: `${energyPct}%` }}
          />
        </div>
      </div>

      {/* --- Search + filter row --- */}
      <div className="flex gap-2 items-center">
        <input
          className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-3 py-1.5 text-gray-800 dark:text-gray-100 outline-none focus:ring-1 focus:ring-blue-400"
          placeholder="Search exercises..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-2 py-1.5 text-gray-800 dark:text-gray-100 outline-none"
          value={muscleGroupFilter}
          onChange={(e) => setMuscleGroupFilter(e.target.value as MuscleGroupFilter)}
        >
          <option value="all">All</option>
          <option value="chest">Chest</option>
          <option value="back">Back</option>
          <option value="legs">Legs</option>
          <option value="shoulders">Shoulders</option>
          <option value="arms">Arms</option>
          <option value="core">Core</option>
          <option value="cardio">Cardio</option>
        </select>
        <button
          className="rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 text-sm font-bold"
          onClick={() => setFitnessPopup({ mode: 'add' })}
        >
          +
        </button>
      </div>

      {/* --- Template list --- */}
      <div className="flex flex-col gap-1">
        {filtered.map((template) => {
          const isExpanded = expandedId === template.id;
          const isExecuting = executingId === template.id;
          const rating = template.intensityRating ?? 0;

          const dots = Array.from({ length: 5 }, (_, i) =>
            i < rating ? '*' : 'o',
          ).join(' ');

          const muscleLabel = template.muscleGroup
            ? template.muscleGroup.charAt(0).toUpperCase() + template.muscleGroup.slice(1)
            : null;

          return (
            <div
key={template.id ?? template.name}
              className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              {/* Row */}
              <button
                className="w-full flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 text-left"
                onClick={() => handleRowPress(template.id ?? '')}
              >
                <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                  {template.name}
                </span>
                {template.items && template.items.length > 0 && (
                  <span className="flex items-center gap-0.5 shrink-0">
                    {template.items.map((ref) => {
                      const item = itemLibrary.find((i) => i.id === ref);
                      if (!item) return null;
                      return <IconDisplay key={`template-${template.id}-item-${ref}`} iconKey={item.icon} size={14} />;
                    })}
                  </span>
                )}
                {muscleLabel && (
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    {muscleLabel}
                  </span>
                )}
                <span className="shrink-0 text-xs font-mono text-gray-400 dark:text-gray-500 tracking-widest">
                  {dots}
                </span>
              </button>

              {/* Expanded */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-1 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 flex flex-col gap-2">
                  {isExecuting ? (
                    <WorkoutExecutionInput
inputFields={template.inputFields as SetsRepsInputFields | DurationInputFields}
                      task={{
                        id: `exec-${template.id}`,
                        templateRef: template.id ?? null,
                        completionState: 'pending',
                        resultFields: {},
                        attachmentRef: null,
                        resourceRef: null,
                        location: null,
                        sharedWith: null,
                        completedAt: null,
                        questRef: null,
actRef: null,
secondaryTag: null,
                      }}
                      onComplete={(result) => {
                        if (user) {
                          completeFavourite(
                            template.id ?? '',
                            user,
result as Partial<InputFields>,
                          );
                        }
                        setExecutingId(null);
                        setExpandedId(null);
                      }}
                    />
                  ) : (
                    <>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {template.description}
                      </p>
                      {template.durationEstimate != null && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Duration: {template.durationEstimate} min
                        </p>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {muscleLabel ?? 'General'} &middot; Intensity: {rating}/5
                      </p>
                      {template.items && template.items.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-gray-400 dark:text-gray-500">Equipment</span>
                          <div className="flex flex-wrap gap-2">
                            {template.items.map((ref) => {
                              const item = itemLibrary.find((i) => i.id === ref);
                              if (!item) return null;
                              return (
                                <div key={`${template.id ?? template.name}-eq-${ref}`} className="flex items-center gap-1">
                                  <IconDisplay iconKey={item.icon} size={16} />
                                  <span className="text-xs text-gray-600 dark:text-gray-300">{item.name}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2 mt-1">
                        {!template.isCustom ? (
                          <button
                            className="bg-blue-500 text-white rounded-lg px-3 py-1 text-sm"
                            onClick={() => handleAddToMyList(template)}
                          >
                            Add to My List
                          </button>
                        ) : (
                          <>
                            <button
                              className="bg-green-500 text-white rounded-lg px-3 py-1 text-sm"
                              onClick={() => setExecutingId(template.id ?? null)}
                            >
                              Execute
                            </button>
                            <button
                              className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg px-3 py-1 text-sm"
                              onClick={() => setFitnessPopup({ mode: 'config', key: template.id ?? '', template })}
                            >
                              Configure
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
            No exercises found.
          </p>
        )}
      </div>

      {fitnessPopup !== null && (
        <FitnessTaskPopup
          editKey={fitnessPopup.mode === 'config' ? fitnessPopup.key : null}
          editTemplate={fitnessPopup.mode === 'config' ? fitnessPopup.template : null}
          onClose={() => setFitnessPopup(null)}
        />
      )}
    </div>
  );
}
