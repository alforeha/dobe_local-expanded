import { useEffect, useState } from 'react';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import type { ExitStrategyOption, GoalType, QuestSourceType, Smarter } from '../../../../../types';
import type { Weekday } from '../../../../../types/taskTemplate';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { TaskPoolAddPanel } from '../ScheduleRoom/TaskPoolAddPanel';
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

type TimelyDraft = Smarter['timely'] & {
  startDate?: string;
  completionsPerCheckin?: number;
};

export function GoalSmarterEditor({
  smarter,
  woopOutcomes,
  woopObstacles,
  onProceedToAct,
  onCancel,
  onDraftChange,
  onDraftClear,
}: GoalSmarterEditorProps) {
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);
  const [name, setName] = useState(smarter.name);
  const [icon, setIcon] = useState(smarter.icon);
  const [activeTab, setActiveTab] = useState(0);
  const [specific, setSpecific] = useState({
    ...smarter.specific,
    goalType: smarter.specific.goalType ?? 'numeric',
    startValue: smarter.specific.startValue ?? null,
  });
  const [measurableRefs, setMeasurableRefs] = useState<string[]>(smarter.measurable.taskTemplateRefs ?? []);
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [taskNames, setTaskNames] = useState<Record<string, string>>({});
  const [confirmRemoveRef, setConfirmRemoveRef] = useState<string | null>(null);
  const [feasibilityPct, setFeasibilityPct] = useState<number>(
    (smarter.attainable as Record<string, number>).feasibilityPct ?? 100
  );
  const [takesLonger, setTakesLonger] = useState<boolean>(
    (smarter.attainable as Record<string, boolean>).takesLonger ?? false
  );
  const [neededItems, setNeededItems] = useState<string[]>(
    (smarter.attainable as Record<string, string[]>).neededItems ?? []
  );
  const [projectedFinish, setProjectedFinish] = useState(smarter.timely.projectedFinish ?? '');
  const [checkInFrequency, setCheckInFrequency] = useState<'daily' | 'weekly' | 'monthly'>(
    smarter.timely.interval?.frequency === 'daily' ||
    smarter.timely.interval?.frequency === 'weekly' ||
    smarter.timely.interval?.frequency === 'monthly'
      ? smarter.timely.interval.frequency
      : 'weekly'
  );
  const [checkInEvery, setCheckInEvery] = useState<number>(smarter.timely.interval?.interval ?? 1);
  const [checkInWeekday, setCheckInWeekday] = useState<Weekday>(
    smarter.timely.interval?.days?.[0] ?? 'mon'
  );
  const [checkInMonthDay, setCheckInMonthDay] = useState<number>(
    smarter.timely.interval?.monthlyDay ?? 1
  );
  const [startDate, setStartDate] = useState<string>(
    (smarter.timely as TimelyDraft).startDate ?? new Date().toISOString().slice(0, 10)
  );
  const [completionsPerCheckin, setCompletionsPerCheckin] = useState<number>(
    (smarter.timely as TimelyDraft).completionsPerCheckin ?? 1
  );
  const [statGroup, setStatGroup] = useState<string>(
    (smarter.relevant as Record<string, string>).statGroup ?? ''
  );
  const [resolvesType, setResolvesType] = useState<'outcome' | 'obstacle' | ''>(
    (smarter.relevant as Record<string, string>).resolvesType as 'outcome' | 'obstacle' | '' ?? ''
  );
  const [resolvesIdx, setResolvesIdx] = useState<number>(
    (smarter.relevant as Record<string, number>).resolvesIdx ?? -1
  );
  const [onMissedFinish, setOnMissedFinish] = useState(smarter.exitStrategy.onMissedFinish);
  const [resultDescription, setResultDescription] = useState<string>(
    (smarter.result as Record<string, string>).description ?? ''
  );
  const [resultItemRef, setResultItemRef] = useState<string>(
    (smarter.result as Record<string, string>).itemRef ?? ''
  );
  const [resultExecutesTether, setResultExecutesTether] = useState<boolean>(
    (smarter.result as Record<string, boolean>).executesTether ?? false
  );

  function buildDraft(next: Partial<Pick<Smarter, 'name' | 'icon' | 'specific'>> = {}): Smarter {
    return {
      ...smarter,
      name: next.name ?? name,
      icon: next.icon ?? icon,
      specific: next.specific ?? specific,
      measurable: {
        ...smarter.measurable,
        taskTemplateRefs: measurableRefs,
      },
      attainable: {
        ...smarter.attainable,
        feasibilityPct,
        takesLonger,
        neededItems,
      },
      relevant: {
        ...smarter.relevant,
        statGroup: statGroup || undefined,
        resolvesType: resolvesType || undefined,
        resolvesIdx: resolvesIdx >= 0 ? resolvesIdx : undefined,
      },
      timely: ({
        ...smarter.timely,
        projectedFinish: projectedFinish || null,
        startDate,
        completionsPerCheckin,
        interval: projectedFinish ? {
          frequency: checkInFrequency,
          days: checkInFrequency === 'weekly' ? [checkInWeekday] : [],
          interval: checkInFrequency === 'daily' ? checkInEvery : 1,
          monthlyDay: checkInFrequency === 'monthly' ? checkInMonthDay : null,
          endsOn: projectedFinish,
          customCondition: null,
        } : null,
      }) as TimelyDraft,
      exitStrategy: { onMissedFinish },
      result: {
        ...smarter.result,
        description: resultDescription || undefined,
        itemRef: resultItemRef || undefined,
        executesTether: resultExecutesTether || undefined,
      },
    };
  }

  function deriveSourceType(goalType: GoalType): QuestSourceType {
    return goalType === 'resourceLinked' || goalType === 'acquisition'
      ? 'resourceRef'
      : 'taskInput';
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
                {/* Goal type selector — drives everything below */}
                <div className="flex flex-col gap-1">
                  <label className="text-white/30 text-xs uppercase tracking-wider">Goal Type</label>
                  <CustomSelect
                    value={specific.goalType ?? 'numeric'}
                    onChange={(val) => {
                      const goalType = val as GoalType;
                      const next = {
                        ...specific,
                        goalType,
                        sourceType: deriveSourceType(goalType),
                      };
                      setSpecific(next);
                      onDraftChange(buildDraft({ specific: next }));
                    }}
                    options={[
                      { value: 'numeric', label: 'Numeric — log a value toward a target' },
                      { value: 'taskCount', label: 'Task Count — complete X tasks' },
                      { value: 'resourceLinked', label: 'Resource Linked — track a resource property' },
                      { value: 'progression', label: 'Progression — milestone-based % completion' },
                      { value: 'binary', label: 'Binary — done or not done' },
                      { value: 'streak', label: 'Streak — consecutive completions' },
                      { value: 'reduction', label: 'Reduction — bring a value down' },
                      { value: 'acquisition', label: 'Acquisition — collect or accumulate items' },
                    ]}
                  />
                </div>

                {/* Numeric / Reduction / Streak — target + unit + start value */}
                {(specific.goalType === 'numeric' || specific.goalType === 'reduction' || specific.goalType === 'streak') && (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-white/30 text-xs uppercase tracking-wider">
                          {specific.goalType === 'reduction' ? 'Target Max' : 'Target'}
                        </label>
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
                          placeholder="lbs, hrs, days..."
                          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
                        />
                      </div>
                    </div>
                    {specific.goalType !== 'streak' && (
                      <div className="flex flex-col gap-1">
                        <label className="text-white/30 text-xs uppercase tracking-wider">Starting Value</label>
                        <input
                          type="number"
                          value={specific.startValue ?? ''}
                          onChange={(e) => {
                            const next = { ...specific, startValue: e.target.value ? Number(e.target.value) : null };
                            setSpecific(next);
                            onDraftChange(buildDraft({ specific: next }));
                          }}
                          placeholder="Where are you starting from?"
                          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
                        />
                      </div>
                    )}
                    {specific.goalType === 'reduction' && (
                      <p className="text-white/25 text-xs">Progress tracks downward — you succeed when value reaches or drops below the target.</p>
                    )}
                    {specific.goalType === 'streak' && (
                      <p className="text-white/25 text-xs">Target is the number of consecutive completions needed. Breaking the streak resets progress.</p>
                    )}
                  </div>
                )}

                {/* Task Count */}
                {specific.goalType === 'taskCount' && (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-white/30 text-xs uppercase tracking-wider">Target Completions</label>
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
                          placeholder="pages, reps..."
                          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
                        />
                      </div>
                    </div>
                    <p className="text-white/25 text-xs">Tracked tasks in the Measurable tab count toward this total.</p>
                  </div>
                )}

                {/* Binary */}
                {specific.goalType === 'binary' && (
                  <div className="rounded-lg border border-white/10 px-3 py-3 bg-white/3">
                    <p className="text-white/50 text-sm">This goal is complete when you mark it done.</p>
                    <p className="text-white/25 text-xs mt-1">No numeric target needed — completion is the milestone.</p>
                  </div>
                )}

                {/* Progression */}
                {specific.goalType === 'progression' && (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-white/30 text-xs uppercase tracking-wider">Milestone Count</label>
                      <input
                        type="number"
                        min={1}
                        value={specific.targetValue}
                        onChange={(e) => {
                          const next = { ...specific, targetValue: Number(e.target.value) };
                          setSpecific(next);
                          onDraftChange(buildDraft({ specific: next }));
                        }}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-white/25"
                      />
                    </div>
                    <p className="text-white/25 text-xs">Each check-in is a milestone. Goal completes when all milestones are reached.</p>
                  </div>
                )}

                {/* Resource Linked */}
                {specific.goalType === 'resourceLinked' && (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-white/30 text-xs uppercase tracking-wider">Target Value</label>
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
                          placeholder="$, items..."
                          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-white/30 text-xs uppercase tracking-wider">Resource Ref</label>
                      <input
                        value={specific.resourceRef ?? ''}
                        onChange={(e) => {
                          const next = { ...specific, resourceRef: e.target.value || null };
                          setSpecific(next);
                          onDraftChange(buildDraft({ specific: next }));
                        }}
                        placeholder="resource-id"
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-white/30 text-xs uppercase tracking-wider">Resource Property</label>
                      <input
                        value={specific.resourceProperty ?? ''}
                        onChange={(e) => {
                          const next = { ...specific, resourceProperty: e.target.value || null };
                          setSpecific(next);
                          onDraftChange(buildDraft({ specific: next }));
                        }}
                        placeholder="balance, count..."
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
                      />
                    </div>
                  </div>
                )}

                {/* Acquisition */}
                {specific.goalType === 'acquisition' && (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-white/30 text-xs uppercase tracking-wider">Target Count</label>
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
                        <label className="text-white/30 text-xs uppercase tracking-wider">Item Type</label>
                        <input
                          value={specific.unit ?? ''}
                          onChange={(e) => {
                            const next = { ...specific, unit: e.target.value || null };
                            setSpecific(next);
                            onDraftChange(buildDraft({ specific: next }));
                          }}
                          placeholder="rocks, stamps..."
                          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
                        />
                      </div>
                    </div>
                    <p className="text-white/25 text-xs">Goal completes when the target count is reached in your stash or inventory.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 1 && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-white/30 text-xs uppercase tracking-wider">Tracked Tasks</label>
                  {measurableRefs.length === 0 && (
                    <p className="text-white/20 text-xs">No tasks linked yet — add tasks that count as progress toward this goal.</p>
                  )}
                  {measurableRefs.map((ref, i) => {
                    const template = taskTemplates[ref];
                    const displayName = template?.name ?? taskNames[ref] ?? ref;
                    const displayIcon = template?.icon ?? 'quest';
                    const isConfirming = confirmRemoveRef === ref;

                    return (
                      <div key={i} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                        <IconDisplay iconKey={displayIcon} size={14} className="opacity-60 shrink-0" />
                        <p className="text-white/70 text-xs flex-1 truncate">{displayName}</p>
                        {isConfirming ? (
                          <span className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => {
                                setMeasurableRefs(prev => prev.filter((_, j) => j !== i));
                                setTaskNames(prev => {
                                  const next = { ...prev };
                                  delete next[ref];
                                  return next;
                                });
                                setConfirmRemoveRef(null);
                              }}
                              className="text-red-400 text-xs hover:text-red-300"
                            >
                              confirm</button>
                            <button
                              onClick={() => setConfirmRemoveRef(null)}
                              className="text-white/30 text-xs hover:text-white/50"
                            >
                              cancel</button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmRemoveRef(ref)}
                            className="text-white/20 hover:text-red-400/60 text-xs px-1"
                          >
                            ✕</button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => setShowTaskPicker(true)}
                  className="w-full py-2 rounded-lg border border-white/10 text-white/40 text-xs hover:text-white/60"
                >
                  + Pick Task
                </button>
              </div>
            )}

            {activeTab === 2 && (
              <div className="flex flex-col gap-4">

                {/* 91-day feasibility */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-white/30 text-xs uppercase tracking-wider">91-Day Feasibility</label>
                    <span className="text-white/60 text-sm font-medium">{feasibilityPct}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={feasibilityPct}
                    onChange={(e) => setFeasibilityPct(Number(e.target.value))}
                    className="w-full accent-indigo-400"
                  />
                  <p className="text-white/25 text-xs">
                    {feasibilityPct === 100
                      ? 'Fully achievable within 91 days'
                      : feasibilityPct >= 50
                      ? `About ${feasibilityPct}% achievable in 91 days - consider scoping the target`
                      : feasibilityPct > 0
                      ? `${feasibilityPct}% achievable in 91 days - this may need to be broken into phases`
                      : 'Not achievable in 91 days - use the checkbox below'}
                  </p>
                </div>

                {/* Takes longer checkbox */}
                <div className="flex items-start gap-3 rounded-lg border border-white/10 px-3 py-2.5 bg-white/3">
                  <input
                    type="checkbox"
                    checked={takesLonger}
                    onChange={(e) => setTakesLonger(e.target.checked)}
                    className="mt-0.5 accent-amber-400"
                    id="takes-longer"
                  />
                  <div className="flex flex-col gap-0.5">
                    <label htmlFor="takes-longer" className="text-white/60 text-xs cursor-pointer">
                      This goal takes longer than 91 days
                    </label>
                    <p className="text-white/25 text-xs">
                      A tether will be available to chain the next phase when this one completes.
                    </p>
                  </div>
                </div>

                {/* Needed items / prerequisites */}
                <div className="flex flex-col gap-2">
                  <label className="text-white/30 text-xs uppercase tracking-wider">Prerequisites / Needed Items</label>
                  {neededItems.length === 0 && (
                    <p className="text-white/20 text-xs">Nothing listed yet</p>
                  )}
                  {neededItems.map((item, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        value={item}
                        onChange={(e) => {
                          const next = [...neededItems];
                          next[i] = e.target.value;
                          setNeededItems(next);
                        }}
                        placeholder={`Prerequisite ${i + 1}`}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
                      />
                      <button
                        onClick={() => setNeededItems(neededItems.filter((_, j) => j !== i))}
                        className="text-white/20 hover:text-red-400/60 text-xs px-2"
                      >x</button>
                    </div>
                  ))}
                  <button
                    onClick={() => setNeededItems([...neededItems, ''])}
                    className="text-white/30 text-xs hover:text-white/50 text-left"
                  >+ Add prerequisite</button>
                </div>

              </div>
            )}

            {activeTab === 3 && (
              <div className="flex flex-col gap-3">

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
                          label: `Outcome: ${o.slice(0, 45)}${o.length > 45 ? '...' : ''}`,
                        })),
                        ...woopObstacles.map((o, i) => ({
                          value: `obstacle-${i}`,
                          label: `Obstacle: ${o.slice(0, 45)}${o.length > 45 ? '...' : ''}`,
                        })),
                      ]}
                      placeholder="Not linked"
                    />
                    <p className="text-white/20 text-xs mt-1">
                      Which outcome or obstacle does this SMARTER directly address?
                    </p>
                  </div>
                )}

                {woopOutcomes.length === 0 && woopObstacles.length === 0 && (
                  <p className="text-white/20 text-xs">
                    Add outcomes and obstacles to the parent WOOP to link this SMARTER.
                  </p>
                )}

              </div>
            )}

            {activeTab === 4 && (
              <div className="flex flex-col gap-4">

                {/* Top - start date + mission duration */}
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <div className="flex flex-col gap-1 flex-1">
                      <label className="text-white/30 text-xs uppercase tracking-wider">Start Date</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-white/25"
                      />
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                      <label className="text-white/30 text-xs uppercase tracking-wider">End Date</label>
                      <input
                        type="date"
                        value={projectedFinish}
                        onChange={(e) => setProjectedFinish(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-white/25"
                      />
                    </div>
                  </div>

                  {/* Mission duration display */}
                  {startDate && projectedFinish && (() => {
                    const start = new Date(startDate);
                    const end = new Date(projectedFinish);
                    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
                    const feasibility = (smarter.attainable as Record<string, number>).feasibilityPct ?? 100;
                    return (
                      <div className="rounded-lg border border-white/10 px-3 py-2 bg-white/3">
                        <p className="text-white/60 text-sm font-medium">{days}-day mission</p>
                        {feasibility < 100 && (
                          <p className="text-white/30 text-xs mt-0.5">Feasibility: {feasibility}% in this window</p>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Middle - check-in settings */}
                <div className="flex flex-col gap-2">
                  <label className="text-white/30 text-xs uppercase tracking-wider">Check-in Schedule</label>
                  <div className="flex gap-2 items-end">
                    <div className="flex flex-col gap-1 flex-1">
                      <label className="text-white/30 text-xs uppercase tracking-wider sr-only">Frequency</label>
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
                    {checkInFrequency === 'daily' && (
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-white/30 text-xs uppercase tracking-wider">Every N Days</label>
                        <input
                          type="number"
                          min={1}
                          value={checkInEvery}
                          onChange={(e) => setCheckInEvery(Math.max(1, Number(e.target.value)))}
                          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-white/25"
                        />
                      </div>
                    )}
                    {checkInFrequency === 'weekly' && (
                      <div className="flex flex-col gap-1 flex-1">
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
                      </div>
                    )}
                    {checkInFrequency === 'monthly' && (
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-white/30 text-xs uppercase tracking-wider">Day of Month</label>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={checkInMonthDay}
                          onChange={(e) => setCheckInMonthDay(Math.min(31, Math.max(1, Number(e.target.value))))}
                          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-white/25"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom - expected completions per check-in + preview */}
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-white/30 text-xs uppercase tracking-wider">
                      Expected Actions Per Check-in
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={completionsPerCheckin}
                      onChange={(e) => setCompletionsPerCheckin(Math.max(1, Number(e.target.value)))}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-white/25"
                    />
                    <p className="text-white/20 text-xs">
                      How many tracked task completions do you expect each check-in period?
                    </p>
                  </div>

                  {/* Preview */}
                  {startDate && projectedFinish ? (() => {
                    const start = new Date(startDate);
                    const end = new Date(projectedFinish);
                    const diffDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
                    const periodDays = checkInFrequency === 'daily' ? checkInEvery
                      : checkInFrequency === 'weekly' ? 7 : 30;
                    const totalCheckins = Math.max(1, Math.floor(diffDays / periodDays));
                    const progressPerCheckin = Math.round(100 / totalCheckins);
                    const totalExpectedActions = totalCheckins * completionsPerCheckin;
                    return (
                      <div className="rounded-lg border border-white/10 px-3 py-2 bg-white/3 flex flex-col gap-1">
                        <p className="text-white/40 text-xs">
                          {totalCheckins} check-in{totalCheckins !== 1 ? 's' : ''} - ~{progressPerCheckin}% progress each
                        </p>
                        <p className="text-white/30 text-xs">
                          {totalExpectedActions} total action{totalExpectedActions !== 1 ? 's' : ''} expected across the mission
                        </p>
                      </div>
                    );
                  })() : (
                    <p className="text-white/20 text-xs">Set start and end dates to see preview</p>
                  )}
                </div>

              </div>
            )}

            {activeTab === 5 && (
              <div className="flex flex-col gap-3">
                <CustomSelect
                  value={onMissedFinish}
                  onChange={(val) => setOnMissedFinish(val as ExitStrategyOption)}
                  options={[
                    { value: 'sleep', label: 'Sleep - pause until resumed' },
                    { value: 'restart', label: 'Restart - reset and begin again' },
                    { value: 'extend', label: 'Extend - add one more check-in' },
                    { value: 'reschedule', label: 'Reschedule - pick a new end date' },
                  ]}
                />
                <div className="rounded-lg border border-white/10 px-3 py-2 bg-white/3">
                  {onMissedFinish === 'sleep' && (
                    <p className="text-white/40 text-xs">Goal pauses at the end date. You can resume it manually when ready.</p>
                  )}
                  {onMissedFinish === 'restart' && (
                    <p className="text-white/40 text-xs">Progress resets to zero and the mission starts fresh from today.</p>
                  )}
                  {onMissedFinish === 'extend' && (
                    <p className="text-white/40 text-xs">One additional check-in period is added to the mission window - giving you one more cycle to hit the target.</p>
                  )}
                  {onMissedFinish === 'reschedule' && (
                    <p className="text-white/40 text-xs">You choose a new end date. Progress is kept and the mission continues from where it left off.</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 6 && (
              <div className="flex flex-col gap-4">

                {/* Goal-type-aware completion prompt */}
                <div className="flex flex-col gap-1">
                  <label className="text-white/30 text-xs uppercase tracking-wider">
                    {specific.goalType === 'acquisition' ? 'Item Placement' : 'Completion Description'}
                  </label>

                  {specific.goalType === 'acquisition' && (
                    <>
                      <input
                        value={resultItemRef}
                        onChange={(e) => setResultItemRef(e.target.value)}
                        placeholder="Item or stash ref - placed when goal completes"
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
                      />
                      <p className="text-white/20 text-xs mt-1">
                        The item or stash entry that confirms this goal is complete.
                      </p>
                    </>
                  )}

                  {specific.goalType === 'resourceLinked' && (
                    <>
                      <textarea
                        value={resultDescription}
                        onChange={(e) => setResultDescription(e.target.value)}
                        placeholder="What does the resource state look like at completion? e.g. Account balance reaches $5000"
                        rows={3}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25 resize-none"
                      />
                    </>
                  )}

                  {specific.goalType === 'binary' && (
                    <div className="rounded-lg border border-white/10 px-3 py-3 bg-white/3">
                      <p className="text-white/50 text-sm">Completion is the result.</p>
                      <p className="text-white/25 text-xs mt-1">No additional artifact needed - marking done is the end state.</p>
                    </div>
                  )}

                  {(specific.goalType === 'numeric' ||
                    specific.goalType === 'taskCount' ||
                    specific.goalType === 'progression' ||
                    specific.goalType === 'streak' ||
                    specific.goalType === 'reduction' ||
                    !specific.goalType) && (
                    <textarea
                      value={resultDescription}
                      onChange={(e) => setResultDescription(e.target.value)}
                      placeholder="Describe what success looks like when this is complete..."
                      rows={3}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25 resize-none"
                    />
                  )}
                </div>

                {/* Tether execution stub */}
                <div className="flex items-start gap-3 rounded-lg border border-white/10 px-3 py-2.5 bg-white/3">
                  <input
                    type="checkbox"
                    checked={resultExecutesTether}
                    onChange={(e) => setResultExecutesTether(e.target.checked)}
                    className="mt-0.5 accent-amber-400"
                    id="executes-tether"
                  />
                  <div className="flex flex-col gap-0.5">
                    <label htmlFor="executes-tether" className="text-white/60 text-xs cursor-pointer">
                      Completion executes a tether
                    </label>
                    <p className="text-white/25 text-xs">
                      When this SMARTER completes it will initialize the next phase. Tether configuration coming soon.
                    </p>
                  </div>
                </div>

              </div>
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
      {showTaskPicker && (
        <TaskPoolAddPanel
          hideTabs={['new']}
          onClose={() => setShowTaskPicker(false)}
          onAdd={(entry) => {
            const ref = entry.kind === 'template' ? entry.templateRef
              : entry.kind === 'resource' ? entry.taskId
              : entry.id;
            if (ref && !measurableRefs.includes(ref)) {
              setMeasurableRefs((prev) => [...prev, ref]);
              if (entry.kind === 'resource' && entry.taskName) {
                setTaskNames((prev) => ({ ...prev, [ref]: entry.taskName }));
              }
            }
            setShowTaskPicker(false);
          }}
        />
      )}
    </div>
  );
}
