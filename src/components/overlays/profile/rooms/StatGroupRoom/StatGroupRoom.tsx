import { useUserStore } from '../../../../../stores/useUserStore';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { StatGroupGrid } from './StatGroupGrid';
import { StatGroupBottomBar } from './StatGroupBottomBar';

interface StatGroupRoomProps {
  onTalentTree: () => void;
}

export function StatGroupRoom({ onTalentTree }: StatGroupRoomProps) {
  const stats = useUserStore((s) => s.user?.progression.stats);
  const historyEvents = useScheduleStore((s) => s.historyEvents);
  const tasks = useScheduleStore((s) => s.tasks);
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);

  const talents = stats?.talents;
  const talentPoints = useUserStore((s) => s.user?.progression.talentPoints ?? 0);

  if (!talents) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-gray-400 dark:text-gray-500">
        No stat data available.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden">
        <StatGroupGrid
          talents={talents}
          historyEvents={historyEvents}
          tasks={tasks}
          taskTemplates={taskTemplates}
        />
      </div>
      <StatGroupBottomBar talentPoints={talentPoints} onTalentTree={onTalentTree} />
    </div>
  );
}
