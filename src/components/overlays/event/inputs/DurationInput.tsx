import { useState, useEffect, useRef } from 'react';
import type { DurationInputFields } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';

interface DurationInputProps {
  inputFields: DurationInputFields;
  task: Task;
  onComplete: (result: Partial<DurationInputFields>) => void;
}

function fmtSecs(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function DurationInput({ inputFields, task, onComplete }: DurationInputProps) {
  const isComplete = task.completionState === 'complete';
  const { targetDuration, unit } = inputFields;

  const [elapsed, setElapsed] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const firedRef = useRef(false);

  const running = phase === 'running';

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  // Auto-complete when elapsed reaches target
  useEffect(() => {
    if (running && elapsed >= targetDuration) {
      setPhase('done');
      if (!firedRef.current) {
        firedRef.current = true;
        onComplete({ ...inputFields, actualDuration: elapsed });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, running]);

  const handleManualStop = () => {
    setPhase('done');
    if (!firedRef.current) {
      firedRef.current = true;
      onComplete({ ...inputFields, actualDuration: elapsed });
    }
  };

  if (isComplete) {
    const saved = task.resultFields as Partial<DurationInputFields>;
    const actual = saved.actualDuration ?? targetDuration;
    return (
      <div className="flex items-center gap-2 py-2">
        <span className="text-sm font-medium text-green-600 dark:text-green-400">✓ Complete</span>
        <span className="text-xs text-gray-400">
          {fmtSecs(actual)} / {fmtSecs(targetDuration)} {unit}
        </span>
      </div>
    );
  }

  const progress = targetDuration > 0 ? Math.min((elapsed / targetDuration) * 100, 100) : 0;
  const remaining = Math.max(targetDuration - elapsed, 0);

  return (
    <div className="space-y-3 py-1">
      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-1.5 rounded-full bg-purple-500 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Timer display */}
      <div className="flex flex-col items-center gap-0.5 py-2">
        <span className="text-4xl font-bold tabular-nums text-gray-800 dark:text-gray-100">
          {fmtSecs(elapsed)}
        </span>
        <span className="text-xs text-gray-400">
          {remaining > 0 ? `${fmtSecs(remaining)} remaining` : 'Target reached'}
        </span>
      </div>

      {/* Controls */}
      {phase === 'idle' && (
        <button
          type="button"
          onClick={() => setPhase('running')}
          className="w-full rounded-lg bg-purple-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 active:bg-purple-800"
        >
          Start timer
        </button>
      )}

      {phase === 'running' && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPhase('idle')}
            className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Pause
          </button>
          <button
            type="button"
            onClick={handleManualStop}
            className="flex-1 rounded-lg bg-purple-600 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 active:bg-purple-800"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
