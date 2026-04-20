import { useState, useEffect } from 'react';
import type { FormInputFields, FormField } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';

interface FormInputProps {
  inputFields: FormInputFields;
  task: Task;
  onComplete: (result: Partial<FormInputFields>) => void;
  hideSubmit?: boolean;
  onResultChange?: (result: Partial<FormInputFields>) => void;
}

export function FormInput({ inputFields, task, onComplete, hideSubmit, onResultChange }: FormInputProps) {
  const isComplete = task.completionState === 'complete';
  const { fields } = inputFields;

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, ''])),
  );

  useEffect(() => {
    const resultFields: FormField[] = fields.map((f) => {
      const raw = values[f.key] ?? '';
      let coerced: string | number | boolean | null = raw;
      if (f.fieldType === 'number') {
        coerced = raw !== '' ? Number(raw) : null;
      } else if (f.fieldType === 'boolean') {
        coerced = raw === 'true';
      }
      return { ...f, value: coerced };
    });
    onResultChange?.({ fields: resultFields });
  }, [values, fields, onResultChange]);

  const setValue = (key: string, val: string) =>
    setValues((prev) => ({ ...prev, [key]: val }));

  const allFilled = fields.every((f) => values[f.key]?.trim() !== '');

  const handleSubmit = () => {
    if (!allFilled) return;
    const resultFields: FormField[] = fields.map((f) => {
      const raw = values[f.key] ?? '';
      let coerced: string | number | boolean | null = raw;
      if (f.fieldType === 'number') {
        coerced = raw !== '' ? Number(raw) : null;
      } else if (f.fieldType === 'boolean') {
        coerced = raw === 'true';
      }
      return { ...f, value: coerced };
    });
    onComplete({ fields: resultFields });
  };

  if (isComplete) {
    const saved = (task.resultFields as Partial<FormInputFields>).fields ?? fields;
    return (
      <div className="space-y-1 py-2">
        <span className="text-sm font-medium text-green-600 dark:text-green-400">✓ Submitted</span>
        <ul className="mt-1 space-y-0.5">
          {saved.map((f) => (
            <li key={f.key} className="flex gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-600 dark:text-gray-300">{f.label}:</span>
              <span>{String(f.value ?? '—')}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-2 py-1">
      {fields.map((f) => (
        <div key={f.key} className="space-y-0.5">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
            {f.label}
          </label>

          {f.fieldType === 'boolean' ? (
            <div className="flex items-center gap-3">
              {['true', 'false'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setValue(f.key, opt)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    values[f.key] === opt
                      ? 'bg-purple-600 text-white'
                      : 'border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                  {opt === 'true' ? 'Yes' : 'No'}
                </button>
              ))}
            </div>
          ) : (
            <input
              type={f.fieldType === 'number' ? 'number' : f.fieldType === 'date' ? 'date' : 'text'}
              value={values[f.key] ?? ''}
              onChange={(e) => setValue(f.key, e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          )}
        </div>
      ))}

      {!hideSubmit && (
        <button
          type="button"
          disabled={!allFilled}
          onClick={handleSubmit}
          className="w-full rounded-lg bg-purple-600 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-40"
        >
          Submit
        </button>
      )}
    </div>
  );
}
