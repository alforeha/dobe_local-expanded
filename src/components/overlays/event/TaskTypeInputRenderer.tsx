import type {
  TaskType,
  InputFields,
  CheckInputFields,
  CounterInputFields,
  RatingInputFields,
  TextInputFields,
  ChoiceInputFields,
  ChecklistInputFields,
  LogInputFields,
  SetsRepsInputFields,
  CircuitInputFields,
  DurationInputFields,
  TimerInputFields,
  FormInputFields,
  ScanInputFields,
  LocationPointInputFields,
  LocationTrailInputFields,
  RollInputFields,
  TaskTemplate,
} from '../../../types/taskTemplate';
import type { Task } from '../../../types/task';
import { CheckInput } from './inputs/CheckInput';
import { CounterInput } from './inputs/CounterInput';
import { RatingInput } from './inputs/RatingInput';
import { TextInput } from './inputs/TextInput';
import { ChoiceInput } from './inputs/ChoiceInput';
import { ChecklistInput } from './inputs/ChecklistInput';
import { LogInput } from './inputs/LogInput';
import { SetsRepsInput } from './inputs/SetsRepsInput';
import { CircuitInput } from './inputs/CircuitInput';
import { DurationInput } from './inputs/DurationInput';
import { TimerInput } from './inputs/TimerInput';
import { FormInput } from './inputs/FormInput';
import { ScanInput } from './inputs/ScanInput';
import { LocationPointInput } from './inputs/LocationPointInput';
import { LocationTrailInput } from './inputs/LocationTrailInput';
import { RollInput } from './inputs/RollInput';

interface TaskTypeInputRendererProps {
  taskType: TaskType;
  template: TaskTemplate | null | undefined;
  task: Task | null;
  eventId?: string;
  onComplete: (result: Partial<InputFields>) => void;
  hideSubmit?: boolean;
  onResultChange?: (result: Partial<InputFields>) => void;
}

export function TaskTypeInputRenderer({
  taskType,
  template,
  task,
  eventId,
  onComplete,
  hideSubmit,
  onResultChange,
}: TaskTypeInputRendererProps) {
  if (!task || !template) {
    return (
      <div className="rounded bg-gray-50 dark:bg-gray-700 px-3 py-2">
        <p className="text-xs text-gray-400 italic">Task data not available</p>
      </div>
    );
  }

  switch (taskType) {
    case 'CHECK':
      return (
        <CheckInput
          inputFields={template.inputFields as CheckInputFields}
          task={task}
          onComplete={onComplete as (r: Partial<CheckInputFields>) => void}
          hideSubmit={hideSubmit}
        />
      );
    case 'COUNTER':
      return (
        <CounterInput
          inputFields={template.inputFields as CounterInputFields}
          task={task}
          onComplete={onComplete as (r: Partial<CounterInputFields>) => void}
          hideSubmit={hideSubmit}
          onResultChange={onResultChange as ((r: Partial<CounterInputFields>) => void) | undefined}
        />
      );
    case 'RATING':
      return (
        <RatingInput
          inputFields={template.inputFields as RatingInputFields}
          task={task}
          onComplete={onComplete as (r: Partial<RatingInputFields>) => void}
        />
      );
    case 'TEXT':
      return (
        <TextInput
          inputFields={template.inputFields as TextInputFields}
          task={task}
          onComplete={onComplete as (r: Partial<TextInputFields>) => void}
          hideSubmit={hideSubmit}
          onResultChange={onResultChange as ((r: Partial<TextInputFields>) => void) | undefined}
        />
      );
    case 'CHOICE':
      return (
        <ChoiceInput
          inputFields={template.inputFields as ChoiceInputFields}
          task={task}
          onComplete={onComplete as (r: Partial<ChoiceInputFields>) => void}
        />
      );
    case 'CHECKLIST':
      return (
        <ChecklistInput
          inputFields={template.inputFields as ChecklistInputFields}
          task={task}
          onComplete={onComplete as (r: Partial<ChecklistInputFields>) => void}
          hideSubmit={hideSubmit}
          onResultChange={onResultChange as ((r: Partial<ChecklistInputFields>) => void) | undefined}
        />
      );
    case 'LOG':
      return (
        <LogInput
          inputFields={template.inputFields as LogInputFields}
          task={task}
          onComplete={onComplete as (r: Partial<LogInputFields>) => void}
          hideSubmit={hideSubmit}
          onResultChange={onResultChange as ((r: Partial<LogInputFields>) => void) | undefined}
        />
      );
    case 'SETS_REPS':
      return (
        <SetsRepsInput
          inputFields={template.inputFields as SetsRepsInputFields}
          task={task}
          onComplete={onComplete as (r: Partial<SetsRepsInputFields>) => void}
        />
      );
    case 'CIRCUIT':
      return (
        <CircuitInput
          inputFields={template.inputFields as CircuitInputFields}
          task={task}
          onComplete={onComplete as (r: Partial<CircuitInputFields>) => void}
        />
      );
    case 'DURATION':
      return (
        <DurationInput
          inputFields={template.inputFields as DurationInputFields}
          task={task}
          onComplete={onComplete as (r: Partial<DurationInputFields>) => void}
        />
      );
    case 'TIMER':
      return (
        <TimerInput
          inputFields={template.inputFields as TimerInputFields}
          task={task}
          onComplete={onComplete as (r: Partial<TimerInputFields>) => void}
        />
      );
    case 'FORM':
      return (
        <FormInput
          inputFields={template.inputFields as FormInputFields}
          task={task}
          onComplete={onComplete as (r: Partial<FormInputFields>) => void}
          hideSubmit={hideSubmit}
          onResultChange={onResultChange as ((r: Partial<FormInputFields>) => void) | undefined}
        />
      );
    case 'SCAN':
      return (
        <ScanInput
          inputFields={template.inputFields as ScanInputFields}
          task={task}
          onComplete={onComplete as (r: Partial<ScanInputFields>) => void}
        />
      );
    case 'LOCATION_POINT':
      return (
        <LocationPointInput
          eventId={eventId}
          inputFields={template.inputFields as LocationPointInputFields}
          task={task}
          onComplete={onComplete as (r: Partial<LocationPointInputFields>) => void}
          onResultChange={onResultChange as ((r: Partial<LocationPointInputFields>) => void) | undefined}
        />
      );
    case 'LOCATION_TRAIL':
      return (
        <LocationTrailInput
          eventId={eventId}
          inputFields={template.inputFields as LocationTrailInputFields}
          task={task}
          onComplete={onComplete as (r: Partial<LocationTrailInputFields>) => void}
          onResultChange={onResultChange as ((r: Partial<LocationTrailInputFields>) => void) | undefined}
        />
      );
    case 'ROLL':
      return (
        <RollInput
          inputFields={template.inputFields as RollInputFields}
          task={task}
          onComplete={onComplete as (r: Partial<RollInputFields>) => void}
        />
      );
    default:
      return (
        <div className="rounded bg-gray-50 dark:bg-gray-700 px-3 py-2">
          <p className="text-xs text-gray-400 italic">{taskType} - input shape not yet implemented</p>
        </div>
      );
    }
}
