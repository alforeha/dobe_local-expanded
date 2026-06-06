import { useState } from 'react';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import type { PlannedEvent } from '../../../../../types';
import { isOneOffEvent } from '../../../../../utils/isOneOffEvent';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { FocusYardTab } from './FocusYardTab';
import { GastroHubTab } from './GastroHubTab';
import { PowerBayTab } from './PowerBayTab';
import { RoutinePopup } from './RoutinePopup';

type ScheduleSection = 'focusyard' | 'gastrohub' | 'powerbay';
type FocusYardSubTab = 'bearing' | 'workloads';
type GastroHubSubTab = 'foodcore' | 'cookbook' | 'mealplan';
type PowerBaySubTab = 'exercises' | 'workoutplan';
type PopupState =
  | { mode: 'add-routine' }
  | { mode: 'edit-routine'; routine: PlannedEvent }
  | null;

const SCHEDULE_SECTIONS: Array<{ tab: ScheduleSection; iconKey: string; label: string }> = [
  { tab: 'focusyard', iconKey: 'schedule-tab-focusyard', label: 'Focus Yard' },
  { tab: 'gastrohub', iconKey: 'schedule-tab-gastrohub', label: 'Gastro Hub' },
  { tab: 'powerbay', iconKey: 'schedule-tab-powerbay', label: 'Power Bay' },
];

const FOCUS_YARD_TABS: Array<{ tab: FocusYardSubTab; iconKey: string; label: string }> = [
  { tab: 'bearing', iconKey: 'schedule-tab-bearing', label: 'Bearing Adjustments' },
  { tab: 'workloads', iconKey: 'schedule-tab-workloads', label: 'Work Loads' },
];

const GASTRO_HUB_TABS: Array<{ tab: GastroHubSubTab; iconKey: string; label: string }> = [
  { tab: 'foodcore', iconKey: 'schedule-tab-foodcore', label: 'Food Core' },
  { tab: 'cookbook', iconKey: 'schedule-tab-cookbook', label: 'Cook Book' },
  { tab: 'mealplan', iconKey: 'schedule-tab-mealplan', label: 'Meal Plan' },
];

const POWER_BAY_TABS: Array<{ tab: PowerBaySubTab; iconKey: string; label: string }> = [
  { tab: 'exercises', iconKey: 'schedule-tab-exercises', label: 'Exercises' },
  { tab: 'workoutplan', iconKey: 'schedule-tab-workoutplan', label: 'Workout Plan' },
];

const TAB_BUTTON_CLASS = 'flex h-7 w-8 items-center justify-center rounded-full transition-colors';

function renderNavButton(
  tab: string,
  iconKey: string,
  label: string,
  isActive: boolean,
  onClick: () => void,
) {
  return (
    <button
      key={tab}
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`${TAB_BUTTON_CLASS} ${
        isActive
          ? 'bg-blue-500 text-white'
          : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      <IconDisplay iconKey={iconKey} size={18} className="leading-none" />
    </button>
  );
}

export function ScheduleTabContent() {
  const [activeSection, setActiveSection] = useState<ScheduleSection>('focusyard');
  const [focusYardTab, setFocusYardTab] = useState<FocusYardSubTab>('bearing');
  const [gastroHubTab, setGastroHubTab] = useState<GastroHubSubTab>('foodcore');
  const [powerBayTab, setPowerBayTab] = useState<PowerBaySubTab>('exercises');
  const [routineFilter, setRoutineFilter] = useState('');
  const [popup, setPopup] = useState<PopupState>(null);
  const plannedEvents = useScheduleStore((s) => s.plannedEvents);
  const removePlannedEvent = useScheduleStore((s) => s.removePlannedEvent);

  const allRoutines = Object.values(plannedEvents).filter((event) => !isOneOffEvent(event));
  const filteredRoutines = routineFilter
    ? allRoutines.filter((event) => event.name.toLowerCase().includes(routineFilter.toLowerCase()))
    : allRoutines;

  let topNav: React.ReactNode = null;
  let content: React.ReactNode = null;

  function handleEdit(event: PlannedEvent) {
    setPopup({ mode: 'edit-routine', routine: event });
  }

  function handleDelete(event: PlannedEvent) {
    removePlannedEvent(event.id);
  }

  if (activeSection === 'focusyard') {
    topNav = FOCUS_YARD_TABS.map(({ tab, iconKey, label }) => (
      renderNavButton(tab, iconKey, label, focusYardTab === tab, () => setFocusYardTab(tab))
    ));
    content = (
      <FocusYardTab
        activeTab={focusYardTab}
        filteredRoutines={filteredRoutines}
        routineFilter={routineFilter}
        onRoutineFilterChange={setRoutineFilter}
        onAddRoutine={() => setPopup({ mode: 'add-routine' })}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    );
  } else if (activeSection === 'gastrohub') {
    topNav = GASTRO_HUB_TABS.map(({ tab, iconKey, label }) => (
      renderNavButton(tab, iconKey, label, gastroHubTab === tab, () => setGastroHubTab(tab))
    ));
    content = <GastroHubTab activeTab={gastroHubTab} />;
  } else {
    topNav = POWER_BAY_TABS.map(({ tab, iconKey, label }) => (
      renderNavButton(tab, iconKey, label, powerBayTab === tab, () => setPowerBayTab(tab))
    ));
    content = <PowerBayTab activeTab={powerBayTab} />;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2 py-2">
          {topNav}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {content}
      </div>

      <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-2">
        <div className="flex items-center gap-2">
          {SCHEDULE_SECTIONS.map(({ tab, iconKey, label }) => (
            renderNavButton(tab, iconKey, label, activeSection === tab, () => setActiveSection(tab))
          ))}
        </div>
      </div>

      {(popup?.mode === 'add-routine' || popup?.mode === 'edit-routine') && (
        <RoutinePopup
          editRoutine={popup.mode === 'edit-routine' ? popup.routine : null}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}