import { useState } from 'react';
import { useUserStore } from '../../../../../stores/useUserStore';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';

const MUSCLE_GROUPS = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio', 'flexibility'] as const;
type MuscleGroupKey = typeof MUSCLE_GROUPS[number];

const MUSCLE_LABELS: Record<MuscleGroupKey, string> = {
  chest: 'CHT',
  back: 'BCK',
  legs: 'LEG',
  shoulders: 'SHL',
  arms: 'ARM',
  core: 'COR',
  cardio: 'CRD',
  flexibility: 'FLX',
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export interface WorkoutPlanTabProps {
  onExpandedChange?: (isExpanded: boolean) => void;
}

export function WorkoutPlanTab({ onExpandedChange: _onExpandedChange }: WorkoutPlanTabProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<MuscleGroupKey | null>(null);

  const user = useUserStore((s) => s.user);
  const plannedEvents = useScheduleStore((s) => s.plannedEvents);

  const muscleGroupVolume: Record<string, number> =
    user?.progression.stats.physicalStats?.muscleGroupVolume ?? {};

  const workoutRoutines = Object.values(plannedEvents).filter((e) =>
    e.category?.startsWith('workout-'),
  );

  const routinesForGroup = (group: MuscleGroupKey) =>
    workoutRoutines.filter((e) => e.category === 'workout-' + group);

  return (
    <div className="flex flex-row h-full relative">
      {/* LEFT STRIP */}
      <div
        className={`${panelOpen ? 'w-48' : 'w-10'} transition-all duration-200 shrink-0 border-r border-gray-100 dark:border-gray-700 flex flex-col overflow-hidden`}
      >
        {!panelOpen ? (
          /* COLLAPSED STRIP */
          <button
            className="flex-1 flex flex-col items-center justify-start gap-1 py-2 w-full"
            onClick={() => setPanelOpen(true)}
          >
            {MUSCLE_GROUPS.map((group) => (
              <div key={group} className="flex flex-col items-center py-1">
                <span className="text-xs font-bold text-gray-600 dark:text-gray-300 leading-none">
                  {MUSCLE_LABELS[group]}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500 leading-none">
                  {muscleGroupVolume[group] ?? 0}
                </span>
              </div>
            ))}
          </button>
        ) : (
          /* EXPANDED PANEL */
          <div className="flex flex-col flex-1 overflow-y-auto">
            {/* Close button */}
            <div className="flex justify-end px-2 py-1">
              <button
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
                onClick={() => {
                  setPanelOpen(false);
                  setExpandedGroup(null);
                }}
              >
                x
              </button>
            </div>

            {/* Muscle group rows */}
            {MUSCLE_GROUPS.map((group) => {
              const routines = routinesForGroup(group);
              const isOpen = expandedGroup === group;
              return (
                <div key={group} className="flex flex-col border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <button
                      className="flex-1 flex items-center justify-between text-left"
                      onClick={() => setExpandedGroup(isOpen ? null : group)}
                    >
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 capitalize">
                        {group}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
                        {muscleGroupVolume[group] ?? 0}
                      </span>
                    </button>
                    <button
                      className="ml-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 shrink-0"
                      onClick={() => console.log('add workout', group)}
                    >
                      +
                    </button>
                  </div>

                  {isOpen && (
                    <div className="flex flex-col pl-3 pb-1 gap-0.5">
                      {routines.length === 0 ? (
                        <span className="text-xs text-gray-400 dark:text-gray-500">None yet</span>
                      ) : (
                        routines.map((r) => (
                          <span
                            key={r.id}
                            className="text-xs text-gray-600 dark:text-gray-300 truncate"
                          >
                            {r.name}
                          </span>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 overflow-y-auto">
        {/* Warmup slot */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 px-3 py-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Warmup</span>
          <button
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
            onClick={() => console.log('assign warmup')}
          >
            +
          </button>
        </div>

        {/* Day slots */}
        {DAYS.map((day) => (
          <div
            key={day}
            className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 px-3 py-2"
          >
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200 w-10 shrink-0">
              {day}
            </span>
            <span className="flex-1 text-xs text-gray-400 dark:text-gray-500 pl-2">
              Rest day
            </span>
            <button
              className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 shrink-0"
              onClick={() => console.log('assign workout', day)}
            >
              +
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
