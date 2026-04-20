import { useScheduleStore } from '../../../stores/useScheduleStore';
import { ActionBar } from './ActionBar';
import { TaskList } from './TaskList';
import type { Event } from '../../../types';

interface EventTaskTableProps {
  event: Event;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  playMode: boolean;
  onTogglePlay: () => void;
}

export function EventTaskTable({
  event,
  selectedTaskId,
  onSelectTask,
  playMode,
  onTogglePlay,
}: EventTaskTableProps) {
  const tasks = useScheduleStore((s) => s.tasks);

  const taskCount = event.tasks.length;
  const completedCount = event.tasks.filter((id) => tasks[id]?.completionState === 'complete').length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Action bar */}
      <ActionBar
        event={event}
        eventId={event.id}
        playMode={playMode}
        onTogglePlay={onTogglePlay}
        taskCount={taskCount}
        completedCount={completedCount}
      />

      {/* Table header */}
      <div className="flex shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400">
        <span className="flex-1">Task</span>
        <span className="w-20 text-center">Type</span>
        <span className="w-16 text-right">State</span>
      </div>

      {/* Task list — vertical scroll */}
      <TaskList
        taskIds={event.tasks}
        selectedTaskId={selectedTaskId}
        onSelect={onSelectTask}
      />
    </div>
  );
}
