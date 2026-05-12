import { useEffect, useState } from 'react';
import { TaskRoomHeader } from './TaskRoomHeader';
import { TaskRoomBody, type TaskRoomBodyMode } from './TaskRoomBody';
import { ResourceTasksTab } from './ResourceTasksTab';
import { TaskTemplatePopup } from './TaskTemplatePopup';
import type { TaskTemplate } from '../../../../../types';
import { autoCompleteSystemTask } from '../../../../../engine/resourceEngine';
import type { ResourceType } from '../../../../../types/resource';

type PopupState =
  | { mode: 'add' }
  | { mode: 'edit'; key: string; template: TaskTemplate }
  | null;

interface TaskRoomProps {
  onGoToResource?: (resourceId: string, resourceType: ResourceType) => void;
  onExpandedChange?: (isExpanded: boolean) => void;
}

export function TaskRoom({ onGoToResource, onExpandedChange }: TaskRoomProps) {
  const [tab, setTab] = useState<TaskRoomBodyMode>('userTasks');
  const [taskExpanded, setTaskExpanded] = useState(false);
  const [popup, setPopup] = useState<PopupState>(null);

  useEffect(() => {
    autoCompleteSystemTask('task-sys-explore-task-room');
  }, []);

  useEffect(() => {
    if (tab === 'resourceTasks') {
      setTimeout(() => {
        setTaskExpanded(false);
      }, 0);
    }
  }, [tab]);

  useEffect(() => {
    onExpandedChange?.(taskExpanded);
  }, [taskExpanded, onExpandedChange]);

  function handleEdit(key: string, template: TaskTemplate) {
    setPopup({ mode: 'edit', key, template });
  }

  return (
    <div className="flex flex-col h-full">
      <TaskRoomHeader activeTab={tab} onTabChange={setTab} />
      {tab === 'resourceTasks' ? (
        <ResourceTasksTab onGoToResource={onGoToResource} />
      ) : (
        <TaskRoomBody
          mode={tab}
          onAdd={() => setPopup({ mode: 'add' })}
          onEdit={handleEdit}
          onExpandedChange={setTaskExpanded}
        />
      )}
      {popup && (
        <TaskTemplatePopup
          editKey={popup.mode === 'edit' ? popup.key : null}
          editTemplate={popup.mode === 'edit' ? popup.template : null}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}
