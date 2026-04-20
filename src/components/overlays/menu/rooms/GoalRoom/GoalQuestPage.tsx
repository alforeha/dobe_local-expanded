import { useMemo, useState } from 'react';
import type {
  Act,
  ExigencyOption,
  Quest,
  RecurrenceFrequency,
  RecurrenceRule,
  StatGroupKey,
  TaskTemplate,
  TaskType,
  Weekday,
} from '../../../../../types';
import { getTaskTypeIconKey } from '../../../../../constants/iconMap';
import { IconPicker } from '../../../../shared/IconPicker';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { useResourceStore } from '../../../../../stores/useResourceStore';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import {
  formatSlot,
  formatStatBonus,
  formatXpBoost,
  getGearDefinition,
  getGearIcon,
  RARITY_BADGE,
} from '../../../profile/rooms/EquipmentRoom/equipmentRoomData';
import {
  GoalField,
  GoalPageShell,
  GoalProgressBar,
  GoalSection,
  GoalStateBadge,
} from './GoalEditorShared';
import {
  STAT_GROUP_OPTIONS,
  createBlankQuest,
  getExigencyLabel,
  normalizeActForSave,
  normalizeQuestForSave,
} from './goalEditorUtils';

type TimelyMode = 'none' | 'interval' | 'xpThreshold' | 'taskCount';
type SmarterTab = 'specific' | 'measurable' | 'attainable' | 'relevant' | 'timely' | 'exigency' | 'result';

const SMARTER_TABS: { tab: SmarterTab; letter: string; title: string }[] = [
  { tab: 'specific', letter: 'S', title: 'Specific' },
  { tab: 'measurable', letter: 'M', title: 'Measurable' },
  { tab: 'attainable', letter: 'A', title: 'Attainable' },
  { tab: 'relevant', letter: 'R', title: 'Relevant' },
  { tab: 'timely', letter: 'T', title: 'Timely' },
  { tab: 'exigency', letter: 'E', title: 'Exigency' },
  { tab: 'result', letter: 'R', title: 'Result' },
];

interface GoalQuestPageProps {
  act: Act;
  chainIdx: number;
  questIdx: number | null;
  readOnly: boolean;
  onBack: () => void;
  onSave: (act: Act) => void;
}

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function getDefaultProjectedFinish(): string {
  const date = new Date();
  date.setDate(date.getDate() + 91);
  return date.toISOString().slice(0, 10);
}

function getRelevantText(quest: Quest): string {
  return typeof quest.relevant.reason === 'string'
    ? quest.relevant.reason as string
    : typeof quest.relevant.text === 'string'
      ? quest.relevant.text as string
      : '';
}

function getAttainableText(quest: Quest): string {
  return typeof quest.attainable.note === 'string'
    ? quest.attainable.note as string
    : typeof quest.attainable.text === 'string'
      ? quest.attainable.text as string
      : '';
}

function getResultText(quest: Quest): string {
  return typeof quest.result.description === 'string'
    ? quest.result.description as string
    : typeof quest.result.text === 'string'
      ? quest.result.text as string
      : '';
}

function buildRecurrenceRule(
  frequency: RecurrenceFrequency,
  days: Weekday[],
  interval: number,
  endsOn: string,
): RecurrenceRule {
  return {
    frequency,
    days,
    interval,
    endsOn: endsOn || null,
    customCondition: null,
  };
}

function getTaskCountThreshold(quest: Quest): number {
  return quest.timely.markers[0]?.threshold ?? 1;
}

function getTemplateStatGroup(template: TaskTemplate): StatGroupKey {
  const best = Object.entries(template.xpAward).reduce(
    (current, [key, value]) => value > current.value ? { key: key as StatGroupKey, value } : current,
    { key: 'health' as StatGroupKey, value: -1 },
  );
  return best.key;
}

