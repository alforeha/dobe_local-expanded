import { useState } from 'react';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { ActionBar } from './ActionBar';
import { TaskList } from './TaskList';
import type { Event } from '../../../types';
import type { ActionBarSection } from './ActionBar';

interface EventTaskTableProps {
  event: Event;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
}

export function EventTaskTable({
  event,
  selectedTaskId,
  onSelectTask,
}: EventTaskTableProps) {
  const tasks = useScheduleStore((s) => s.tasks);
  const [activeSection, setActiveSection] = useState<ActionBarSection>('actions');

  const taskCount = event.tasks.length;
  const completedCount = event.tasks.filter((id) => tasks[id]?.completionState === 'complete').length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ActionBar
        eventId={event.id}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        onEnterEdit={() => undefined}
      />

      {activeSection === 'actions' && (
        <>
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            <span>Task</span>
            <span>{completedCount}/{taskCount} tasks</span>
          </div>

          <TaskList
            taskIds={event.tasks}
            selectedTaskId={selectedTaskId}
            onSelect={onSelectTask}
          />
        </>
      )}

      {activeSection === 'participants' && (
        <div className="flex flex-1 items-center justify-center px-3 text-sm text-gray-500 dark:text-gray-400">
          Participants - coming in LE-09b
        </div>
      )}

      {activeSection === 'location' && (
        <div className="flex flex-1 items-center justify-center px-3 text-sm text-gray-500 dark:text-gray-400">
          Location - coming in LE-09b
        </div>
      )}

      {activeSection === 'attachments' && (
        <div className="flex flex-1 items-center justify-center px-3 text-sm text-gray-500 dark:text-gray-400">
          Attachments - coming in LE-09d
        </div>
      )}
    </div>
  );
}
