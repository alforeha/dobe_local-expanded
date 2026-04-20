// -----------------------------------------------------------------------------
// ROUTINE LIBRARY - PREBUILT ROUTINES
// Coach-seeded PlannedEvent templates for the Recommendations room.
// These are display-only blueprints - not stored PlannedEvents.
// When the user taps "Add to Schedule", RoutinePopup opens pre-filled.
// -----------------------------------------------------------------------------

import type { RecurrenceRule } from '../types/taskTemplate';

export type RoutineTag =
  | 'health'
  | 'morning'
  | 'mindfulness'
  | 'evening'
  | 'work'
  | 'fitness'
  | 'nutrition'
  | 'home'
  | 'admin'
  | 'wisdom';

export interface PrebuiltRoutine {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  startTime: string;
  endTime: string;
  isOvernight?: boolean;
  /** Task template IDs from TaskTemplateLibrary / StarterQuestLibrary */
  taskPool: string[];
  recurrenceInterval: RecurrenceRule;
  tags: RoutineTag[];
}

export const routineLibrary: PrebuiltRoutine[] = [
  {
    id: 'prebuilt-routine-morning-moves',
    name: 'Morning Moves',
    description: 'Kick off your day with hydration, a body check-in, and brushing your teeth.',
    icon: 'morning',
    color: '#f59e0b',
    startTime: '07:00',
    endTime: '07:30',
    taskPool: [
      'task-hlth-drink-water',
      'task-hlth-body-scan',
      'task-hlth-brush-teeth',
    ],
    recurrenceInterval: {
      frequency: 'daily',
      days: [],
      interval: 1,
      endsOn: null,
      customCondition: null,
    },
    tags: ['health', 'morning'],
  },
  {
    id: 'prebuilt-routine-evening-relax',
    name: 'Evening Relax',
    description: 'Wind down with meditation, journaling, and gratitude.',
    icon: 'night',
    color: '#8b5cf6',
    startTime: '20:00',
    endTime: '21:00',
    taskPool: [
      'task-wis-meditation-timer',
      'task-wis-journal-entry',
      'task-chr-give-gratitude',
    ],
    recurrenceInterval: {
      frequency: 'daily',
      days: [],
      interval: 1,
      endsOn: null,
      customCondition: null,
    },
    tags: ['mindfulness', 'evening'],
  },
  {
    id: 'prebuilt-routine-sleep-window',
    name: 'Sleep Window',
    description: 'Protect a consistent overnight sleep block.',
    icon: 'night',
    color: '#1e3a5f',
    startTime: '22:00',
    endTime: '07:00',
    isOvernight: true,
    taskPool: [
      'task-hlth-track-sleep',
    ],
    recurrenceInterval: {
      frequency: 'daily',
      days: [],
      interval: 1,
      endsOn: null,
      customCondition: null,
    },
    tags: ['health', 'evening'],
  },
  {
    id: 'prebuilt-routine-morning-workout',
    name: 'Morning Workout',
    description: 'Warm up, train, and cool down before the day starts.',
    icon: 'fitness',
    color: '#ef4444',
    startTime: '06:00',
    endTime: '07:00',
    taskPool: [
      'task-def-warm-up-session',
      'task-str-full-body-circuit',
      'task-def-cooldown-session',
    ],
    recurrenceInterval: {
      frequency: 'weekly',
      days: ['mon', 'wed', 'fri'],
      interval: 1,
      endsOn: null,
      customCondition: null,
    },
    tags: ['fitness', 'morning'],
  },
  {
    id: 'prebuilt-routine-work-block',
    name: 'Work Block',
    description: 'Clear admin clutter and settle into a focused work session.',
    icon: 'work',
    color: '#3b82f6',
    startTime: '09:00',
    endTime: '12:00',
    taskPool: [
      'task-agi-clear-inbox',
      'task-wis-study-session',
    ],
    recurrenceInterval: {
      frequency: 'weekly',
      days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      interval: 1,
      endsOn: null,
      customCondition: null,
    },
    tags: ['work', 'admin'],
  },
  {
    id: 'prebuilt-routine-meal-prep',
    name: 'Meal Prep',
    description: 'Cook intentionally and log what you made.',
    icon: 'nutrition',
    color: '#10b981',
    startTime: '17:00',
    endTime: '18:30',
    taskPool: [
      'task-str-cook-meal',
      'task-hlth-log-meal',
    ],
    recurrenceInterval: {
      frequency: 'weekly',
      days: ['sun'],
      interval: 1,
      endsOn: null,
      customCondition: null,
    },
    tags: ['nutrition', 'home'],
  },
  {
    id: 'prebuilt-routine-weekly-review',
    name: 'Weekly Review',
    description: 'Reset your inbox and reflect on the week in writing.',
    icon: 'wisdom',
    color: '#6366f1',
    startTime: '18:00',
    endTime: '19:00',
    taskPool: [
      'task-agi-clear-inbox',
      'task-wis-journal-entry',
    ],
    recurrenceInterval: {
      frequency: 'weekly',
      days: ['sun'],
      interval: 1,
      endsOn: null,
      customCondition: null,
    },
    tags: ['admin', 'wisdom'],
  },
];