export function GoalQuestPage({
  act,
  chainIdx,
  questIdx,
  readOnly,
  onBack,
  onSave,
}: GoalQuestPageProps) {
  const scheduleTemplates = useScheduleStore((state) => state.taskTemplates);
  const resources = useResourceStore((state) => state.resources);
  const existingQuest = questIdx !== null ? act.chains[chainIdx]?.quests[questIdx] : null;
  const baseQuest = existingQuest ?? createBlankQuest();
  const parentChain = act.chains[chainIdx];

  const [icon, setIcon] = useState(baseQuest.icon);
  const [name, setName] = useState(baseQuest.name);
  const [description, setDescription] = useState(baseQuest.description);
  const [completionState] = useState(baseQuest.completionState);
  const [targetValue, setTargetValue] = useState(String(baseQuest.specific.targetValue));
  const [unit, setUnit] = useState(baseQuest.specific.unit ?? '');
  const [taskTemplateRefs, setTaskTemplateRefs] = useState<string[]>(baseQuest.measurable.taskTemplateRefs ?? []);
  const [resourceRef, setResourceRef] = useState(baseQuest.measurable.resourceRef ?? '');
  const [within91Days, setWithin91Days] = useState(baseQuest.attainable.within91Days === true);
  const [hasNeededResources, setHasNeededResources] = useState(baseQuest.attainable.hasNeededResources === true);
  const [attainableNote, setAttainableNote] = useState(getAttainableText(baseQuest));
  const [relevantStatGroup, setRelevantStatGroup] = useState<StatGroupKey>(
    (baseQuest.relevant.statGroup as StatGroupKey | undefined) ?? 'health',
  );
  const [relevantReason, setRelevantReason] = useState(getRelevantText(baseQuest));
  const [anticipatedEndDate, setAnticipatedEndDate] = useState(baseQuest.timely.projectedFinish ?? getDefaultProjectedFinish());
  const [timelyMode, setTimelyMode] = useState<TimelyMode>(baseQuest.timely.conditionType);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(baseQuest.timely.interval?.frequency ?? 'weekly');
  const [days, setDays] = useState<Weekday[]>(baseQuest.timely.interval?.days ?? []);
  const [intervalCount, setIntervalCount] = useState(String(baseQuest.timely.interval?.interval ?? 1));
  const [timelyEndsOn, setTimelyEndsOn] = useState(baseQuest.timely.interval?.endsOn ?? '');
  const [xpThreshold, setXpThreshold] = useState(String(baseQuest.timely.xpThreshold ?? ''));
  const [taskCountThreshold, setTaskCountThreshold] = useState(String(getTaskCountThreshold(baseQuest)));
  const [exigency, setExigency] = useState<ExigencyOption>(baseQuest.exigency.onMissedFinish);
  const exigencyMeta = baseQuest.exigency as unknown as Record<string, unknown>;
  const [exigencyDate, setExigencyDate] = useState(
    typeof exigencyMeta.rescheduleDate === 'string'
      ? exigencyMeta.rescheduleDate as string
      : '',
  );
  const [exigencyInterval, setExigencyInterval] = useState(String(exigencyMeta.extendIntervalDays ?? ''));
  const [resultDescription, setResultDescription] = useState(getResultText(baseQuest));
  const [activeSmarterTab, setActiveSmarterTab] = useState<SmarterTab>('specific');
  const [measurableStatFilter, setMeasurableStatFilter] = useState<StatGroupKey | 'all'>('all');
  const [measurableTaskTypeFilter, setMeasurableTaskTypeFilter] = useState<TaskType | 'all'>('all');

  const taskTemplates = useMemo(
    () => Object.entries(scheduleTemplates)
      .map(([id, template]) => ({ id, template }))
      .filter(({ template }) => template.isSystem !== true),
    [scheduleTemplates],
  );
  const resourceEntries = useMemo(
    () => Object.values(resources).sort((a, b) => a.name.localeCompare(b.name)),
    [resources],
  );
  const activeSmarterMeta = SMARTER_TABS.find(({ tab }) => tab === activeSmarterTab) ?? SMARTER_TABS[0];
  const rewardGear = getGearDefinition(baseQuest.questReward);
  const rewardXpBoost = formatXpBoost(rewardGear);
  const measurableTaskTypes = useMemo(
    () => Array.from(new Set(taskTemplates.map(({ template }) => template.taskType))).sort(),
    [taskTemplates],
  );
  const filteredTaskTemplates = useMemo(
    () => taskTemplates.filter(({ template }) => {
      const matchesStat = measurableStatFilter === 'all' || getTemplateStatGroup(template) === measurableStatFilter;
      const matchesType = measurableTaskTypeFilter === 'all' || template.taskType === measurableTaskTypeFilter;
      return matchesStat && matchesType;
    }),
    [measurableStatFilter, measurableTaskTypeFilter, taskTemplates],
  );

  function toggleTemplate(templateId: string) {
    setTaskTemplateRefs((current) =>
      current.includes(templateId)
        ? current.filter((id) => id !== templateId)
        : [...current, templateId],
    );
  }

  function toggleDay(day: Weekday) {
    setDays((current) =>
      current.includes(day) ? current.filter((entry) => entry !== day) : [...current, day],
    );
  }

  function buildQuest(): Quest {
    const recurrence = timelyMode === 'interval'
      ? buildRecurrenceRule(
          frequency,
          days,
          Math.max(1, parseInt(intervalCount, 10) || 1),
          timelyEndsOn,
        )
      : null;

    const draftQuest: Quest = {
      ...baseQuest,
      icon,
      name: name.trim(),
      description: description.trim(),
      completionState,
      specific: {
        ...baseQuest.specific,
        targetValue: Math.max(1, parseInt(targetValue, 10) || 1),
        unit: unit.trim() || null,
      },
      measurable: {
        ...(taskTemplateRefs.length > 0 ? { taskTemplateRefs } : {}),
        ...(resourceRef ? { resourceRef } : {}),
      },
      attainable: {
        ...baseQuest.attainable,
        within91Days,
        hasNeededResources,
        note: attainableNote.trim(),
      },
      relevant: {
        ...baseQuest.relevant,
        statGroup: relevantStatGroup,
        reason: relevantReason.trim(),
      },
      timely: {
        ...baseQuest.timely,
        conditionType: timelyMode,
        interval: recurrence,
        xpThreshold: timelyMode === 'xpThreshold' ? (parseInt(xpThreshold, 10) || null) : null,
        projectedFinish: anticipatedEndDate || null,
      },
      exigency: {
        ...baseQuest.exigency,
        onMissedFinish: exigency,
        ...(exigency === 'reschedule' ? { rescheduleDate: exigencyDate || null } : {}),
        ...(exigency === 'extend' ? { extendIntervalDays: parseInt(exigencyInterval, 10) || null } : {}),
      },
      result: {
        ...baseQuest.result,
        description: resultDescription.trim(),
        xpAward: baseQuest.result.xpAward,
      },
      questReward: baseQuest.questReward,
    };

    const normalizedQuestIdx = questIdx ?? act.chains[chainIdx]?.quests.length ?? 0;
    return normalizeQuestForSave(
      draftQuest,
      act.id,
      chainIdx,
      normalizedQuestIdx,
      timelyMode === 'taskCount' ? (parseInt(taskCountThreshold, 10) || 1) : null,
    );
  }

  function handleSave() {
    const updatedQuest = buildQuest();
    const updatedChains = [...act.chains];
    const targetChain = updatedChains[chainIdx];
    if (!targetChain) return;
    const updatedQuests = [...targetChain.quests];
    if (questIdx === null) {
      updatedQuests.push(updatedQuest);
    } else {
      updatedQuests[questIdx] = updatedQuest;
    }
    updatedChains[chainIdx] = { ...targetChain, quests: updatedQuests };
    onSave(normalizeActForSave({ ...act, chains: updatedChains }));
  }

  const footer = readOnly ? (
    <button
      type="button"
      onClick={onBack}
      className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
    >
      Back
    </button>
  ) : (
    <>
      <button
        type="button"
        onClick={onBack}
        className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        Back
      </button>
      <button
        type="button"
        onClick={handleSave}
        className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
      >
        Save
      </button>
    </>
  );

  return (
    <GoalPageShell
      title={name || 'Quest'}
      subtitle={readOnly ? 'Read-only quest' : 'SMARTER quest editor'}
      onBack={onBack}
      footer={footer}
    >
      <GoalSection title="Quest">
        <div className="flex items-end gap-4">
          <div className={`shrink-0 pb-0.5 ${readOnly ? 'pointer-events-none opacity-60' : ''}`}>
            <IconPicker value={icon} onChange={setIcon} align="left" />
          </div>
          <div className="min-w-0 flex-1">
            <GoalField label="Name">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={name}
                  disabled={readOnly}
                  onChange={(e) => setName(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:disabled:bg-gray-800"
                />
                <div className="shrink-0">
                  <GoalStateBadge state={completionState} />
                </div>
              </div>
            </GoalField>
            {readOnly ? (
              <p className="mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">Coach quest - read only</p>
            ) : null}
          </div>
        </div>

        <GoalField label="Description">
          <textarea
            value={description}
            disabled={readOnly}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:disabled:bg-gray-800"
          />
        </GoalField>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Progress</span>
            <span>{baseQuest.progressPercent}%</span>
          </div>
          <GoalProgressBar value={baseQuest.progressPercent} />
        </div>
      </GoalSection>

      <GoalSection title="SMARTER" className="flex min-h-[28rem] flex-1 flex-col" contentClassName="flex flex-1 flex-col">
        <div className="flex flex-row flex-nowrap gap-2 overflow-x-auto">
          {SMARTER_TABS.map(({ tab, letter }) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveSmarterTab(tab)}
              className={`min-w-0 flex-1 rounded-xl px-3 py-2 text-sm font-semibold uppercase tracking-wide ${
                activeSmarterTab === tab
                  ? 'bg-emerald-600 text-white'
                  : 'border border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-200'
              }`}
            >
              <span className="block truncate">{letter}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-1 items-start justify-center">
          <div className="flex w-full max-w-3xl flex-1 flex-col justify-start gap-5">
            <div className="rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-left dark:border-gray-700 dark:bg-gray-900/40">
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{activeSmarterMeta.title}</p>
            </div>

        {activeSmarterTab === 'specific' ? (
          <>
            <GoalField label="What is the measurable target?" hint="Target value and unit">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  min={1}
                  value={targetValue}
                  disabled={readOnly}
                  onChange={(e) => setTargetValue(e.target.value)}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:disabled:bg-gray-800"
                />
                <input
                  type="text"
                  value={unit}
                  disabled={readOnly}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="sessions, reps, miles..."
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:disabled:bg-gray-800"
                />
              </div>
            </GoalField>
            <GoalField label="Resource selector" hint="Use a resource when progress should track account balance or inventory quantity.">
              <select
                value={resourceRef}
                disabled={readOnly}
                onChange={(e) => setResourceRef(e.target.value)}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:disabled:bg-gray-800"
              >
                <option value="">No resource</option>
                {resourceEntries.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name} ({resource.type})
                  </option>
                ))}
              </select>
            </GoalField>
          </>
        ) : null}

        {activeSmarterTab === 'measurable' ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                What actions count as progress?
              </p>
              <div className="flex flex-row flex-nowrap gap-3">
                <select
                  value={measurableStatFilter}
                  disabled={readOnly}
                  onChange={(e) => setMeasurableStatFilter(e.target.value as StatGroupKey | 'all')}
                  className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:disabled:bg-gray-800"
                >
                  <option value="all">All stats</option>
                  {STAT_GROUP_OPTIONS.map((stat) => (
                    <option key={stat} value={stat}>{stat}</option>
                  ))}
                </select>
                <select
                  value={measurableTaskTypeFilter}
                  disabled={readOnly}
                  onChange={(e) => setMeasurableTaskTypeFilter(e.target.value as TaskType | 'all')}
                  className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:disabled:bg-gray-800"
                >
                  <option value="all">All task types</option>
                  {measurableTaskTypes.map((taskType) => (
                    <option key={taskType} value={taskType}>{taskType}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-gray-200 p-2 dark:border-gray-700">
              {filteredTaskTemplates.map(({ id, template }) => {
                const selected = taskTemplateRefs.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={readOnly}
                    onClick={() => toggleTemplate(id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-70 ${
                      selected ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'hover:bg-gray-100 dark:hover:bg-gray-900'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      readOnly
                      tabIndex={-1}
                      className="h-4 w-4 shrink-0 accent-emerald-600"
                    />
                    <IconDisplay iconKey={getTemplateStatGroup(template)} size={18} className="h-[18px] w-[18px] shrink-0 object-contain" alt="" />
                    <IconDisplay iconKey={getTaskTypeIconKey(template.taskType)} size={18} className="h-[18px] w-[18px] shrink-0 object-contain" alt="" />
                    <IconDisplay iconKey={template.icon} size={18} className="h-[18px] w-[18px] shrink-0 object-contain" alt="" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{template.name}</p>
                    </div>
                  </button>
                );
              })}
              {filteredTaskTemplates.length === 0 ? (
                <div className="rounded-xl px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  No tasks match those filters yet.
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Tracked tasks</p>
              <div className="flex flex-wrap gap-2">
                {taskTemplateRefs.map((ref) => {
                  const template = scheduleTemplates[ref];
                  return (
                    <button
                      key={ref}
                      type="button"
                      disabled={readOnly}
                      onClick={() => toggleTemplate(ref)}
                      className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {template ? (
                        <>
                          <IconDisplay iconKey={template.icon} size={14} className="h-3.5 w-3.5 shrink-0 object-contain" alt="" />
                          <span>{template.name}</span>
                        </>
                      ) : (
                        <span>{ref}</span>
                      )}
                      <span>x</span>
                    </button>
                  );
                })}
                {taskTemplateRefs.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No tracked tasks selected yet.</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {activeSmarterTab === 'attainable' ? (
          <>
        {parentChain?.obstacle ? (
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Obstacle</p>
            <p className="mt-1">{parentChain.obstacle}</p>
          </div>
        ) : null}
        <GoalField label="What will neutralize risk?">
          <textarea
            value={attainableNote}
            disabled={readOnly}
            onChange={(e) => setAttainableNote(e.target.value)}
            rows={3}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:disabled:bg-gray-800"
          />
        </GoalField>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input type="checkbox" checked={hasNeededResources} disabled={readOnly} onChange={(e) => setHasNeededResources(e.target.checked)} className="accent-emerald-600" />
            <span>Items needed for this are easily accessible</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input type="checkbox" checked={within91Days} disabled={readOnly} onChange={(e) => setWithin91Days(e.target.checked)} className="accent-emerald-600" />
            <span>Can be completed in 91 days</span>
          </label>
          {!within91Days ? (
            <p className="pl-6 text-xs text-amber-700 dark:text-amber-300">
              CAN-DO-BE recommends a 91 day feasibility window to ensure higher success.
            </p>
          ) : null}
        </div>
          </>
        ) : null}

        {activeSmarterTab === 'relevant' ? (
          <>
        {parentChain?.outcome ? (
          <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">Outcome</p>
            <p className="mt-1">{parentChain.outcome}</p>
          </div>
        ) : null}
        <GoalField label="Why does this matter to you?">
          <textarea
            value={relevantReason}
            disabled={readOnly}
            onChange={(e) => setRelevantReason(e.target.value)}
            rows={3}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:disabled:bg-gray-800"
          />
        </GoalField>
        <GoalField label="Stat group">
          <select
            value={relevantStatGroup}
            disabled={readOnly}
            onChange={(e) => setRelevantStatGroup(e.target.value as StatGroupKey)}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:disabled:bg-gray-800"
          >
            {STAT_GROUP_OPTIONS.map((stat) => (
              <option key={stat} value={stat}>{stat}</option>
            ))}
          </select>
        </GoalField>
          </>
        ) : null}

        {activeSmarterTab === 'timely' ? (
          <>
        <GoalField label="When will the goal be met?">
          <input
            type="date"
            value={anticipatedEndDate}
            disabled={readOnly}
            onChange={(e) => setAnticipatedEndDate(e.target.value)}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:disabled:bg-gray-800"
          />
        </GoalField>

        <GoalField label="Check-in type">
          <select
            value={timelyMode}
            disabled={readOnly}
            onChange={(e) => setTimelyMode(e.target.value as TimelyMode)}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:disabled:bg-gray-800"
          >
            <option value="none">None</option>
            <option value="interval">By recurrence</option>
            <option value="xpThreshold">By XP threshold</option>
            <option value="taskCount">By task count</option>
          </select>
        </GoalField>

        {timelyMode === 'interval' ? (
          <div className="grid gap-3 md:grid-cols-2">
            <GoalField label="Frequency">
              <select
                value={frequency}
                disabled={readOnly}
                onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:disabled:bg-gray-800"
              >
                <option value="daily">daily</option>
                <option value="weekly">weekly</option>
                <option value="monthly">monthly</option>
                <option value="custom">custom</option>
              </select>
            </GoalField>
            <GoalField label="Interval">
              <input
                type="number"
                min={1}
                value={intervalCount}
                disabled={readOnly}
                onChange={(e) => setIntervalCount(e.target.value)}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:disabled:bg-gray-800"
              />
            </GoalField>
            <GoalField label="Ends on">
              <input
                type="date"
                value={timelyEndsOn}
                disabled={readOnly}
                onChange={(e) => setTimelyEndsOn(e.target.value)}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:disabled:bg-gray-800"
              />
            </GoalField>
            <GoalField label="Days">
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    disabled={readOnly}
                    onClick={() => toggleDay(day)}
                    className={`rounded-full px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-70 ${
                      days.includes(day)
                        ? 'bg-emerald-600 text-white'
                        : 'border border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-200'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </GoalField>
          </div>
        ) : null}

        {timelyMode === 'xpThreshold' ? (
          <GoalField label="XP value">
            <input
              type="number"
              min={1}
              value={xpThreshold}
              disabled={readOnly}
              onChange={(e) => setXpThreshold(e.target.value)}
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:disabled:bg-gray-800"
            />
          </GoalField>
        ) : null}

        {timelyMode === 'taskCount' ? (
          <GoalField label="Count value">
            <input
              type="number"
              min={1}
              value={taskCountThreshold}
              disabled={readOnly}
              onChange={(e) => setTaskCountThreshold(e.target.value)}
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:disabled:bg-gray-800"
            />
          </GoalField>
        ) : null}
          </>
        ) : null}

        {activeSmarterTab === 'exigency' ? (
          <>
        <GoalField label="What happens if goal not met in time?">
          <select
            value={exigency}
            disabled={readOnly}
            onChange={(e) => setExigency(e.target.value as ExigencyOption)}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:disabled:bg-gray-800"
          >
            <option value="reschedule">{getExigencyLabel('reschedule')}</option>
            <option value="extend">{getExigencyLabel('extend')}</option>
            <option value="sleep">{getExigencyLabel('sleep')}</option>
            <option value="restart">{getExigencyLabel('restart')}</option>
          </select>
        </GoalField>

        {exigency === 'reschedule' ? (
          <GoalField label="New end date">
            <input
              type="date"
              value={exigencyDate}
              disabled={readOnly}
              onChange={(e) => setExigencyDate(e.target.value)}
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:disabled:bg-gray-800"
            />
          </GoalField>
        ) : null}

        {exigency === 'extend' ? (
          <GoalField label="Extend interval (days)">
            <input
              type="number"
              min={1}
              value={exigencyInterval}
              disabled={readOnly}
              onChange={(e) => setExigencyInterval(e.target.value)}
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:disabled:bg-gray-800"
            />
          </GoalField>
        ) : null}
          </>
        ) : null}

        {activeSmarterTab === 'result' ? (
          <>
        {parentChain?.wish ? (
          <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Wish</p>
            <p className="mt-1">{parentChain.wish}</p>
          </div>
        ) : null}
        <GoalField label="What is grand finale from accomplishing this?">
          <textarea
            value={resultDescription}
            disabled={readOnly}
            onChange={(e) => setResultDescription(e.target.value)}
            rows={3}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:disabled:bg-gray-800"
          />
        </GoalField>
        {rewardGear ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Loot drop</p>
            <div className="rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
                  <IconDisplay iconKey={getGearIcon(rewardGear)} size={28} className="h-7 w-7 object-contain" alt="" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{rewardGear.name}</p>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${RARITY_BADGE[rewardGear.rarity]}`}>
                      {rewardGear.rarity}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{rewardGear.description}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{formatSlot(rewardGear.slot)}</span>
                    <span>{formatStatBonus(rewardGear)}</span>
                    {rewardXpBoost ? <span>{rewardXpBoost}</span> : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
          </>
        ) : null}
          </div>
        </div>
      </GoalSection>
    </GoalPageShell>
  );
}
