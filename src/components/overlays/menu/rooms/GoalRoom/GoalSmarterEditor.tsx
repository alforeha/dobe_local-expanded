import { useEffect, useState } from 'react';
import type { ExitStrategyOption, Smarter } from '../../../../../types';
import type { Weekday } from '../../../../../types/taskTemplate';
import { CustomSelect } from './CustomSelect';
import { IconPicker } from '../../../../shared/IconPicker';

interface GoalSmarterEditorProps {
  smarter: Smarter;
  woopOutcomes: string[];
  woopObstacles: string[];
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
  woopOutcomes,
  woopObstacles,
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
  const [checkInFrequency, setCheckInFrequency] = useState<'daily' | 'weekly' | 'monthly'>(
    (smarter.timely.interval?.frequency as 'daily' | 'weekly' | 'monthly') ?? 'weekly'
  );
  const [checkInEvery, setCheckInEvery] = useState<number>(smarter.timely.interval?.interval ?? 1);
  const [checkInWeekday, setCheckInWeekday] = useState<Weekday>(
    smarter.timely.interval?.days?.[0] ?? 'mon'
  );
  const [checkInMonthDay, setCheckInMonthDay] = useState<number>(
    smarter.timely.interval?.monthlyDay ?? 1
  );
  const [statGroup, setStatGroup] = useState<string>(
    (smarter.relevant as Record<string, string>).statGroup ?? ''
  );
  const [resolvesType, setResolvesType] = useState<'outcome' | 'obstacle' | ''>('');
  const [resolvesIdx, setResolvesIdx] = useState<number>(-1);
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
      relevant: {
        ...smarter.relevant,
        note: relevantNote,
        statGroup: statGroup || undefined,
        resolvesType: resolvesType || undefined,
        resolvesIdx: resolvesIdx >= 0 ? resolvesIdx : undefined,
      },
      timely: {
        ...smarter.timely,
        projectedFinish: projectedFinish || null,
        interval: projectedFinish ? {
          frequency: checkInFrequency,
          days: checkInFrequency === 'weekly' ? [checkInWeekday] : [],
          interval: checkInFrequency === 'daily' ? checkInEvery : 1,
          monthlyDay: checkInFrequency === 'monthly' ? checkInMonthDay : null,
          endsOn: projectedFinish,
          customCondition: null,
        } : null,
      },
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
                  <CustomSelect
                    value={specific.sourceType}
                    onChange={(val) => setSpecific({ ...specific, sourceType: val as 'taskInput' | 'resourceRef' })}
                    options={[
                      { value: 'taskInput', label: 'Task Input' },
                      { value: 'resourceRef', label: 'Resource Reference' },
                    ]}
                  />
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
              <div className="flex flex-col gap-3">
                {/* Why it matters */}
                <textarea
                  value={relevantNote}
                  onChange={(e) => setRelevantNote(e.target.value)}
                  placeholder="Why does this matter to you?"
                  rows={2}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25 resize-none"
                />

                {/* Stat group */}
                <div className="flex flex-col gap-1">
                  <label className="text-white/30 text-xs uppercase tracking-wider">Stat Group</label>
                  <CustomSelect
                    value={statGroup}
                    onChange={setStatGroup}
                    options={[
                      { value: '', label: 'None' },
                      { value: 'health', label: 'Health' },
                      { value: 'strength', label: 'Strength' },
                      { value: 'agility', label: 'Agility' },
                      { value: 'defense', label: 'Defense' },
                      { value: 'charisma', label: 'Charisma' },
                      { value: 'wisdom', label: 'Wisdom' },
                    ]}
                  />
                </div>

