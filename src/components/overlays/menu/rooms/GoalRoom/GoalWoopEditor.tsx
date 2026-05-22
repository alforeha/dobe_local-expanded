import { useEffect, useState } from 'react';
import type { Woop } from '../../../../../types';
import { IconPicker } from '../../../../shared/IconPicker';
import { BANK_COLORS, analyzeWoopText, type WoopBankMatch } from './woopKeywordEngine';

const TABS = ['W', 'O', 'O', 'P'];
const TAB_LABELS = ['Wish', 'Outcome', 'Obstacle', 'Plans'];
const TAB_DESCRIPTIONS = [
  'What do you wish for? State your intention clearly.',
  'What does success feel like? Describe the mental imagery.',
  'What stands in your way? Name the blocker.',
  'SMARTER plans attached to this WOOP.',
];

function buildGradient(
  wishSeq: WoopBankMatch[],
  outcomeSeq: WoopBankMatch[],
  obstacleSeq: WoopBankMatch[],
  activeTab: number,
): string {
  // Combine all sequences in field order
  const allSeq = [...wishSeq, ...outcomeSeq, ...obstacleSeq];
  if (allSeq.length === 0) return 'transparent';

  const isPTab = activeTab === 3;
  const count = allSeq.length;

  // Build color list in order
  const colors = allSeq.map((bank, i) => {
    const baseColor = BANK_COLORS[bank];
    const fieldTab = i < wishSeq.length
      ? 0
      : i < wishSeq.length + outcomeSeq.length
      ? 1
      : 2;
    const isActive = fieldTab === activeTab;
    const alpha = isPTab ? 0.20 : isActive ? 0.22 : 0.07;
    return baseColor.replace('1)', `${alpha})`);
  });

  if (count === 1) {
    // Single color - smooth top fade
    return `linear-gradient(to bottom, ${colors[0]}, transparent)`;
  }

  // Multi-color - smooth left-to-right blend, overall top-to-bottom fade handled by opacity
  return `linear-gradient(to right, ${colors.join(', ')})`;
}

interface GoalWoopEditorProps {
  woop: Woop;
  onSave: (updated: Woop) => void;
  onCancel: () => void;
  onDraftChange: (draft: Woop) => void;
  onDraftClear: () => void;
}

