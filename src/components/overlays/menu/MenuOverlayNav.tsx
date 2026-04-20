import { GlowRing } from '../../shared/GlowRing';
import { ONBOARDING_GLOW } from '../../../constants/onboardingKeys';
import { useGlows } from '../../../hooks/useOnboardingGlow';
import menuWorldViewSrc from '../../../assets/icons/menu-worldView.svg';
import menuGoalsSrc from '../../../assets/icons/menu-goals.svg';
import menuTasksSrc from '../../../assets/icons/menu-tasks.svg';
import menuScheduleSrc from '../../../assets/icons/menu-schedule.svg';
import menuResourcesSrc from '../../../assets/icons/menu-resources.svg';
import menuQuickActionSrc from '../../../assets/icons/menu-quickAction.svg';
import menuButtonSrc from '../../../assets/icons/menu-button.svg';

type MenuRoom = 'world' | 'goal' | 'task' | 'schedule' | 'resource' | 'quickaction';

const NAV_ITEMS: { room: MenuRoom; label: string; iconSrc: string }[] = [
  { room: 'world', label: 'World', iconSrc: menuWorldViewSrc },
  { room: 'goal', label: 'Goals', iconSrc: menuGoalsSrc },
  { room: 'task', label: 'Tasks', iconSrc: menuTasksSrc },
  { room: 'schedule', label: 'Schedule', iconSrc: menuScheduleSrc },
  { room: 'resource', label: 'Resource', iconSrc: menuResourcesSrc },
  { room: 'quickaction', label: 'Quick Action', iconSrc: menuQuickActionSrc },
];

interface MenuOverlayNavProps {
  activeRoom: MenuRoom;
  onNavigate: (room: MenuRoom) => void;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function MenuOverlayNav({
  activeRoom,
  onNavigate,
  onClose,
  collapsed,
  onToggleCollapse,
}: MenuOverlayNavProps) {
  const goalRoomGlows = useGlows(ONBOARDING_GLOW.ADVENTURES_TAB);
  const taskRoomGlows = useGlows(ONBOARDING_GLOW.TASK_ROOM_NAV);
  const scheduleRoomGlows = useGlows(ONBOARDING_GLOW.SCHEDULE_ROOM_NAV);
  const resourceRoomGlows = useGlows(ONBOARDING_GLOW.RESOURCES_ROOM_NAV);

  return (
    <div
      className={`flex flex-col bg-gray-900 transition-all duration-200 shrink-0 ${
        collapsed ? 'w-14' : 'w-24'
      }`}
    >
      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex items-center justify-center h-12 text-gray-400 hover:text-white border-b border-gray-700 shrink-0"
        aria-label={collapsed ? 'Expand nav' : 'Collapse nav'}
      >
        <span className="text-sm">{collapsed ? '>' : '<'}</span>
      </button>

      <div className="flex-1 overflow-y-auto py-2">
        {NAV_ITEMS.map(({ room, label, iconSrc }) => (
          <GlowRing
            key={room}
            active={
              (room === 'goal' && goalRoomGlows) ||
              (room === 'task' && taskRoomGlows) ||
              (room === 'schedule' && scheduleRoomGlows) ||
              (room === 'resource' && resourceRoomGlows)
            }
            rounded="lg"
            className="block"
          >
            <button
              type="button"
              onClick={() => onNavigate(room)}
              aria-label={label}
              title={label}
              className={`w-full flex items-center justify-center px-3 transition-colors ${
                collapsed ? 'py-3' : 'py-4'
              } hover:bg-gray-800 ${
                activeRoom === room ? 'bg-gray-800 text-white' : 'text-gray-400'
              }`}
            >
              <img
                src={iconSrc}
                alt=""
                aria-hidden="true"
                className={`${collapsed ? 'h-5 w-5' : 'h-10 w-10'} shrink-0 object-contain transition-all duration-200`}
              />
            </button>
          </GlowRing>
        ))}
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Exit menu"
        title="Exit Menu"
        className={`flex items-center justify-center px-3 border-t border-gray-700 text-red-400 hover:text-red-300 hover:bg-gray-800 transition-colors shrink-0 ${
          collapsed ? 'py-3' : 'py-4'
        }`}
      >
        <img
          src={menuButtonSrc}
          alt=""
          aria-hidden="true"
          className={`${collapsed ? 'h-5 w-5' : 'h-10 w-10'} shrink-0 object-contain transition-all duration-200`}
        />
      </button>
    </div>
  );
}
