import type {
  CheckInputFields,
  ChoiceInputFields,
  ChecklistInputFields,
  ConsumeInputFields,
  CounterInputFields,
  DurationInputFields,
  FormInputFields,
  InputFields,
  LocationPointInputFields,
  LocationTrailInputFields,
  LogInputFields,
  RatingInputFields,
  RollInputFields,
  ScanInputFields,
  SetsRepsInputFields,
  TaskTemplate,
  TaskType,
  TextInputFields,
  TimerInputFields,
} from '../../../types/taskTemplate';
import type { Task } from '../../../types/task';
import { CheckInput } from './inputs/CheckInput';
import { ChoiceInput } from './inputs/ChoiceInput';
import { ChecklistInput } from './inputs/ChecklistInput';
import { ConsumeInput } from './inputs/ConsumeInput';
import { CounterInput } from './inputs/CounterInput';
import { DurationInput } from './inputs/DurationInput';
import { FormInput } from './inputs/FormInput';
import { LocationPointInput } from './inputs/LocationPointInput';
import { LocationTrailInput } from './inputs/LocationTrailInput';
import { LogInput } from './inputs/LogInput';
import { RatingInput } from './inputs/RatingInput';
import { RollInput } from './inputs/RollInput';
import { ScanInput } from './inputs/ScanInput';
import { SetsRepsInput } from './inputs/SetsRepsInput';
import { TextInput } from './inputs/TextInput';
import { TimerInput } from './inputs/TimerInput';

export interface TaskTypeInputContentProps {
  taskType: Exclude<TaskType, 'CIRCUIT'>;
  template: TaskTemplate | null | undefined;
  task: Task | null;
  eventId?: string;
  onComplete: (result: Partial<InputFields>) => void;
  hideSubmit?: boolean;
  onResultChange?: (result: Partial<InputFields>) => void;
  choiceToneMap?: Record<string, 'success' | 'danger' | 'neutral'>;
}

export function TaskTypeInputContent({
  taskType,
  template,
  task,
  eventId,
  onComplete,
  hideSubmit,
  onResultChange,
  choiceToneMap,
}: TaskTypeInputContentProps) {
  if (!task || !template) {
    return (
      <div className="rounded bg-gray-50 px-3 py-2 dark:bg-gray-700">
        <p className="text-xs italic text-gray-400">Task data not available</p>
      </div>
    );
  }

  switch (taskType) {
    case 'CHECK':
      return (
        <CheckInput
          inputFields={template.inputFields as CheckInputFields}
          task={task}
          onComplete={onComplete as (result: Partial<CheckInputFields>) => void}
          hideSubmit={hideSubmit}
        />
      );
    case 'COUNTER':
      return (
        <CounterInput
          inputFields={template.inputFields as CounterInputFields}
          task={task}
          onComplete={onComplete as (result: Partial<CounterInputFields>) => void}
          hideSubmit={hideSubmit}
          onResultChange={onResultChange as ((result: Partial<CounterInputFields>) => void) | undefined}
        />
      );
    case 'RATING':
      return (
        <RatingInput
          inputFields={template.inputFields as RatingInputFields}
          task={task}
          onComplete={onComplete as (result: Partial<RatingInputFields>) => void}
        />
      );
    case 'TEXT':
      return (
        <TextInput
          inputFields={template.inputFields as TextInputFields}
          task={task}
          onComplete={onComplete as (result: Partial<TextInputFields>) => void}
          hideSubmit={hideSubmit}
          onResultChange={onResultChange as ((result: Partial<TextInputFields>) => void) | undefined}
        />
      );
    case 'CHOICE':
      return (
        <ChoiceInput
          inputFields={template.inputFields as ChoiceInputFields}
          task={task}
          onComplete={onComplete as (result: Partial<ChoiceInputFields>) => void}
          optionToneMap={choiceToneMap}
        />
      );
    case 'CHECKLIST':
      return (
        <ChecklistInput
          inputFields={template.inputFields as ChecklistInputFields}
          task={task}
          onComplete={onComplete as (result: Partial<ChecklistInputFields>) => void}
          hideSubmit={hideSubmit}
          onResultChange={onResultChange as ((result: Partial<ChecklistInputFields>) => void) | undefined}
        />
      );
    case 'LOG':
      return (
        <LogInput
          inputFields={template.inputFields as LogInputFields}
          task={task}
          onComplete={onComplete as (result: Partial<LogInputFields>) => void}
          hideSubmit={hideSubmit}
          onResultChange={onResultChange as ((result: Partial<LogInputFields>) => void) | undefined}
        />
      );
    case 'CONSUME':
      return (
        <ConsumeInput
          inputFields={template.inputFields as ConsumeInputFields}
          task={task}
          onComplete={onComplete as (result: Partial<ConsumeInputFields>) => void}
          hideSubmit={hideSubmit}
          onResultChange={onResultChange as ((result: Partial<ConsumeInputFields>) => void) | undefined}
        />
      );
    case 'SETS_REPS':
      return (
        <SetsRepsInput
          inputFields={template.inputFields as SetsRepsInputFields}
          task={task}
          onComplete={onComplete as (result: Partial<SetsRepsInputFields>) => void}
        />
      );
    case 'DURATION':
      return (
        <DurationInput
          inputFields={template.inputFields as DurationInputFields}
          task={task}
          onComplete={onComplete as (result: Partial<DurationInputFields>) => void}
        />
      );
    case 'TIMER':
      return (
        <TimerInput
          inputFields={template.inputFields as TimerInputFields}
          task={task}
          onComplete={onComplete as (result: Partial<TimerInputFields>) => void}
        />
      );
    case 'FORM':
      return (
        <FormInput
          inputFields={template.inputFields as FormInputFields}
          task={task}
          onComplete={onComplete as (result: Partial<FormInputFields>) => void}
          hideSubmit={hideSubmit}
          onResultChange={onResultChange as ((result: Partial<FormInputFields>) => void) | undefined}
        />
      );
    case 'SCAN':
      return (
        <ScanInput
          inputFields={template.inputFields as ScanInputFields}
          task={task}
          onComplete={onComplete as (result: Partial<ScanInputFields>) => void}
        />
      );
    case 'LOCATION_POINT':
      return (
        <LocationPointInput
          eventId={eventId}
          inputFields={template.inputFields as LocationPointInputFields}
          task={task}
          onComplete={onComplete as (result: Partial<LocationPointInputFields>) => void}
          onResultChange={onResultChange as ((result: Partial<LocationPointInputFields>) => void) | undefined}
        />
      );
    case 'LOCATION_TRAIL':
      return (
        <LocationTrailInput
          eventId={eventId}
          inputFields={template.inputFields as LocationTrailInputFields}
          task={task}
          onComplete={onComplete as (result: Partial<LocationTrailInputFields>) => void}
          onResultChange={onResultChange as ((result: Partial<LocationTrailInputFields>) => void) | undefined}
        />
      );
    case 'ROLL':
      return (
        <RollInput
          inputFields={template.inputFields as RollInputFields}
          task={task}
          onComplete={onComplete as (result: Partial<RollInputFields>) => void}
        />
      );
    default:
      return (
        <div className="rounded bg-gray-50 px-3 py-2 dark:bg-gray-700">
          <p className="text-xs italic text-gray-400">{taskType} - input shape not yet implemented</p>
        </div>
      );
  }
}