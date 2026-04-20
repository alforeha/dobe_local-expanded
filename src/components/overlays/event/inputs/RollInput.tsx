import { useState } from 'react';
import type { RollInputFields } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';
import { isEarlyBirdActive } from '../../../../engine/xpBoosts';

interface RollInputProps {
  inputFields: RollInputFields;
  task: Task;
  onComplete: (result: Partial<RollInputFields>) => void;
}

const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/**
 * D78 — ROLL task input.
 * System-generated result (1–sides). User taps to roll. Locked on complete.
 * Result displays die face + early-bird bonus when applicable.
 */
export function RollInput({ inputFields, task, onComplete }: RollInputProps) {
  const isComplete = task.completionState === 'complete';
  const sides = inputFields.sides ?? 6;
  const existingResult = (task.resultFields as Partial<RollInputFields>).result;

  const [rolling, setRolling] = useState(false);
  const [animFace, setAnimFace] = useState<string | null>(null);

  function roll() {
    if (isComplete || rolling) return;
    setRolling(true);

    // Short visual animation — cycle faces rapidly then settle on real result
    const earlyBirdBonus = isEarlyBirdActive() ? 1 : 0;
    const rawResult = Math.floor(Math.random() * sides) + 1;
    const result = rawResult + earlyBirdBonus;
    const boostApplied = earlyBirdBonus > 0 ? '+1' : undefined;
    let ticks = 0;
    const maxTicks = 12;
    const id = window.setInterval(() => {
      const fakeFace = Math.floor(Math.random() * Math.min(sides, 6));
      setAnimFace(DIE_FACES[fakeFace] ?? '🎲');
      ticks++;
      if (ticks >= maxTicks) {
        window.clearInterval(id);
        setAnimFace(null);
        setRolling(false);
        onComplete({ sides, result, boostApplied });
      }
    }, 80);
  }

  const displayResult = existingResult ?? (task.resultFields as Partial<RollInputFields>).result;
  const displayBoost = (task.resultFields as Partial<RollInputFields>).boostApplied;
  const dieFace = displayResult && displayResult >= 1 && displayResult <= 6
    ? DIE_FACES[displayResult - 1]
    : '🎲';

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {isComplete ? (
        <div className="flex flex-col items-center gap-2">
          <span className="text-6xl select-none">{dieFace}</span>
          <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
            Rolled {displayResult}{displayBoost ? ` ${displayBoost}` : ''}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Today&apos;s roll is locked</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <span className="text-6xl select-none transition-transform duration-75">
            {rolling ? (animFace ?? '🎲') : '🎲'}
          </span>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Roll a d{sides} for today&apos;s XP boost
          </p>
          <button
            type="button"
            disabled={rolling}
            onClick={roll}
            className={`rounded-full px-6 py-2 text-sm font-semibold transition-colors
              ${rolling
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'
                : 'bg-purple-600 text-white hover:bg-purple-700 active:bg-purple-800'
              }`}
          >
            {rolling ? 'Rolling…' : 'Roll the dice'}
          </button>
        </div>
      )}
    </div>
  );
}
