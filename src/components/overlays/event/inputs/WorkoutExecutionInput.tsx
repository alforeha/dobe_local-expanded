import type { SetsRepsInputFields, DurationInputFields, CounterInputFields, LocationTrailInputFields, TaskTemplate } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';
import { taskTemplateLibrary } from '../../../../coach';
import { useScheduleStore } from '../../../../stores/useScheduleStore';
import { CounterInput } from './CounterInput';
import { FitnessDurationInput } from './FitnessDurationInput';
import { FitnessSetsRepsInput } from './FitnessSetsRepsInput';
import { LocationTrailInput } from './LocationTrailInput';

interface WorkoutExecutionInputProps {
  inputFields: SetsRepsInputFields | DurationInputFields | CounterInputFields | LocationTrailInputFields;
  task: Task;
  onComplete: (result: Partial<SetsRepsInputFields> | Partial<DurationInputFields> | Partial<CounterInputFields> | Partial<LocationTrailInputFields>) => void;
}

export function WorkoutExecutionInput({ inputFields, task, onComplete }: WorkoutExecutionInputProps) {
  const taskTemplates = useScheduleStore((s: ReturnType<typeof useScheduleStore.getState>) => s.taskTemplates);
  const template: TaskTemplate | undefined = task.templateRef
    ? (taskTemplateLibrary.find((t: TaskTemplate) => t.id === task.templateRef)
      ?? (Object.values(taskTemplates) as TaskTemplate[]).find((t) => t.id === task.templateRef))
    : undefined;

  const isDuration = template?.taskType === 'DURATION';
  const isCounter = template?.taskType === 'COUNTER';
  const isLocationTrail = template?.taskType === 'LOCATION_TRAIL';
  const isSetsReps = template?.taskType === 'SETS_REPS';

  if (isDuration) {
    return (
      <FitnessDurationInput
        inputFields={inputFields as DurationInputFields}
        task={task}
        onComplete={onComplete as (result: Partial<DurationInputFields>) => void}
      />
    );
  }

  if (isCounter) {
    return (
      <CounterInput
        inputFields={inputFields as CounterInputFields}
        task={task}
        onComplete={onComplete as (result: Partial<CounterInputFields>) => void}
      />
    );
  }

  if (isLocationTrail) {
    return (
      <LocationTrailInput
        inputFields={inputFields as LocationTrailInputFields}
        task={task}
        onComplete={onComplete as (result: Partial<LocationTrailInputFields>) => void}
      />
    );
  }

  if (isSetsReps) {
    return (
      <FitnessSetsRepsInput
        inputFields={inputFields as SetsRepsInputFields}
        task={task}
        onComplete={onComplete as (result: Partial<SetsRepsInputFields>) => void}
      />
    );
  }

  return null;
}