                {/* Resolves - which outcome or obstacle */}
                {(woopOutcomes.length > 0 || woopObstacles.length > 0) && (
                  <div className="flex flex-col gap-1">
                    <label className="text-white/30 text-xs uppercase tracking-wider">Resolves</label>
                    <CustomSelect
                      value={resolvesType === '' ? '' : `${resolvesType}-${resolvesIdx}`}
                      onChange={(val) => {
                        if (!val) { setResolvesType(''); setResolvesIdx(-1); return; }
                        const [type, idx] = val.split('-');
                        setResolvesType(type as 'outcome' | 'obstacle');
                        setResolvesIdx(Number(idx));
                      }}
                      options={[
                        { value: '', label: 'Not linked' },
                        ...woopOutcomes.map((o, i) => ({
                          value: `outcome-${i}`,
                          label: `Outcome: ${o.slice(0, 40)}${o.length > 40 ? '...' : ''}`,
                        })),
                        ...woopObstacles.map((o, i) => ({
                          value: `obstacle-${i}`,
                          label: `Obstacle: ${o.slice(0, 40)}${o.length > 40 ? '...' : ''}`,
                        })),
                      ]}
                      placeholder="Not linked"
                    />
                  </div>
                )}
              </div>
            )}

            {activeTab === 4 && (
              <div className="flex flex-col gap-3">
                {/* End date */}
                <div className="flex flex-col gap-1">
                  <label className="text-white/30 text-xs uppercase tracking-wider">Target Finish Date</label>
                  <input
                    type="date"
                    value={projectedFinish}
                    onChange={(e) => setProjectedFinish(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-white/25"
                  />
                </div>

                {/* Check-in recurrence */}
                <div className="flex gap-2">
                  {/* Frequency - left */}
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-white/30 text-xs uppercase tracking-wider">Frequency</label>
                    <CustomSelect
                      value={checkInFrequency}
                      onChange={(val) => setCheckInFrequency(val as 'daily' | 'weekly' | 'monthly')}
                      options={[
                        { value: 'daily', label: 'Daily' },
                        { value: 'weekly', label: 'Weekly' },
                        { value: 'monthly', label: 'Monthly' },
                      ]}
                    />
                  </div>

                  {/* Context-aware right field */}
                  <div className="flex flex-col gap-1 flex-1">
                    {checkInFrequency === 'daily' && (
                      <>
                        <label className="text-white/30 text-xs uppercase tracking-wider">Every N Days</label>
                        <input
                          type="number"
                          min={1}
                          value={checkInEvery}
                          onChange={(e) => setCheckInEvery(Math.max(1, Number(e.target.value)))}
                          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-white/25"
                        />
                      </>
                    )}
                    {checkInFrequency === 'weekly' && (
                      <>
                        <label className="text-white/30 text-xs uppercase tracking-wider">On</label>
                        <CustomSelect
                          value={checkInWeekday}
                          onChange={(val) => setCheckInWeekday(val as Weekday)}
                          options={[
                            { value: 'mon', label: 'Monday' },
                            { value: 'tue', label: 'Tuesday' },
                            { value: 'wed', label: 'Wednesday' },
                            { value: 'thu', label: 'Thursday' },
                            { value: 'fri', label: 'Friday' },
                            { value: 'sat', label: 'Saturday' },
                            { value: 'sun', label: 'Sunday' },
                          ]}
                        />
                      </>
                    )}
                    {checkInFrequency === 'monthly' && (
                      <>
                        <label className="text-white/30 text-xs uppercase tracking-wider">Day of Month</label>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={checkInMonthDay}
                          onChange={(e) => setCheckInMonthDay(Math.min(31, Math.max(1, Number(e.target.value))))}
                          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-white/25"
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* Check-in preview */}
                {projectedFinish ? (() => {
                  const end = new Date(projectedFinish);
                  const now = new Date();
                  const diffDays = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
                  const periodDays = checkInFrequency === 'daily'
                    ? checkInEvery
                    : checkInFrequency === 'weekly'
                    ? 7
                    : 30;
                  const totalCheckins = Math.max(1, Math.floor(diffDays / periodDays));
                  const progressPerCheckin = Math.round(100 / totalCheckins);
                  return (
                    <div className="rounded-lg border border-white/10 px-3 py-2 bg-white/3">
                      <p className="text-white/40 text-xs">
                        {totalCheckins} check-in{totalCheckins !== 1 ? 's' : ''} expected -{' '}
                        ~{progressPerCheckin}% progress each
                      </p>
                    </div>
                  );
                })() : (
                  <p className="text-white/20 text-xs">Set a finish date to see check-in preview</p>
                )}
              </div>
            )}

            {activeTab === 5 && (
              <div className="flex flex-col gap-1">
                <label className="text-white/30 text-xs uppercase tracking-wider">On Missed Finish</label>
                <CustomSelect
                  value={onMissedFinish}
                  onChange={(val) => setOnMissedFinish(val as ExitStrategyOption)}
                  options={[
                    { value: 'sleep', label: 'Sleep — pause until resumed' },
                    { value: 'restart', label: 'Restart — begin again' },
                    { value: 'extend', label: 'Extend — push the deadline' },
                    { value: 'reschedule', label: 'Reschedule — pick a new date' },
                  ]}
                />
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
