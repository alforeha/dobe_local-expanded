import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useUserStore } from '../../../../../stores/useUserStore';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { taskTemplateLibrary } from '../../../../../coach';
import { WorkoutExecutionInput } from '../../../event/inputs/WorkoutExecutionInput';
import { completeFavourite } from '../../../../../engine/listsEngine';
import { MUSCLE_GROUPS, normalizeTemplateMuscleGroups } from '../../../../../types';
import type {
  DurationInputFields,
  InputFields,
  MuscleGroup,
  SetsRepsInputFields,
  TaskTemplate,
  Weekday,
} from '../../../../../types';
import type { PlannedEvent } from '../../../../../types/plannedEvent';
import { itemLibrary } from '../../../../../coach/ItemLibrary';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { HabitatShell } from '../../../../shared/habitat/HabitatShell';
import { HabitatSidePanel, type HabitatSidePanelSection } from '../../../../shared/habitat/HabitatSidePanel';
import { HabitatTopBar } from '../../../../shared/habitat/HabitatTopBar';
import { WeeklyPlanView } from '../../../../shared/habitat/WeeklyPlanView';
import { WEEK_DAYS } from '../../../../shared/habitat/weeklyPlanDays';
import { FitnessTaskPopup } from './FitnessTaskPopup';
import { WARMUP_CATEGORY, WorkoutPlanPopup } from './WorkoutPlanPopup';
import { RoutinePopup } from './RoutinePopup';

const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'CHT',
  back: 'BCK',
  legs: 'LEG',
  shoulders: 'SHL',
  arms: 'ARM',
  core: 'COR',
  cardio: 'CRD',
  flexibility: 'FLX',
};

type MuscleGroupFilter = 'all' | MuscleGroup;

type PowerBayTabValue = 'exercises' | 'workoutplan';

interface PowerBayTabProps {
  activeTab: PowerBayTabValue;
  onExpandedChange?: (isExpanded: boolean) => void;
}

type FitnessPopupState =
  | { mode: 'add' }
  | { mode: 'config'; key: string; template: TaskTemplate }
  | null;

type PlanPopupState =
  | { group?: MuscleGroup; day?: Weekday; warmup?: boolean }
  | null;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** True when the routine shows on the given weekday in the weekly grid. */
function occursOnDay(routine: PlannedEvent, day: Weekday): boolean {
  const rule = routine.recurrenceInterval;
  if (rule.frequency === 'daily') return true;
  if (rule.frequency === 'weekly') return rule.days.length === 0 || rule.days.includes(day);
  return false;
}

