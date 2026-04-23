import { useEffect, useRef, useState } from 'react';
import type { Event } from '../../../../types';
import { AddTaskPanel } from '../AddTaskPanel';
import { TaskRow } from '../TaskRow';

interface ActionsSectionProps {
  event: Event;
  eventId: string;
  isEditMode: boolean;
  taskIds: string[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onTaskComplete: () => void;
  completedCount: number;
  totalCount: number;
  hideCompleted: boolean;
  onToggleHideCompleted: () => void;
  addRequestNonce: number;
}

export function ActionsSection({
  event,
  eventId,
  isEditMode,
  taskIds,
  selectedTaskId,
  onSelectTask,
  onTaskComplete,
  completedCount,
  totalCount,
  hideCompleted,
  onToggleHideCompleted,
  addRequestNonce,
}: ActionsSectionProps) {
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const lastHandledAddRequestRef = useRef(addRequestNonce);

  useEffect(() => {
    let openTimer: ReturnType<typeof setTimeout> | null = null;

    if (addRequestNonce > lastHandledAddRequestRef.current) {
      openTimer = setTimeout(() => {
        setIsAddPanelOpen(true);
      }, 0);
    }

    lastHandledAddRequestRef.current = addRequestNonce;

    return () => {
      if (openTimer !== null) {
        clearTimeout(openTimer);
      }
    };
  }, [addRequestNonce]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs">
        <span className="font-medium text-gray-600 dark:text-gray-400">
          {completedCount}/{totalCount} tasks
        </span>
        <button
          type="button"
          onClick={onToggleHideCompleted}
          className={`rounded px-2 py-0.5 transition-colors ${
            hideCompleted
              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          {hideCompleted ? 'Show all' : 'Hide completed'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {taskIds.length === 0 ? (
          <div className="flex h-full items-center justify-center px-3">
            <p className="text-xs text-gray-400">No tasks</p>
          </div>
        ) : (
          taskIds.map((taskId) => (
            <TaskRow
              key={taskId}
              taskId={taskId}
              eventId={eventId}
              isEditMode={isEditMode}
              isSelected={selectedTaskId === taskId}
              onSelect={onSelectTask}
              onTaskComplete={onTaskComplete}
            />
          ))
        )}
      </div>

      {isAddPanelOpen && (
        <AddTaskPanel
          eventId={event.id}
          onClose={() => setIsAddPanelOpen(false)}
        />
      )}
    </div>
  );
}