import { useEffect, useState } from 'react';
import type { ExitStrategyOption, Smarter } from '../../../../../types';
import { IconPicker } from '../../../../shared/IconPicker';

interface GoalSmarterEditorProps {
  smarter: Smarter;
  onSave: (updated: Smarter) => void;
  onProceedToAct: (draft: Smarter) => void;
  onCancel: () => void;
  onDraftChange: (draft: Smarter) => void;
  onDraftClear: () => void;
}

const TABS = ['S', 'M', 'A', 'R', 'T', 'E', 'R'];
const TAB_TITLES = ['Specific', 'Measurable', 'Attainable', 'Relevant', 'Timely', 'Exit Strategy', 'Result'];
const TAB_DESCRIPTIONS = [
  'What exactly are you measuring? Define the target value and unit.',
  'How will you track progress? Link task templates that count toward this goal.',
  'Is this achievable? Note any constraints or prerequisites.',
  'Why does this matter? Connect it to a purpose or stat group.',
  'When does this finish? Set a projected completion date.',
  'What happens if you miss the finish line? Choose your fallback.',
  'What does completion look like? Describe the end state.',
];

export function GoalSmarterEditor({
  smarter,
  onProceedToAct,
  onCancel,
  onDraftChange,
  onDraftClear,
}: GoalSmarterEditorProps) {
  const [name, setName] = useState(smarter.name);
  const [icon, setIcon] = useState(smarter.icon);
  const [activeTab, setActiveTab] = useState(0);
  const [specific, setSpecific] = useState(smarter.specific);
  const [measurableRefs, setMeasurableRefs] = useState<string[]>(smarter.measurable.taskTemplateRefs ?? []);
  const [attainableNote, setAttainableNote] = useState('');
  const [relevantNote, setRelevantNote] = useState('');
  const [projectedFinish, setProjectedFinish] = useState(smarter.timely.projectedFinish ?? '');
  const [onMissedFinish, setOnMissedFinish] = useState(smarter.exitStrategy.onMissedFinish);
  const [resultNote, setResultNote] = useState('');

  function buildDraft(next: Partial<Pick<Smarter, 'name' | 'icon' | 'specific'>> = {}): Smarter {
    return {
      ...smarter,
      name: next.name ?? name,
      icon: next.icon ?? icon,
      specific: next.specific ?? specific,
      measurable: { ...smarter.measurable, taskTemplateRefs: measurableRefs },
      attainable: { ...smarter.attainable, note: attainableNote },
      relevant: { ...smarter.relevant, note: relevantNote },
      timely: { ...smarter.timely, projectedFinish: projectedFinish || null },
      exitStrategy: { onMissedFinish },
      result: { ...smarter.result, note: resultNote },
    };
  }

  useEffect(() => {
    onDraftChange({ ...smarter, name, icon });
    return () => onDraftClear();
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
              onDraftChange(buildDraft({ icon: key }));
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
              onDraftChange(buildDraft({ name: e.target.value }));
            }}
            placeholder="Name this SMARTER"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
          />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col border-r border-white/5 py-2">
          {TABS.map((letter, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={`w-9 h-9 flex items-center justify-center text-xs font-medium transition-colors ${
                activeTab === i
                  ? 'text-white bg-white/8 border-r-2 border-indigo-400 -mr-px'
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
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-white/30 text-xs uppercase tracking-wider">Target</label>
                    <input
                      type="number"
                      value={specific.targetValue}
                      onChange={(e) => {
                        const next = { ...specific, targetValue: Number(e.target.value) };
                        setSpecific(next);
                        onDraftChange(buildDraft({ specific: next }));
                      }}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-white/25"
                    />
                  </div>
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-white/30 text-xs uppercase tracking-wider">Unit</label>
                    <input
                      value={specific.unit ?? ''}
                      onChange={(e) => {
                        const next = { ...specific, unit: e.target.value || null };
                        setSpecific(next);
                        onDraftChange(buildDraft({ specific: next }));
                      }}
                      placeholder="kg, sessions..."
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-white/30 text-xs uppercase tracking-wider">Source</label>
                  <select
                    value={specific.sourceType}
                    onChange={(e) => {
                      const next = { ...specific, sourceType: e.target.value as 'taskInput' | 'resourceRef' };
                      setSpecific(next);
                      onDraftChange(buildDraft({ specific: next }));
                    }}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-white/25"
                  >
                    <option value="taskInput">Task Input</option>
                    <option value="resourceRef">Resource Reference</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === 1 && (
              <div className="flex flex-col gap-2">
                {measurableRefs.map((ref, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={ref}
                      onChange={(e) => {
                        const next = [...measurableRefs];
                        next[i] = e.target.value;
                        setMeasurableRefs(next);
                        onDraftChange({ ...buildDraft(), measurable: { ...smarter.measurable, taskTemplateRefs: next } });
                      }}
                      placeholder="task-template-id"
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
                    />
                    <button
                      onClick={() => {
                        const next = measurableRefs.filter((_, j) => j !== i);
                        setMeasurableRefs(next);
                        onDraftChange({ ...buildDraft(), measurable: { ...smarter.measurable, taskTemplateRefs: next } });
                      }}
                      className="text-white/20 hover:text-red-400/60 text-xs px-2"
                    >
                      x
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    const next = [...measurableRefs, ''];
                    setMeasurableRefs(next);
                    onDraftChange({ ...buildDraft(), measurable: { ...smarter.measurable, taskTemplateRefs: next } });
                  }}
                  className="text-white/30 text-xs hover:text-white/50 text-left mt-1"
                >
                  + Add task ref
                </button>
              </div>
            )}

            {activeTab === 2 && (
              <textarea
                value={attainableNote}
                onChange={(e) => {
                  setAttainableNote(e.target.value);
                  onDraftChange({ ...buildDraft(), attainable: { ...smarter.attainable, note: e.target.value } });
                }}
                placeholder="Note any constraints or prerequisites..."
                rows={4}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25 resize-none"
              />
            )}

            {activeTab === 3 && (
              <textarea
                value={relevantNote}
                onChange={(e) => {
                  setRelevantNote(e.target.value);
                  onDraftChange({ ...buildDraft(), relevant: { ...smarter.relevant, note: e.target.value } });
                }}
                placeholder="Why does this matter to you?"
                rows={4}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25 resize-none"
              />
            )}

            {activeTab === 4 && (
              <div className="flex flex-col gap-1">
                <label className="text-white/30 text-xs uppercase tracking-wider">Projected Finish</label>
                <input
                  type="date"
                  value={projectedFinish}
                  onChange={(e) => {
                    setProjectedFinish(e.target.value);
                    onDraftChange({ ...buildDraft(), timely: { ...smarter.timely, projectedFinish: e.target.value || null } });
                  }}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-white/25"
                />
              </div>
            )}

            {activeTab === 5 && (
              <div className="flex flex-col gap-1">
                <label className="text-white/30 text-xs uppercase tracking-wider">On Missed Finish</label>
                <select
                  value={onMissedFinish}
                  onChange={(e) => {
                    const next = e.target.value as ExitStrategyOption;
                    setOnMissedFinish(next);
                    onDraftChange({ ...buildDraft(), exitStrategy: { onMissedFinish: next } });
                  }}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-white/25"
                >
                  <option value="sleep">Sleep - pause until resumed</option>
                  <option value="restart">Restart - begin again</option>
                  <option value="extend">Extend - push the deadline</option>
                  <option value="reschedule">Reschedule - pick a new date</option>
                </select>
              </div>
            )}

            {activeTab === 6 && (
              <textarea
                value={resultNote}
                onChange={(e) => {
                  setResultNote(e.target.value);
                  onDraftChange({ ...buildDraft(), result: { ...smarter.result, note: e.target.value } });
                }}
                placeholder="Describe what completion looks like..."
                rows={4}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25 resize-none"
              />
            )}
          </div>

          <div className="flex gap-2 px-4 py-3 border-t border-white/5">
            {activeTab > 0 && (
              <button
                onClick={() => setActiveTab(activeTab - 1)}
                className="px-3 py-2 rounded-lg border border-white/10 text-white/40 text-sm hover:text-white/60"
              >
                Back
              </button>
            )}
            {activeTab === 0 && (
              <button
                onClick={onCancel}
                className="px-3 py-2 rounded-lg border border-white/10 text-white/40 text-sm hover:text-white/60"
              >
                Cancel
              </button>
            )}
            <div className="flex-1" />
            {activeTab < 6 && (
              <button
                onClick={() => setActiveTab(activeTab + 1)}
                className="px-3 py-2 rounded-lg bg-indigo-600/60 text-white/90 text-sm hover:bg-indigo-600/80"
              >
                Next
              </button>
            )}
            {activeTab === 6 && (
              <button
                onClick={() => onProceedToAct(buildDraft())}
                disabled={!name.trim()}
                className="px-3 py-2 rounded-lg bg-indigo-600/60 text-white/90 text-sm hover:bg-indigo-600/80 disabled:opacity-30"
              >
                Next -&gt; Act
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
