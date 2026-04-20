import { useState, useEffect, useRef } from 'react';
import type { TimerInputFields } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';

interface TimerInputProps {
  inputFields: TimerInputFields;
  task: Task;
  onComplete: (result: Partial<TimerInputFields>) => void;
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

export function TimerInput({ inputFields, task, onComplete }: TimerInputProps) {
  const isComplete = task.completionState === 'complete';
  const { countdownFrom } = inputFields;

  const [secondsLeft, setSecondsLeft] = useState(countdownFrom);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const firedRef = useRef(false);

  const running = phase === 'running';

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  // Auto-complete when countdown reaches zero
  useEffect(() => {
    if (running && secondsLeft === 0) {
      setPhase('done');
      if (!firedRef.current) {
        firedRef.current = true;
        onComplete({ countdownFrom });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, running]);

  const handleMarkDone = () => {
    setPhase('done');
    if (!firedRef.current) {
      firedRef.current = true;
      onComplete({ countdownFrom });
    }
  };

  if (isComplete) {
    return (
      <div className="flex items-center gap-2 py-2">
        <span className="text-sm font-medium text-green-600 dark:text-green-400">✓ Complete</span>
        <span className="text-xs text-gray-400">{fmtSecs(countdownFrom)}</span>
      </div>
    );
  }

  const progress = countdownFrom > 0 ? ((countdownFrom - secondsLeft) / countdownFrom) * 100 : 0;

  return (
    <div className="space-y-3 py-1">
      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-1.5 rounded-full bg-purple-500 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Countdown display */}
      <div className="flex flex-col items-center gap-0.5 py-2">
        <span
          className={`text-4xl font-bold tabular-nums transition-colors ${
            secondsLeft <= 10
              ? 'text-orange-500'
              : 'text-gray-800 dark:text-gray-100'
          }`}
        >
          {fmtSecs(secondsLeft)}
        </span>
        {phase === 'idle' && (
          <span className="text-xs text-gray-400">Ready to start</span>
        )}
      </div>

      {/* Controls */}
      {phase === 'idle' && (
        <button
          type="button"
          onClick={() => setPhase('running')}
          className="w-full rounded-lg bg-purple-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 active:bg-purple-800"
        >
          Start countdown
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
            onClick={handleMarkDone}
            className="flex-1 rounded-lg bg-purple-600 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 active:bg-purple-800"
          >
            Done early
          </button>
        </div>
      )}
    </div>
  );
}
