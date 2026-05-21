import { useState } from 'react';
import type { NestedAct } from '../../../../../types';

interface GoalActEditorProps {
  nestedAct: NestedAct;
  onSave: (updated: NestedAct) => void;
  onBack: () => void;
}

const TABS = ['A', 'C', 'T'];
const TAB_TITLES = ['Accountability', 'Commitment', 'Tether'];
const TAB_DESCRIPTIONS = [
  'Check-ins and shared state - coming soon.',
  'Task templates and routines you are committing to regularly.',
  'Links to supporting or dependent plans - coming soon.',
];

export function GoalActEditor({ nestedAct, onSave, onBack }: GoalActEditorProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [trackedTaskRefs, setTrackedTaskRefs] = useState<string[]>(nestedAct.commitment.trackedTaskRefs);
  const [routineRefs, setRoutineRefs] = useState<string[]>(nestedAct.commitment.routineRefs);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-4 pt-3 pb-3 border-b border-white/5">
        <p className="text-white/60 text-xs uppercase tracking-wider">Act</p>
        <p className="text-white/25 text-xs mt-0.5">Your execution layer - how you show up for this goal.</p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col border-r border-white/5 py-2">
          {TABS.map((letter, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={`w-9 h-9 flex items-center justify-center text-xs font-medium transition-colors ${
                activeTab === i
                  ? 'text-white bg-white/8 border-r-2 border-amber-400 -mr-px'
                  : 'text-white/25 hover:text-white/50'
              }`}
            >
              {letter}
            </button>
          ))}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
            <div>
              <p className="text-white/70 text-sm font-medium mb-0.5">{TAB_TITLES[activeTab]}</p>
              <p className="text-white/25 text-xs">{TAB_DESCRIPTIONS[activeTab]}</p>
            </div>

            {activeTab === 0 && (
              <div className="flex items-center justify-center py-8">
                <p className="text-white/15 text-xs">Accountability features coming soon</p>
              </div>
            )}

            {activeTab === 1 && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-white/30 text-xs uppercase tracking-wider">Tracked Task Templates</label>
                  {trackedTaskRefs.map((ref, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        value={ref}
                        onChange={(e) => {
                          const next = [...trackedTaskRefs];
                          next[i] = e.target.value;
                          setTrackedTaskRefs(next);
                        }}
                        placeholder="task-template-id"
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
                      />
                      <button
                        onClick={() => setTrackedTaskRefs(trackedTaskRefs.filter((_, j) => j !== i))}
                        className="text-white/20 hover:text-red-400/60 text-xs px-2"
                      >
                        x
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setTrackedTaskRefs([...trackedTaskRefs, ''])}
                    className="text-white/30 text-xs hover:text-white/50 text-left mt-1"
                  >
                    + Add task ref
                  </button>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-white/30 text-xs uppercase tracking-wider">Routine Slots</label>
                  {routineRefs.map((ref, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        value={ref}
                        onChange={(e) => {
                          const next = [...routineRefs];
                          next[i] = e.target.value;
                          setRoutineRefs(next);
                        }}
                        placeholder="planned-event-id"
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
                      />
                      <button
                        onClick={() => setRoutineRefs(routineRefs.filter((_, j) => j !== i))}
                        className="text-white/20 hover:text-red-400/60 text-xs px-2"
                      >
                        x
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setRoutineRefs([...routineRefs, ''])}
                    className="text-white/30 text-xs hover:text-white/50 text-left mt-1"
                  >
                    + Add routine ref
                  </button>
                </div>
              </div>
            )}

            {activeTab === 2 && (
              <div className="flex items-center justify-center py-8">
                <p className="text-white/15 text-xs">Tether features coming soon</p>
              </div>
            )}
          </div>

          <div className="flex gap-2 px-4 py-3 border-t border-white/5">
            <button
              onClick={activeTab === 0 ? onBack : () => setActiveTab(activeTab - 1)}
              className="px-3 py-2 rounded-lg border border-white/10 text-white/40 text-sm hover:text-white/60"
            >
              {activeTab === 0 ? '<- SMARTER' : '<- Back'}
            </button>
            <div className="flex-1" />
            {activeTab < 2 && (
              <button
                onClick={() => setActiveTab(activeTab + 1)}
                className="px-3 py-2 rounded-lg bg-amber-600/60 text-white/90 text-sm hover:bg-amber-600/80"
              >
                Next -&gt;
              </button>
            )}
            {activeTab === 2 && (
              <button
                onClick={() => onSave({
                  accountability: null,
                  commitment: { trackedTaskRefs, routineRefs },
                  tether: null,
                })}
                className="px-3 py-2 rounded-lg bg-amber-600/60 text-white/90 text-sm hover:bg-amber-600/80"
              >
                Save Act
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
