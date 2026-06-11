// ─────────────────────────────────────────
// HolidaysTab — Events tab Holidays view (Sprint 4, A3 — STUB).
// Labeled placeholder in habitat style. Structured to receive
// coach/HolidayLibrary blocks: when the library lands, each block renders as
// a Routine-style card that pushes to a one-off event via PlannedEventBlock's
// existing push-to-one-off mechanic.
// ─────────────────────────────────────────

import { holidayLibrary } from '../../../../../coach/HolidayLibrary';
import { IconDisplay } from '../../../../shared/IconDisplay';

export function HolidaysTab() {
  if (holidayLibrary.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Holidays</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Holiday blocks with prebuilt task lists land here — push them straight to a one-off event.
          </p>
          <span className="mt-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
            Coming soon
          </span>
        </div>
      </div>
    );
  }

  // Working version (next sprint): Routine-style cards per HolidayBlock with a
  // push-to-one-off action reusing PlannedEventBlock's flow.
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
      {holidayLibrary.map((holiday) => (
        <div
          key={holiday.id}
          className="flex flex-row items-stretch overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">
            <IconDisplay iconKey={holiday.icon} size={32} className="h-8 w-8 shrink-0 object-contain" alt="" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                {holiday.name}
              </p>
              <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-300">
                {holiday.description}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
