export const ONBOARDING_GLOW = {
  WELCOME_EVENT_CARD: 'welcome-event-card',
  COACH_BUTTON: 'coach-button',
  RECOMMENDATIONS_NAV: 'recommendations-nav',
  RECOMMENDATIONS_TASKS: 'recommendations-tasks',
  RECOMMENDATIONS_ROUTINES: 'recommendations-routines',
  WEEK_VIEW_NAV: 'week-view-nav',
  MONTH_VIEW_NAV: 'month-view-nav',
  MENU_BUTTON: 'menu-button',
  TASK_ROOM_NAV: 'task-room-nav',
  TASK_FAVOURITE_STAR: 'task-favourite-star',
  FAVOURITE_ACTION: 'favourite-action',
  SCHEDULE_ROOM_NAV: 'schedule-room-nav',
  RESOURCES_ROOM_NAV: 'resources-room-nav',
  LUCKY_DICE: 'lucky-dice',
  GTD_ITEM: 'gtd-item',
  PROFILE_BUTTON: 'profile-button',
  BADGE_ROOM_NAV: 'badge-room-nav',
  EQUIPMENT_ROOM_NAV: 'equipment-room-nav',
  ADVENTURES_TAB: 'adventures-tab',
} as const;

export type OnboardingGlowKey =
  typeof ONBOARDING_GLOW[keyof typeof ONBOARDING_GLOW];
