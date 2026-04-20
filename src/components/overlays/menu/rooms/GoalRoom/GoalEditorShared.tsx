import type { ReactNode } from 'react';
import { IconDisplay } from '../../../../shared/IconDisplay';

export function GoalField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-gray-400">{hint}</p> : null}
    </div>
  );
}

export function GoalProgressBar({ value }: { value: number }) {
  const width = Math.min(100, Math.max(0, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${width}%` }} />
    </div>
  );
}

export function GoalStateBadge({
  state,
}: {
  state: 'active' | 'complete' | 'failed' | 'pending';
}) {
  const label = state === 'failed' ? 'skipped' : state;
  const cls = state === 'complete'
    ? 'bg-green-100 text-green-700'
    : state === 'pending'
      ? 'bg-gray-100 text-gray-600'
    : state === 'failed'
      ? 'bg-red-100 text-red-700'
      : 'bg-blue-100 text-blue-700';

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

export function GoalSection({
  title,
  className,
  contentClassName,
  children,
}: {
  title: string;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={`space-y-3 rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/80 ${className ?? ''}`}>
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
      <div className={contentClassName}>{children}</div>
    </section>
  );
}

export function GoalPageShell({
  title,
  subtitle,
  onBack,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-full border border-gray-300 px-3 py-1 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Back
          </button>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
            {subtitle ? <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4">{children}</div>
      </div>
      {footer ? (
        <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-2">{footer}</div>
        </div>
      ) : null}
    </div>
  );
}

export function GoalInlineMeta({ icon, text }: { icon: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
      <IconDisplay iconKey={icon} size={14} className="h-3.5 w-3.5 object-contain" alt="" />
      <span>{text}</span>
    </span>
  );
}
