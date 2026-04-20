import { useEffect, useState } from 'react';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { TaskRoomHeader } from './TaskRoomHeader';
import { TaskRoomBody } from './TaskRoomBody';
import { ResourceTasksTab } from './ResourceTasksTab';
import { TaskTemplatePopup } from './TaskTemplatePopup';
import type { TaskTemplate } from '../../../../../types';
import { autoCompleteSystemTask } from '../../../../../engine/resourceEngine';

type TaskTab = 'stat' | 'resource';

type PopupState =
  | { mode: 'add' }
  | { mode: 'edit'; key: string; template: TaskTemplate }
  | null;

interface TaskRoomProps {
  onGoToResource?: (resourceId: string, resourceType: string) => void;
}

export function TaskRoom({ onGoToResource }: TaskRoomProps) {
  const [tab, setTab] = useState<TaskTab>('stat');
  const [popup, setPopup] = useState<PopupState>(null);
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);

  useEffect(() => {
    autoCompleteSystemTask('task-sys-explore-task-room');
  }, []);

  // Filter out system/onboarding tasks and resource-derived templates.
  // Resource templates use the 'resource-task:' key prefix (written by ensureTemplate()
  // in resourceEngine) — exclude them regardless of isSystem flag so that templates
  // persisted before the isSystem flag was added are also hidden.
  const filtered: [string, TaskTemplate, boolean][] =
    tab === 'stat'
      ? Object.entries(taskTemplates)
          .filter(([k, t]) => t.isSystem !== true && !k.startsWith('resource-task:'))
          .map(([k, t]): [string, TaskTemplate, boolean] => [k, t, t.isCustom === true])
      : [];

  function handleEdit(key: string, template: TaskTemplate) {
    setPopup({ mode: 'edit', key, template });
  }

  return (
    <div className="flex flex-col h-full">
      <TaskRoomHeader activeTab={tab} onTabChange={setTab} onAdd={() => setPopup({ mode: 'add' })} />
      {tab === 'stat' && <TaskRoomBody templates={filtered} onEdit={handleEdit} />}
      {tab === 'resource' && <ResourceTasksTab onGoToResource={onGoToResource} />}
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
