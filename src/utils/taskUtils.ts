import type { InputFields } from '../types/taskTemplate';

type ResourceDraftTaskType =
  | 'CHECK'
  | 'COUNTER'
  | 'DURATION'
  | 'TIMER'
  | 'RATING'
  | 'TEXT'
  | 'CONSUME'
  | 'USE';

function normalizeResourceDraftTaskType(taskType?: string | null): ResourceDraftTaskType {
  switch (taskType) {
    case 'CHECK':
    case 'COUNTER':
    case 'DURATION':
    case 'TIMER':
    case 'RATING':
    case 'TEXT':
    case 'CONSUME':
    case 'USE':
      return taskType;
    default:
      return 'CHECK';
  }
}

export function buildTaskInputFields(
  taskType: string,
  title: string,
  inputFields?: Partial<InputFields> | null,
): Partial<InputFields> {
  const normalizedTaskType = normalizeResourceDraftTaskType(taskType);

  switch (normalizedTaskType) {
    case 'COUNTER':
      return { target: 1, unit: 'count', step: 1, ...(inputFields ?? {}) };
    case 'DURATION': {
      const durationFields = (inputFields ?? {}) as {
        targetDuration?: number;
        unit?: 'seconds' | 'minutes' | 'hours';
      };
      return {
        targetDuration: durationFields.targetDuration ?? 300,
        unit: durationFields.unit ?? 'seconds',
      };
    }
    case 'TIMER':
      return { countdownFrom: 300, ...(inputFields ?? {}) };
    case 'RATING':
      return { scale: 5, label: title || 'Rate this', ...(inputFields ?? {}) };
    case 'TEXT':
      return { prompt: title || 'Add details', maxLength: null, ...(inputFields ?? {}) };
    case 'CONSUME': {
      const consumeFields = (inputFields ?? {}) as {
        label?: string;
        entries?: Array<{ itemTemplateRef: string; quantity: number }>;
      };
      return {
        label: consumeFields.label ?? (title || 'Consume items'),
        entries: consumeFields.entries?.length ? consumeFields.entries : [{ itemTemplateRef: '', quantity: 1 }],
      };
    }
    case 'USE':
    case 'CHECK':
    default:
      return { label: title || 'Complete task', ...(inputFields ?? {}) };
  }
}