export function GoalWoopEditor({ woop, onSave, onCancel, onDraftChange, onDraftClear }: GoalWoopEditorProps) {
  const [name, setName] = useState(woop.name);
  const [wish, setWish] = useState(woop.wish);
  const [outcome, setOutcome] = useState<string[]>(woop.outcome);
  const [obstacle, setObstacle] = useState<string[]>(woop.obstacle);
  const [icon, setIcon] = useState(woop.icon);
  const [activeTab, setActiveTab] = useState(0);
  const [wishSeq, setWishSeq] = useState<WoopBankMatch[]>(() => analyzeWoopText(woop.wish));
  const [outcomeSeq, setOutcomeSeq] = useState<WoopBankMatch[]>(() => analyzeWoopText(woop.outcome.join(' ')));
  const [obstacleSeq, setObstacleSeq] = useState<WoopBankMatch[]>(() => analyzeWoopText(woop.obstacle.join(' ')));

  useEffect(() => {
    return () => onDraftClear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onDraftChange({ ...woop, name, wish, outcome, obstacle, icon });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-end gap-3 px-4 pt-3 pb-3 border-b border-white/5">
        <div className="flex flex-col gap-1">
          <label className="text-white/30 text-xs uppercase tracking-wider">Icon</label>
          <IconPicker
            value={icon}
            onChange={(key) => {
              setIcon(key);
              onDraftChange({ ...woop, name, wish, outcome, obstacle, icon: key });
            }}
            align="left"
            forceUpward
          />
        </div>
        <div className="flex-1 flex flex-col gap-1">
          <label className="text-white/30 text-xs uppercase tracking-wider">Name</label>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              onDraftChange({ ...woop, name: e.target.value, wish, outcome, obstacle, icon });
            }}
            placeholder="Name this WOOP"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
          />
        </div>
      </div>

      <div className="flex border-b border-white/5">
        {TABS.map((letter, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
              activeTab === i
                ? 'text-white border-indigo-400'
                : 'text-white/25 border-transparent hover:text-white/50'
            }`}
          >
            {letter}
          </button>
        ))}
      </div>

      <div
        className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 transition-all duration-700"
        style={{
          background: `linear-gradient(to bottom, transparent 60%, rgba(15,15,25,0.96) 100%),
    ${buildGradient(wishSeq, outcomeSeq, obstacleSeq, activeTab)}`,
          transition: 'background 0.7s ease',
        }}
      >
        <div>
          <p className="text-white/70 text-sm font-medium mb-0.5">{TAB_LABELS[activeTab]}</p>
          <p className="text-white/25 text-xs">{TAB_DESCRIPTIONS[activeTab]}</p>
        </div>

        {activeTab === 0 && (
          <textarea
            value={wish}
            onChange={(e) => {
              setWish(e.target.value);
              onDraftChange({ ...woop, name, wish: e.target.value, outcome, obstacle, icon });
              setWishSeq(analyzeWoopText(e.target.value));
            }}
            placeholder="I wish to..."
            rows={5}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25 resize-none"
          />
        )}

        {activeTab === 1 && (
          <div className="flex flex-col gap-2">
            {outcome.map((o, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={o}
                  onChange={(e) => {
                    const next = [...outcome];
                    next[i] = e.target.value;
                    setOutcome(next);
                    onDraftChange({ ...woop, name, wish, outcome: next, obstacle, icon });
                    setOutcomeSeq(analyzeWoopText(next.join(' ')));
                  }}
                  placeholder={`Outcome ${i + 1}`}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
                />
                <button
                  onClick={() => {
                    const next = outcome.filter((_, j) => j !== i);
                    setOutcome(next);
                    onDraftChange({ ...woop, name, wish, outcome: next, obstacle, icon });
                    setOutcomeSeq(analyzeWoopText(next.join(' ')));
                  }}
                  className="text-white/20 hover:text-red-400/60 text-xs px-2"
                >
                  x
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                const next = [...outcome, ''];
                setOutcome(next);
                onDraftChange({ ...woop, name, wish, outcome: next, obstacle, icon });
              }}
              className="text-white/30 text-xs hover:text-white/50 text-left mt-1"
            >
              + Add outcome
            </button>
          </div>
        )}

        {activeTab === 2 && (
          <div className="flex flex-col gap-2">
            {obstacle.map((o, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={o}
                  onChange={(e) => {
                    const next = [...obstacle];
                    next[i] = e.target.value;
                    setObstacle(next);
                    onDraftChange({ ...woop, name, wish, outcome, obstacle: next, icon });
                    setObstacleSeq(analyzeWoopText(next.join(' ')));
                  }}
                  placeholder={`Obstacle ${i + 1}`}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
                />
                <button
                  onClick={() => {
                    const next = obstacle.filter((_, j) => j !== i);
                    setObstacle(next);
                    onDraftChange({ ...woop, name, wish, outcome, obstacle: next, icon });
                    setObstacleSeq(analyzeWoopText(next.join(' ')));
                  }}
                  className="text-white/20 hover:text-red-400/60 text-xs px-2"
                >
                  x
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                const next = [...obstacle, ''];
                setObstacle(next);
                onDraftChange({ ...woop, name, wish, outcome, obstacle: next, icon });
              }}
              className="text-white/30 text-xs hover:text-white/50 text-left mt-1"
            >
              + Add obstacle
            </button>
          </div>
        )}

        {activeTab === 3 && (
          <div className="flex flex-col gap-2">
            <p className="text-white/25 text-xs">SMARTERs are added after saving this WOOP.</p>
          </div>
        )}
      </div>

      <div className="flex gap-2 px-4 py-3 border-t border-white/5">
        {activeTab === 0 ? (
          <button
            onClick={() => {
              onDraftClear();
              onCancel();
            }}
            className="px-3 py-2 rounded-lg border border-white/10 text-white/40 text-sm hover:text-white/60"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={() => setActiveTab(activeTab - 1)}
            className="px-3 py-2 rounded-lg border border-white/10 text-white/40 text-sm hover:text-white/60"
          >
            &larr; Back
          </button>
        )}
        <div className="flex-1" />
        {activeTab < 3 ? (
          <button
            onClick={() => setActiveTab(activeTab + 1)}
            className="px-3 py-2 rounded-lg bg-indigo-600/60 text-white/90 text-sm hover:bg-indigo-600/80"
          >
            Next &rarr;
          </button>
        ) : (
          <button
            onClick={() => onSave({ ...woop, name, wish, outcome, obstacle, icon })}
            disabled={!wish.trim()}
            className="px-3 py-2 rounded-lg bg-indigo-600/60 text-white/90 text-sm hover:bg-indigo-600/80 disabled:opacity-30"
          >
            Save WOOP
          </button>
        )}
      </div>
    </div>
  );
}
