import type { CheckInputFields } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';
import { ONBOARDING_GLOW } from '../../../../constants/onboardingKeys';
import { useGlows } from '../../../../hooks/useOnboardingGlow';

interface CheckInputProps {
  inputFields: CheckInputFields;
  task: Task;
  onComplete: (result: Partial<CheckInputFields>) => void;
  hideSubmit?: boolean;
}

export function CheckInput({ inputFields, task, onComplete, hideSubmit }: CheckInputProps) {
  const isComplete = task.completionState === 'complete';
  const welcomeGlow = useGlows(ONBOARDING_GLOW.WELCOME_EVENT_CARD);
  const shouldGlowComplete =
    welcomeGlow && task.questRef?.endsWith('|0|0') === true && !isComplete;

  if (hideSubmit) {
    return (
      <div className="h-full flex items-center">
        <p className="flex-1 text-sm text-gray-700 dark:text-gray-300">{inputFields.label}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center gap-3">
      <p className="flex-1 text-sm text-gray-700 dark:text-gray-300">{inputFields.label}</p>
      <button
        type="button"
        disabled={isComplete}
        onClick={() => onComplete({ label: inputFields.label, note: null })}
        className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors
          ${isComplete
            ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 cursor-default'
            : 'bg-purple-600 text-white hover:bg-purple-700 active:bg-purple-800'
          }
          ${shouldGlowComplete ? 'animate-pulse ring-2 ring-emerald-400 ring-offset-2 ring-offset-white dark:ring-offset-gray-800' : ''}`}
      >
        {isComplete ? '✓ Done' : 'Complete'}
      </button>
    </div>
  );
}
