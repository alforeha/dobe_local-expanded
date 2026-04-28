import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import {
  makeDefaultRecurrenceRule,
  normalizeRecurrenceMode,
  type InventoryContainer,
  type InventoryResource,
  type ItemInstance,
  type RecurrenceDayOfWeek,
  type ResourceRecurrenceRule,
} from '../../../../../../types/resource';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { IconPicker } from '../../../../../shared/IconPicker';
import { TextInput } from '../../../../../shared/inputs/TextInput';
import { PopupShell } from '../../../../../shared/popups/PopupShell';
import { AddItemPanel } from './AddItemPanel';
import { getUserInventoryItemTemplates, mergeInventoryItemTemplates, resolveInventoryItemTemplate } from '../../../../../../utils/inventoryItems';

interface AddBagPanelProps {
  resource: InventoryResource;
  bag?: InventoryContainer | null;
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

export function AddBagPanel({ resource, bag, onClose, onBagAdded }: AddBagPanelProps) {
  const setResource = useResourceStore((state) => state.setResource);
  const user = useUserStore((state) => state.user);
  const [icon, setIcon] = useState(bag?.icon || 'inventory');
  const [name, setName] = useState(bag?.name || '');
  const [items, setItems] = useState<ItemInstance[]>(bag?.items ?? []);
  const [recurrenceMode, setRecurrenceMode] = useState<'recurring' | 'never'>(normalizeRecurrenceMode(bag?.carryTask?.recurrenceMode));
  const [recurrence, setRecurrence] = useState<ResourceRecurrenceRule>(bag?.carryTask?.recurrence ?? makeDefaultRecurrenceRule());
  const [reminderLeadDays, setReminderLeadDays] = useState<number | ''>(
    normalizeRecurrenceMode(bag?.carryTask?.recurrenceMode) === 'recurring'
      ? (bag?.carryTask?.reminderLeadDays ?? 0)
      : '',
  );
  const [error, setError] = useState('');
  const [showAddItemPanel, setShowAddItemPanel] = useState(false);
  const itemTemplates = useMemo(
    () => mergeInventoryItemTemplates(getUserInventoryItemTemplates(user), resource.itemTemplates),
    [resource.itemTemplates, user],
  );

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

  function updateItemQuantity(itemId: string, quantity: number) {
    setItems((current) => current.map((item) => (
      item.id === itemId
        ? {
            ...item,
            quantity: Math.max(0, quantity),
          }
        : item
    )));
  }

  function removeItem(itemId: string) {
    setItems((current) => current.filter((item) => item.id !== itemId));
  }

  function handleSave() {
    if (!name.trim()) {
      setError('Bag name is required.');
      return;
    }

    const nextBag: InventoryContainer = {
      ...(bag ?? {}),
      id: bag?.id ?? uuidv4(),
      kind: 'bag',
      name: name.trim(),
      icon: icon || 'inventory',
      items,
      carryTask: {
        id: bag?.carryTask?.id ?? uuidv4(),
        name: `Carry ${name.trim()}`,
        taskType: 'CHECK',
        recurrenceMode: normalizeRecurrenceMode(recurrenceMode),
        recurrence,
        reminderLeadDays:
          normalizeRecurrenceMode(recurrenceMode) === 'recurring' && reminderLeadDays !== ''
            ? reminderLeadDays
            : undefined,
      },
      notes: bag?.notes ?? [],
      attachments: bag?.attachments ?? [],
      links: bag?.links ?? [],
    };

    setResource({
      ...resource,
      updatedAt: new Date().toISOString(),
      containers: bag
        ? (resource.containers ?? []).map((container) => (container.id === bag.id ? nextBag : container))
        : [...(resource.containers ?? []), nextBag],
    });

    onBagAdded?.(nextBag.id);
    onClose();
  }

  return (
    <PopupShell title={bag ? 'Edit Bag' : 'Add Bag'} onClose={onClose} size="large">
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
            <div className="mt-4 rounded-xl bg-white px-3 py-3 text-sm text-gray-500 dark:bg-gray-800 dark:text-gray-300">
              Intermittent carry task. No date or reminder settings are needed.
            </div>
          )}

          {normalizeRecurrenceMode(recurrenceMode) === 'recurring' ? (
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
          ) : null}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">Items</div>
            <button
              type="button"
              onClick={() => setShowAddItemPanel(true)}
              className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
            >
              Add Item
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {items.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No items in bag yet.</p>
            ) : items.map((item) => {
              const resolved = resolveInventoryItemTemplate(item.itemTemplateRef, itemTemplates);
              return (
                <div key={item.id} className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                    {resolved?.icon ? <IconDisplay iconKey={resolved.icon} size={16} className="h-4 w-4 shrink-0 object-contain" /> : null}
                    <span>{resolved?.name ?? item.itemTemplateRef}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <label className="font-medium uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">Qty</label>
                    <input
                      type="number"
                      min={0}
                      value={item.quantity ?? 1}
                      onChange={(event) => updateItemQuantity(item.id, Number(event.target.value) || 0)}
                      className={INPUT_CLS}
                    />
                    {item.unit?.trim() ? <span>{item.unit.trim()}</span> : null}
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="ml-auto rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
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
            {bag ? 'Save Bag' : 'Create Bag'}
          </button>
        </div>
      </div>
      {showAddItemPanel ? (
        <AddItemPanel
          resource={resource}
          onClose={() => setShowAddItemPanel(false)}
          onItemInstanceAdded={(item) => {
            setItems((current) => [...current, item]);
            setShowAddItemPanel(false);
          }}
        />
      ) : null}
    </PopupShell>
  );
}
