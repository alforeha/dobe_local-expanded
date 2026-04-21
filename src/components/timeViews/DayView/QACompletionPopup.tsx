import { useShallow } from 'zustand/react/shallow';
import type { QuickActionsCompletion, RollInputFields } from '../../../types';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { IconDisplay } from '../../shared/IconDisplay';
import { PopupShell } from '../../shared/popups/PopupShell';
import { resolveTemplate } from './qaUtils';

interface QACompletionPopupProps {
  completion: QuickActionsCompletion;
  onClose: () => void;
}

function formatHHMM(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function resultSummaryPairs(resultFields: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(resultFields)
    .filter(([, value]) => value !== null && value !== undefined && value !== '' && !Array.isArray(value))
    .slice(0, 3)
    .map(([key, value]) => [key, String(value)]);
}

export function QACompletionPopup({ completion, onClose }: QACompletionPopupProps) {
  const { tasks, taskTemplates } = useScheduleStore(useShallow((state) => ({
    tasks: state.tasks,
    taskTemplates: state.taskTemplates,
  })));

  const task = tasks[completion.taskRef];
  const template = task?.templateRef ? resolveTemplate(task.templateRef, taskTemplates) : null;
  const taskName = template?.name ?? (task?.templateRef ?? '—');
  const isRoll = template?.taskType === 'ROLL';

  const rollFields = isRoll && task
    ? (task.resultFields as RollInputFields)
    : null;

  const summaryPairs = !isRoll && task
    ? resultSummaryPairs(task.resultFields as Record<string, unknown>)
    : [];

  return (
    <PopupShell title={taskName} onClose={onClose}>
      <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <span>Completed at</span>
          <span className="font-semibold text-gray-700 dark:text-gray-200">
            {formatHHMM(completion.completedAt)}
          </span>
        </div>

        {isRoll && (
          <div className="space-y-2 rounded-lg bg-purple-50 p-3 dark:bg-purple-900/20">
            <div className="flex items-center gap-3">
              <IconDisplay iconKey="task-type-roll" size={30} className="h-[30px] w-[30px] object-contain" alt="" />
              <span className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                {rollFields?.result ?? '—'}
              </span>
            </div>
            {rollFields?.boostApplied && (
              <div className="text-xs text-purple-600 dark:text-purple-400">
                Early bird bonus: <span className="font-semibold">{rollFields.boostApplied}</span>
              </div>
            )}
          </div>
        )}

        {!isRoll && summaryPairs.length > 0 && (
          <div className="space-y-1 rounded bg-gray-50 p-2 dark:bg-gray-700/40">
            {summaryPairs.map(([key, value]) => (
              <div key={key} className="flex justify-between text-xs">
                <span className="capitalize text-gray-500 dark:text-gray-400">{key}</span>
                <span className="font-semibold text-gray-800 dark:text-gray-200">{value}</span>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs italic text-gray-400">Read-only - editing not available in LOCAL v1</p>
      </div>
    </PopupShell>
  );
}
