// ─────────────────────────────────────────
// Meal Plan — Gastro Hub (A4).
// Consumes the shared WeeklyPlanView (content-agnostic Mon–Sun grid): per-day
// slots carry planned meals, onAddToDay wires meal assignment. Side panel
// carries the weekly nutrition summary against the FDA daily targets.
// ─────────────────────────────────────────

import { useMemo, useState, type ReactNode } from 'react';
import { useScheduleStore } from '../../../../../../stores/useScheduleStore';
import { taskTemplateLibrary } from '../../../../../../coach';
import type { TaskTemplate, Weekday } from '../../../../../../types';
import type { PlannedEvent } from '../../../../../../types/plannedEvent';
import type { NutrientId } from '../../../../../../types/mealLog';
import {
  NUTRIENT_TARGETS,
  normalizeNutrientRecord,
  sumNutrientRecords,
} from '../../../../../../types/mealLog';
import { RadarChart } from '../../../../../shared/charts/RadarChart';
import { HabitatShell } from '../../../../../shared/habitat/HabitatShell';
import {
  HabitatSidePanel,
  type HabitatSidePanelSection,
} from '../../../../../shared/habitat/HabitatSidePanel';
import { WeeklyPlanView } from '../../../../../shared/habitat/WeeklyPlanView';
import { WEEK_DAYS } from '../../../../../shared/habitat/weeklyPlanDays';
import { RoutinePopup } from '../RoutinePopup';
import { MealPlanPopup, MEAL_PLAN_CATEGORY } from './MealPlanPopup';
import {
  NUTRIENT_SHORT_LABELS,
  buildNutrientAxes,
  formatNutrientVsTarget,
} from './gastroNutrition';

/** True when the meal routine shows on the given weekday in the weekly grid. */
function occursOnDay(routine: PlannedEvent, day: Weekday): boolean {
  const rule = routine.recurrenceInterval;
  if (rule.frequency === 'daily') return true;
  if (rule.frequency === 'weekly') return rule.days.length === 0 || rule.days.includes(day);
  return false;
}

