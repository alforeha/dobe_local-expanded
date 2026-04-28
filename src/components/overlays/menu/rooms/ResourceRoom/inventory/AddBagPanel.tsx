import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import {
  makeDefaultRecurrenceRule,
  normalizeRecurrenceMode,
  type InventoryContainer,
  type InventoryResource,
  type RecurrenceDayOfWeek,
  type ResourceRecurrenceRule,
} from '../../../../../../types/resource';
import { IconPicker } from '../../../../../shared/IconPicker';
import { TextInput } from '../../../../../shared/inputs/TextInput';
import { PopupShell } from '../../../../../shared/popups/PopupShell';

interface AddBagPanelProps {
  resource: InventoryResource;
  onClose: () => void;
  onBagAdded?: (bagId: string) => void;
}

const DOW_LABELS: Array<{ key: RecurrenceDayOfWeek; label: string }> = [
  { key: 'sun', label: 'Su' },
  { key: 'mon', label: 'Mo' },
  { key: 'tue', label: 'Tu' },
  { key: 'wed', label: 'We' },
  { key: 'thu', label: 'Th' },
  { key: 'fri', label: 'Fr' },
  { key: 'sat', label: 'Sa' },
];

const INPUT_CLS = 'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';

function getDayOfMonth(isoDate: string): number {
  const parsed = Number(isoDate.split('-')[2] ?? 1);
  return Math.min(31, Math.max(1, parsed || 1));
}

export function AddBagPanel({ resource, onClose, onBagAdded }: AddBagPanelProps) {
  const setResource = useResourceStore((state) => state.setResource);
  const [icon, setIcon] = useState('inventory');
  const [name, setName] = useState('');
  const [recurrenceMode, setRecurrenceMode] = useState<'recurring' | 'never'>('recurring');
  const [recurrence, setRecurrence] = useState<ResourceRecurrenceRule>(makeDefaultRecurrenceRule());
  const [reminderLeadDays, setReminderLeadDays] = useState<number | ''>(0);
  const [error, setError] = useState('');

  function updateRecurrence(patch: Partial<ResourceRecurrenceRule>) {
    setRecurrence((current) => ({ ...current, ...patch }));
  }

  function toggleDay(day: RecurrenceDayOfWeek) {
    setRecurrence((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((entry) => entry !== day)
        : [...current.days, day],
    }));
  }

  function handleSave() {
    if (!name.trim()) {
      setError('Bag name is required.');
      return;
    }

    const nextBag: InventoryContainer = {
      id: uuidv4(),
      kind: 'bag',
      name: name.trim(),
      icon: icon || 'inventory',
      items: [],
      carryTask: {
        id: uuidv4(),
        name: `Carry ${name.trim()}`,
        taskType: 'CHECK',
        recurrenceMode: normalizeRecurrenceMode(recurrenceMode),
        recurrence,
        reminderLeadDays: reminderLeadDays === '' ? undefined : reminderLeadDays,
      },
      notes: [],
      attachments: [],
      links: [],
    };

    setResource({
      ...resource,
      updatedAt: new Date().toISOString(),
      containers: [...(resource.containers ?? []), nextBag],
    });

    onBagAdded?.(nextBag.id);
    onClose();
  }

  return (
    <PopupShell title="Add Bag" onClose={onClose} size="large">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[auto_1fr] items-end gap-3">
          <IconPicker value={icon} onChange={setIcon} align="left" />
          <TextInput
            label="Bag name"
            value={name}
            onChange={(value) => {
              setName(value);
              setError('');
            }}
            placeholder="My Bag"
            maxLength={80}
          />
        </div>

        <section className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {name.trim() ? `Carry ${name.trim()}` : 'Carry Task'}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {([
              { value: 'recurring', label: 'Recurring' },
              { value: 'never', label: 'Intermittent' },
            ] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRecurrenceMode(option.value)}
                className={normalizeRecurrenceMode(recurrenceMode) === option.value
                  ? 'rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white'
                  : 'rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'}
              >
                {option.label}
              </button>
            ))}
          </div>

          {normalizeRecurrenceMode(recurrenceMode) === 'recurring' ? (
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_7rem]">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Frequency</span>
                  <select
                    value={recurrence.frequency}
                    onChange={(event) => updateRecurrence({
                      frequency: event.target.value as ResourceRecurrenceRule['frequency'],
                      days: event.target.value === 'weekly' ? recurrence.days : [],
                      monthlyDay: event.target.value === 'monthly' ? (recurrence.monthlyDay ?? getDayOfMonth(recurrence.seedDate)) : null,
                    })}
                    className={INPUT_CLS}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Interval</span>
                  <input
                    type="number"
                    min={1}
                    value={recurrence.interval}
                    onChange={(event) => updateRecurrence({ interval: Math.max(1, Number(event.target.value) || 1) })}
                    className={INPUT_CLS}
                  />
                </label>
              </div>

              {recurrence.frequency === 'weekly' ? (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Days</span>
                  <div className="flex flex-wrap gap-2">
                    {DOW_LABELS.map((day) => (
                      <button
                        key={day.key}
                        type="button"
                        onClick={() => toggleDay(day.key)}
                        className={recurrence.days.includes(day.key)
                          ? 'h-8 w-8 rounded-full bg-blue-500 text-xs font-semibold text-white'
                          : 'h-8 w-8 rounded-full bg-white text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Start date</span>
                <input
                  type="date"
                  value={recurrence.seedDate}
                  onChange={(event) => updateRecurrence({
                    seedDate: event.target.value,
                    monthlyDay: recurrence.frequency === 'monthly'
                      ? (recurrence.monthlyDay ?? getDayOfMonth(event.target.value))
                      : recurrence.monthlyDay,
                  })}
                  className={INPUT_CLS}
                />
              </label>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Seed date</span>
                <input
                  type="date"
                  value={recurrence.seedDate}
                  onChange={(event) => updateRecurrence({ seedDate: event.target.value })}
                  className={INPUT_CLS}
                />
              </label>
            </div>
          )}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Reminder lead days</span>
              <input
                type="number"
                min={0}
                value={reminderLeadDays}
                onChange={(event) => setReminderLeadDays(event.target.value === '' ? '' : Math.max(0, Number(event.target.value) || 0))}
                className={INPUT_CLS}
                placeholder="Optional"
              />
            </label>
          </div>
        </section>

        {error ? <div className="text-sm font-medium text-red-500">{error}</div> : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600"
          >
            Save Bag
          </button>
        </div>
      </div>
    </PopupShell>
  );
}
