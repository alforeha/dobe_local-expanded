import { useState } from 'react';
import type { Act, Chain, Quest } from '../../../../../types';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { IconPicker } from '../../../../shared/IconPicker';
import { IconDisplay } from '../../../../shared/IconDisplay';
import {
  GoalField,
  GoalPageShell,
  GoalProgressBar,
  GoalSection,
  GoalStateBadge,
} from './GoalEditorShared';
import {
  createBlankChain,
  getQuestDisplayState,
  getQuestTaskTemplates,
  getQuestTimelySummary,
  getQuestUnlockMode,
  normalizeActForSave,
  setQuestUnlockMode,
} from './goalEditorUtils';

type WoopTab = 'wish' | 'outcome' | 'obstacle' | 'plan';

interface GoalChainPageProps {
  act: Act;
  chainIdx: number | null;
  readOnly: boolean;
  onBack: () => void;
  onSave: (act: Act) => void;
  onOpenQuest: (act: Act, chainIdx: number, questIdx: number | null) => void;
}

export function GoalChainPage({
  act,
  chainIdx,
  readOnly,
  onBack,
  onSave,
  onOpenQuest,
}: GoalChainPageProps) {
  const existingChain = chainIdx !== null ? act.chains[chainIdx] : null;
  const [draft, setDraft] = useState<Chain>(
    existingChain ? { ...existingChain } : createBlankChain(act.chains.length),
  );
  const [activeTab, setActiveTab] = useState<WoopTab>('wish');
  const [expandedQuestIdx, setExpandedQuestIdx] = useState<number | null>(null);
  const [draggingQuestIdx, setDraggingQuestIdx] = useState<number | null>(null);
  const scheduleTaskTemplates = useScheduleStore((state) => state.taskTemplates);
  const scheduleTasks = useScheduleStore((state) => state.tasks);

  const completedTaskTemplateRefs = new Set(
    Object.values(scheduleTasks)
      .filter((task) => task.completionState === 'complete')
      .map((task) => task.templateRef),
  );

  function persist(updatedChain: Chain): { act: Act; index: number } {
    const updatedChains = [...act.chains];
    const nextIndex = chainIdx ?? updatedChains.length;
    updatedChains[nextIndex] = updatedChain;
    const updatedAct = normalizeActForSave({ ...act, chains: updatedChains });
    return { act: updatedAct, index: nextIndex };
  }

  function saveAndExit() {
    onSave(persist(draft).act);
  }

  function openQuest(questIdx: number | null) {
    const next = persist(draft);
    onOpenQuest(next.act, next.index, questIdx);
  }

  function updateQuestAt(index: number, updater: (quest: Quest) => Quest) {
    setDraft((current) => ({
      ...current,
      quests: current.quests.map((quest, questIdx) => questIdx === index ? updater(quest) : quest),
    }));
  }

  function moveQuest(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    setDraft((current) => {
      const quests = [...current.quests];
      const [moved] = quests.splice(fromIdx, 1);
      quests.splice(toIdx, 0, moved);
      return { ...current, quests };
    });
    setExpandedQuestIdx(toIdx);
  }

  function getCompletionNeededLabel(targetValue: number) {
    const safeTarget = Math.max(1, targetValue || 1);
    return `${safeTarget} completion${safeTarget === 1 ? '' : 's'} needed`;
  }

  const footer = (
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
        disabled={readOnly}
        onClick={saveAndExit}
        className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        Save
      </button>
    </>
  );

  return (
    <GoalPageShell
      title={draft.name || 'Chain'}
      subtitle={readOnly ? 'Read-only chain' : 'WOOP chain editor'}
      onBack={onBack}
      footer={footer}
    >
      <GoalSection title="Chain">
        <div className="flex items-end gap-4">
          <div className="shrink-0 pb-0.5">
            <IconPicker value={draft.icon} onChange={(icon) => setDraft((current) => ({ ...current, icon }))} align="left" />
          </div>
          <div className="min-w-0 flex-1">
            <GoalField label="Name">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={draft.name}
                  disabled={readOnly}
                  onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))}
                  className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                />
                <div className="shrink-0">
                <GoalStateBadge state={draft.completionState} />
                </div>
              </div>
            </GoalField>
          </div>
        </div>
        <GoalField label="Description">
          <textarea
            value={draft.description}
            disabled={readOnly}
            onChange={(e) => setDraft((current) => ({ ...current, description: e.target.value }))}
            rows={4}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
          />
        </GoalField>
      </GoalSection>

      <GoalSection title="WOOP">
        <div className="flex flex-row flex-nowrap gap-2">
          {(['wish', 'outcome', 'obstacle', 'plan'] as WoopTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`min-w-0 flex-1 rounded-xl px-3 py-2 text-sm font-semibold uppercase tracking-wide ${
                activeTab === tab
                  ? 'bg-emerald-600 text-white'
                  : 'border border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-200'
              }`}
            >
              <span className="block truncate">{tab === 'wish' ? 'W' : tab === 'outcome' ? 'O' : tab === 'obstacle' ? 'O' : 'P'}</span>
            </button>
          ))}
        </div>

        {activeTab !== 'plan' ? (
          <div className="rounded-3xl bg-gradient-to-br from-emerald-50 via-sky-50 to-amber-50 p-6 dark:from-emerald-950/40 dark:via-sky-950/30 dark:to-amber-950/20">
            <textarea
              value={activeTab === 'wish' ? draft.wish : activeTab === 'outcome' ? draft.outcome : draft.obstacle}
              disabled={readOnly}
              onChange={(e) => {
                const value = e.target.value;
                setDraft((current) => ({
                  ...current,
                  wish: activeTab === 'wish' ? value : current.wish,
                  outcome: activeTab === 'outcome' ? value : current.outcome,
                  obstacle: activeTab === 'obstacle' ? value : current.obstacle,
                }));
              }}
              placeholder={
                activeTab === 'wish'
                  ? 'What do you want to achieve?'
                  : activeTab === 'outcome'
                    ? 'What does success look like?'
                    : 'What might get in the way?'
              }
              rows={10}
              className="min-h-[18rem] w-full resize-none rounded-2xl bg-white/70 px-4 py-4 text-lg text-gray-800 outline-none dark:bg-gray-900/60 dark:text-gray-100"
            />
          </div>
        ) : (
          <div className="grid min-h-[22rem] grid-cols-1 gap-2 md:grid-cols-2">
            <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 p-4 dark:from-emerald-950/40 dark:to-emerald-900/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Wish</p>
              <p className="mt-2 line-clamp-6 text-sm text-gray-700 dark:text-gray-200">{draft.wish || 'No wish written yet.'}</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-sky-100 p-4 dark:from-sky-950/40 dark:to-sky-900/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">Outcome</p>
              <p className="mt-2 line-clamp-6 text-sm text-gray-700 dark:text-gray-200">{draft.outcome || 'No outcome written yet.'}</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100 p-4 dark:from-amber-950/40 dark:to-amber-900/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Obstacle</p>
              <p className="mt-2 line-clamp-6 text-sm text-gray-700 dark:text-gray-200">{draft.obstacle || 'No obstacle written yet.'}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-700 md:col-span-2">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Plan Quests</p>
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={() => openQuest(null)}
                    className="text-xs font-medium text-emerald-600"
                  >
                    + Add Quest
                  </button>
                ) : null}
              </div>
              <div className="space-y-2">
                {draft.quests.map((quest, questIdx) => {
                  const expanded = expandedQuestIdx === questIdx;
                  const displayState = getQuestDisplayState(draft, questIdx);
                  const isUnlocked = displayState !== 'pending';
                  const taskTemplatePills = getQuestTaskTemplates(quest, scheduleTaskTemplates);

                  return (
                    <div
                      key={`${quest.name}-${questIdx}`}
                      draggable={!readOnly}
                      onDragStart={() => setDraggingQuestIdx(questIdx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (draggingQuestIdx === null) return;
                        moveQuest(draggingQuestIdx, questIdx);
                        setDraggingQuestIdx(null);
                      }}
                      className="rounded-xl border border-gray-200 dark:border-gray-700"
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setExpandedQuestIdx((current) => current === questIdx ? null : questIdx)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setExpandedQuestIdx((current) => current === questIdx ? null : questIdx);
                          }
                        }}
                        className="w-full cursor-pointer px-3 py-3 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={(e) => e.stopPropagation()}
                            className="cursor-grab rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-500 disabled:cursor-default dark:border-gray-600"
                          >
                            ::
                          </button>
                          <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                            {quest.name || `Quest ${questIdx + 1}`}
                          </p>
                          <div className="w-36 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={getQuestUnlockMode(quest)}
                              disabled={readOnly}
                              onChange={(e) => updateQuestAt(questIdx, (current) => setQuestUnlockMode(current, e.target.value as 'immediate' | 'previousComplete' | 'manual'))}
                              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                            >
                              <option value="immediate">Immediate</option>
                              <option value="previousComplete">After previous</option>
                              <option value="manual">Manual</option>
                            </select>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400">{quest.progressPercent}%</span>
                          <div className="min-w-0 flex-1">
                            <GoalProgressBar value={quest.progressPercent} />
                          </div>
                          <GoalStateBadge state={displayState} />
                        </div>
                      </div>

                      {expanded ? (
                        <div className="space-y-3 border-t border-gray-200 px-3 py-3 dark:border-gray-700">
                          <p className="line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
                            {quest.description || 'No description yet.'}
                          </p>
                          {taskTemplatePills.length > 0 || quest.measurable.resourceRef ? (
                            <div className="flex flex-wrap gap-2">
                              {taskTemplatePills.map(({ ref, template }) => (
                                <div
                                  key={ref}
                                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${
                                    isUnlocked && completedTaskTemplateRefs.has(ref)
                                      ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                                      : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
                                  }`}
                                >
                                  <IconDisplay iconKey={template?.icon ?? 'task'} size={14} className="h-3.5 w-3.5 object-contain" alt="" />
                                  <span>{template?.name ?? ref}</span>
                                </div>
                              ))}
                              {quest.measurable.resourceRef ? (
                                <div
                                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${
                                    isUnlocked && quest.progressPercent > 0
                                      ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                                      : 'bg-sky-50 text-sky-800 dark:bg-sky-950/30 dark:text-sky-200'
                                  }`}
                                >
                                  <IconDisplay iconKey="resource" size={14} className="h-3.5 w-3.5 object-contain" alt="" />
                                  <span>{quest.measurable.resourceRef}</span>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          <div className="flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
                            <span>{getCompletionNeededLabel(quest.specific.targetValue)}</span>
                            <span className="truncate text-right">{getQuestTimelySummary(quest)}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => openQuest(questIdx)}
                            className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            Open Quest
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </GoalSection>
    </GoalPageShell>
  );
}