export function MealPlanView() {
  const plannedEvents = useScheduleStore((s) => s.plannedEvents);
  const customTemplates = useScheduleStore((s) => s.taskTemplates);

  const [panelOpen, setPanelOpen] = useState(false);
  const [planPopupDay, setPlanPopupDay] = useState<Weekday | null>(null);
  const [planPopupOpen, setPlanPopupOpen] = useState(false);
  const [editRoutine, setEditRoutine] = useState<PlannedEvent | null>(null);

  const mealRoutines = Object.values(plannedEvents).filter(
    (event) => event.category === MEAL_PLAN_CATEGORY,
  );

  // ── Template resolution (custom templates win over library) ────────────────
  const templateById = useMemo(() => {
    const map = new Map<string, TaskTemplate>();
    for (const template of taskTemplateLibrary as TaskTemplate[]) {
      if (template.id) map.set(template.id, template);
    }
    for (const [key, template] of Object.entries(customTemplates)) {
      map.set(template.id ?? key, template);
      map.set(key, template);
    }
    return map;
  }, [customTemplates]);

  // ── Weekly nutrition summary against daily targets ──────────────────────────
  const { perDayCounts, avgDailyNutrients } = useMemo(() => {
    /** Sum of planned recipe nutrition for one routine occurrence. */
    const nutrientsForRoutine = (
      routine: PlannedEvent,
    ): Partial<Record<NutrientId, number>> => {
      const records: Array<Partial<Record<NutrientId, number>>> = [];
      for (const pool of routine.pools) {
        for (const entry of pool.entries) {
          if (entry.kind !== 'template') continue;
          const template = templateById.get(entry.templateRef);
          if (template?.nutritionalValue) {
            records.push(normalizeNutrientRecord(template.nutritionalValue));
          }
        }
      }
      return sumNutrientRecords(records);
    };

    const counts: Partial<Record<Weekday, PlannedEvent[]>> = {};
    const dayRecords: Array<Partial<Record<NutrientId, number>>> = [];

    for (const { key } of WEEK_DAYS) {
      const dayRoutines = mealRoutines.filter((routine) => occursOnDay(routine, key));
      counts[key] = dayRoutines;
      for (const routine of dayRoutines) {
        dayRecords.push(nutrientsForRoutine(routine));
      }
    }

    const weekTotal = sumNutrientRecords(dayRecords);
    const avg: Partial<Record<NutrientId, number>> = {};
    for (const [id, value] of Object.entries(weekTotal) as Array<[NutrientId, number]>) {
      avg[id] = value / 7;
    }
    return { perDayCounts: counts, avgDailyNutrients: avg };
  }, [mealRoutines, templateById]);

  // ── Side panel ──────────────────────────────────────────────────────────────
  const nutrientRows = NUTRIENT_TARGETS.filter(
    (target) => (avgDailyNutrients[target.id] ?? 0) > 0,
  ).map((target) => (
    <span key={target.id} className="truncate text-xs text-gray-600 dark:text-gray-300">
      {NUTRIENT_SHORT_LABELS[target.id]}:{' '}
      {formatNutrientVsTarget(target.id, avgDailyNutrients[target.id] ?? 0)}
    </span>
  ));

  const sidePanelSections: HabitatSidePanelSection[] = [
    {
      key: 'daily-avg',
      label: 'Daily Avg',
      shortLabel: 'AVG',
      value: nutrientRows.length > 0 ? `${nutrientRows.length}` : '0',
      rows: nutrientRows,
    },
    ...WEEK_DAYS.map(({ key, label }): HabitatSidePanelSection => {
      const dayRoutines = perDayCounts[key] ?? [];
      return {
        key: `day-${key}`,
        label,
        shortLabel: label.toUpperCase(),
        value: dayRoutines.length,
        rows: dayRoutines.map((routine) => (
          <button
            key={routine.id}
            type="button"
            className="truncate text-left text-xs text-gray-600 hover:text-accent dark:text-gray-300"
            onClick={() => setEditRoutine(routine)}
          >
            {routine.name}
          </button>
        )),
        onAdd: () => {
          setPlanPopupDay(key);
          setPlanPopupOpen(true);
        },
      };
    }),
  ];

  const sidePanel = (
    <HabitatSidePanel
      sections={sidePanelSections}
      open={panelOpen}
      onOpenChange={setPanelOpen}
      emptyRowsLabel="Nothing planned"
      topContent={
        <div className="flex flex-col items-center gap-1 px-2 pb-2">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
            Planned daily avg vs targets
          </span>
          <RadarChart
            axes={buildNutrientAxes(avgDailyNutrients)}
            size={168}
            title="Planned average daily nutrition against FDA daily targets"
          />
        </div>
      }
    />
  );

  // ── Weekly plan body ────────────────────────────────────────────────────────
  const mealChip = (routine: PlannedEvent) => (
    <button
      key={routine.id}
      type="button"
      className="flex items-center gap-1 rounded-full border border-accent-border bg-accent-bg px-2 py-0.5 text-xs text-accent"
      onClick={() => setEditRoutine(routine)}
    >
      <span className="truncate">{routine.name}</span>
      <span className="uppercase tracking-wider opacity-70">{routine.startTime}</span>
    </button>
  );

  const contentByDay: Partial<Record<Weekday, ReactNode>> = {};
  for (const { key } of WEEK_DAYS) {
    const dayRoutines = perDayCounts[key] ?? [];
    if (dayRoutines.length > 0) {
      contentByDay[key] = dayRoutines.map((routine) => mealChip(routine));
    }
  }

  return (
    <HabitatShell sidePanel={sidePanel}>
      <WeeklyPlanView
        contentByDay={contentByDay}
        emptyDayLabel="No meals planned"
        onAddToDay={(day) => {
          setPlanPopupDay(day);
          setPlanPopupOpen(true);
        }}
        addActionLabel="Assign meal"
      />

      {planPopupOpen && (
        <MealPlanPopup
          initialDay={planPopupDay ?? undefined}
          onClose={() => {
            setPlanPopupOpen(false);
            setPlanPopupDay(null);
          }}
        />
      )}

      {editRoutine !== null && (
        <RoutinePopup editRoutine={editRoutine} onClose={() => setEditRoutine(null)} />
      )}
    </HabitatShell>
  );
}
