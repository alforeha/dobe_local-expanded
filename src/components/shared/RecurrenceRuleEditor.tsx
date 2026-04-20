// ─────────────────────────────────────────
// RecurrenceRuleEditor — compact inline recurrence rule editor.
// ─────────────────────────────────────────

import type { ResourceRecurrenceRule, RecurrenceDayOfWeek } from '../../types/resource';
import { RECURRENCE_DAYS_OF_WEEK } from '../../types/resource';

interface RecurrenceRuleEditorProps {
  value: ResourceRecurrenceRule;
  onChange: (rule: ResourceRecurrenceRule) => void;
}

const DOW_LABELS: { key: RecurrenceDayOfWeek; label: string }[] = [
  { key: 'sun', label: 'Su' },
  { key: 'mon', label: 'Mo' },
  { key: 'tue', label: 'Tu' },
  { key: 'wed', label: 'We' },
  { key: 'thu', label: 'Th' },
  { key: 'fri', label: 'Fr' },
  { key: 'sat', label: 'Sa' },
];

const INPUT_CLS = 'rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:border-purple-500 focus:outline-none';
const SELECT_CLS = INPUT_CLS + ' w-full';

export function RecurrenceRuleEditor({ value, onChange }: RecurrenceRuleEditorProps) {
  void RECURRENCE_DAYS_OF_WEEK; // keep import live

  function update(patch: Partial<ResourceRecurrenceRule>) {
    onChange({ ...value, ...patch });
  }

  function toggleDay(day: RecurrenceDayOfWeek) {
    const days = value.days.includes(day)
      ? value.days.filter((d) => d !== day)
      : [...value.days, day];
    update({ days });
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Row 1: Every [N] [frequency] */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-400 shrink-0">Every</span>
        <input
          type="number"
          value={value.interval}
          min={1}
          max={99}
          onChange={(e) => update({ interval: Math.max(1, Number(e.target.value) || 1) })}
          className={`w-10 text-center ${INPUT_CLS}`}
        />
        <select
          value={value.frequency}
          onChange={(e) =>
            update({
              frequency: e.target.value as ResourceRecurrenceRule['frequency'],
              days: [],
            })
          }
          className={`flex-1 ${SELECT_CLS}`}
        >
          <option value="daily">day(s)</option>
          <option value="weekly">week(s)</option>
          <option value="monthly">month(s)</option>
          <option value="yearly">year(s)</option>
        </select>
      </div>

      {/* Row 2: Day-of-week toggles (weekly only) */}
      {value.frequency === 'weekly' && (
        <div className="flex gap-1">
          {DOW_LABELS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleDay(key)}
              className={`w-7 h-7 text-xs rounded font-medium transition-colors ${
                value.days.includes(key)
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Row 3: Seed date + optional end date */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-400 shrink-0">From</span>
        <input
          type="date"
          value={value.seedDate}
          onChange={(e) => update({ seedDate: e.target.value })}
          className={`flex-1 ${INPUT_CLS}`}
        />
        <span className="text-xs text-gray-400 shrink-0">Ends</span>
        <input
          type="date"
          value={value.endsOn ?? ''}
          onChange={(e) => update({ endsOn: e.target.value || null })}
          className={`flex-1 ${INPUT_CLS}`}
        />
      </div>
    </div>
  );
}