export function PowerBayTab({ activeTab, onExpandedChange }: PowerBayTabProps) {
  const user = useUserStore((s) => s.user);
  const customTemplates = useScheduleStore((s) => s.taskTemplates);
  const setTaskTemplate = useScheduleStore((s) => s.setTaskTemplate);
  const plannedEvents = useScheduleStore((s) => s.plannedEvents);
  const energy = user?.progression.stats.energy;
  const muscleGroupVolume: Record<string, number> =
    user?.progression.stats.physicalStats?.muscleGroupVolume ?? {};

  const [fitnessPopup, setFitnessPopup] = useState<FitnessPopupState>(null);
  const [planPopup, setPlanPopup] = useState<PlanPopupState>(null);
  const [editRoutine, setEditRoutine] = useState<PlannedEvent | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [muscleGroupFilter, setMuscleGroupFilter] = useState<MuscleGroupFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);

  useEffect(() => {
    onExpandedChange?.(expandedId !== null);
  }, [expandedId, onExpandedChange]);

  // --- Workout routines (weekly plan + side panel summary) ---
  const workoutRoutines = Object.values(plannedEvents).filter((e) =>
    e.category?.startsWith('workout-'),
  );
  const warmupRoutines = workoutRoutines.filter((e) => e.category === WARMUP_CATEGORY);
  const routinesForGroup = (group: MuscleGroup) =>
    workoutRoutines.filter((e) => e.category === `workout-${group}`);

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
    .map(([key, t]) => ({ ...t, id: t.id ?? key }));

  const allFitness: TaskTemplate[] = [...libraryFitness, ...customFitness];

  const filtered = allFitness
    .filter((t) => {
      const q = search.trim().toLowerCase();
      return q === '' || t.name.toLowerCase().includes(q);
    })
    .filter((t) => {
      if (muscleGroupFilter === 'all') return true;
      return normalizeTemplateMuscleGroups(t).includes(muscleGroupFilter);
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

  // --- Side panel: energy + workout stats + plan summary ---
  const sidePanelSections: HabitatSidePanelSection[] = [
    {
      key: 'energy',
      label: 'Energy',
      shortLabel: 'NRG',
      value: `${energyCurrent}/${energyCap}`,
    },
    ...MUSCLE_GROUPS.map((group): HabitatSidePanelSection => ({
      key: group,
      label: group,
      shortLabel: MUSCLE_LABELS[group],
      value: muscleGroupVolume[group] ?? 0,
      rows: routinesForGroup(group).map((routine) => (
        <button
          key={routine.id}
          type="button"
          className="truncate text-left text-xs text-gray-600 hover:text-accent dark:text-gray-300"
          onClick={() => setEditRoutine(routine)}
        >
          {routine.name}
        </button>
      )),
      onAdd: () => setPlanPopup({ group }),
    })),
  ];

  const sidePanel = (
    <HabitatSidePanel
      sections={sidePanelSections}
      open={panelOpen}
      onOpenChange={setPanelOpen}
      emptyRowsLabel="None yet"
      topContent={
        <div className="flex flex-col gap-1 px-2 pb-2">
          <div className="flex justify-between text-xs font-semibold text-gray-600 dark:text-gray-300">
            <span>Energy</span>
            <span>
              {energyCurrent} / {energyCap}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${energyPct}%` }}
            />
          </div>
        </div>
      }
    />
  );

  // --- Weekly plan content ---
  const routineChip = (routine: PlannedEvent) => {
    const group = routine.category?.replace('workout-', '') ?? '';
    return (
      <button
        key={routine.id}
        type="button"
        className="flex items-center gap-1 rounded-full border border-accent-border bg-accent-bg px-2 py-0.5 text-xs text-accent"
        onClick={() => setEditRoutine(routine)}
      >
        <span className="truncate">{routine.name}</span>
        {group && group !== 'warmup' && (
          <span className="uppercase tracking-wider opacity-70">{group.slice(0, 3)}</span>
        )}
      </button>
    );
  };

  const planContentByDay: Partial<Record<Weekday, ReactNode>> = {};
  for (const { key } of WEEK_DAYS) {
    const dayRoutines = workoutRoutines.filter(
      (r) => r.category !== WARMUP_CATEGORY && occursOnDay(r, key),
    );
    if (dayRoutines.length > 0) {
      planContentByDay[key] = dayRoutines.map((r) => routineChip(r));
    }
  }

  // --- Body content per sub-tab ---
  const exercisesBody = (
    <div className="flex flex-col gap-3 overflow-y-auto px-4 py-3">
      {/* --- Template list --- */}
      <div className="flex flex-col gap-1">
        {filtered.map((template) => {
          if (expandedId !== null && expandedId !== template.id) return null;
          const isExpanded = expandedId === template.id;
          const isExecuting = executingId === template.id;
          const rating = template.intensityRating ?? 0;

          const dots = Array.from({ length: 5 }, (_, i) => (i < rating ? '*' : 'o')).join(' ');

          const muscleGroups = normalizeTemplateMuscleGroups(template);
          const muscleLabel =
            muscleGroups.length > 0 ? muscleGroups.map(capitalize).join(' · ') : null;

          return (
            <div
              key={template.id ?? template.name}
              className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700"
            >
              {/* Row */}
              <button
                className="flex w-full items-center gap-2 bg-white px-3 py-2 text-left dark:bg-gray-800"
                onClick={() => handleRowPress(template.id ?? '')}
              >
                <span className="flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                  {template.name}
                </span>
                {template.items && template.items.length > 0 && (
                  <span className="flex shrink-0 items-center gap-0.5">
                    {template.items.map((ref) => {
                      const item = itemLibrary.find((i) => i.id === ref);
                      if (!item) return null;
                      return (
                        <IconDisplay
                          key={`template-${template.id}-item-${ref}`}
                          iconKey={item.icon}
                          size={14}
                        />
                      );
                    })}
                  </span>
                )}
                {muscleLabel && (
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    {muscleLabel}
                  </span>
                )}
                <span className="shrink-0 font-mono text-xs tracking-widest text-gray-400 dark:text-gray-500">
                  {dots}
                </span>
              </button>

              {/* Expanded */}
              {isExpanded && (
                <div className="flex flex-col gap-2 border-t border-gray-100 bg-white px-3 pb-3 pt-1 dark:border-gray-700 dark:bg-gray-800">
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
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            Equipment
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {template.items.map((ref) => {
                              const item = itemLibrary.find((i) => i.id === ref);
                              if (!item) return null;
                              return (
                                <div
                                  key={`${template.id ?? template.name}-eq-${ref}`}
                                  className="flex items-center gap-1"
                                >
                                  <IconDisplay iconKey={item.icon} size={16} />
                                  <span className="text-xs text-gray-600 dark:text-gray-300">
                                    {item.name}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div className="mt-1 flex gap-2">
                        {!template.isCustom ? (
                          <button
                            className="rounded-lg bg-accent px-3 py-1 text-sm text-white"
                            onClick={() => handleAddToMyList(template)}
                          >
                            Add to My List
                          </button>
                        ) : (
                          <>
                            <button
                              className="rounded-lg bg-accent px-3 py-1 text-sm text-white"
                              onClick={() => setExecutingId(template.id ?? null)}
                            >
                              Execute
                            </button>
                            <button
                              className="rounded-lg bg-gray-100 px-3 py-1 text-sm text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                              onClick={() =>
                                setFitnessPopup({ mode: 'config', key: template.id ?? '', template })
                              }
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
          <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
            No exercises found.
          </p>
        )}
      </div>
    </div>
  );

  const workoutPlanBody = (
    <WeeklyPlanView
      contentByDay={planContentByDay}
      emptyDayLabel="Rest day"
      onAddToDay={(day) => setPlanPopup({ day })}
      addActionLabel="Assign workout"
      leadingSlots={[
        {
          key: 'warmup',
          label: 'Warmup',
          content: warmupRoutines.length > 0 ? warmupRoutines.map((r) => routineChip(r)) : undefined,
          emptyLabel: 'No warmup',
          onAdd: () => setPlanPopup({ warmup: true }),
        },
      ]}
    />
  );

  const topBar =
    activeTab === 'exercises' && !expandedId ? (
      <HabitatTopBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search exercises..."
        onCreateCustom={() => setFitnessPopup({ mode: 'add' })}
      >
        <div className="flex justify-end pt-2">
          <select
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 outline-none focus:border-accent focus:ring-1 focus:ring-accent dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            value={muscleGroupFilter}
            onChange={(e) => setMuscleGroupFilter(e.target.value as MuscleGroupFilter)}
          >
            <option value="all">All</option>
            {MUSCLE_GROUPS.map((group) => (
              <option key={group} value={group}>
                {capitalize(group)}
              </option>
            ))}
          </select>
        </div>
      </HabitatTopBar>
    ) : undefined;

  return (
    <HabitatShell sidePanel={sidePanel} topBar={topBar}>
      {activeTab === 'exercises' ? exercisesBody : workoutPlanBody}

      {fitnessPopup !== null && (
        <FitnessTaskPopup
          editKey={fitnessPopup.mode === 'config' ? fitnessPopup.key : null}
          editTemplate={fitnessPopup.mode === 'config' ? fitnessPopup.template : null}
          onClose={() => setFitnessPopup(null)}
        />
      )}

      {planPopup !== null && (
        <WorkoutPlanPopup
          initialGroup={planPopup.group}
          initialDay={planPopup.day}
          warmup={planPopup.warmup}
          onClose={() => setPlanPopup(null)}
        />
      )}

      {editRoutine !== null && (
        <RoutinePopup editRoutine={editRoutine} onClose={() => setEditRoutine(null)} />
      )}
    </HabitatShell>
  );
}
