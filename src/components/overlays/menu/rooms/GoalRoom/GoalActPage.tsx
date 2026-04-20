import { useMemo, useState } from 'react';
import type { Act } from '../../../../../types';
import { useResourceStore } from '../../../../../stores/useResourceStore';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { IconPicker } from '../../../../shared/IconPicker';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { GoalField, GoalPageShell, GoalProgressBar, GoalSection, GoalStateBadge } from './GoalEditorShared';
import {
  getActToggle,
  getChainProgressPercent,
  getQuestDisplayState,
  getQuestTaskTemplates,
  getQuestTimelySummary,
  getUnlockConditionLabel,
  normalizeActForSave,
} from './goalEditorUtils';
import { starterTaskTemplates } from '../../../../../coach/StarterQuestLibrary';

interface GoalActPageProps {
  act: Act;
  readOnly: boolean;
  onBack: () => void;
  onCancel: () => void;
  onSave: (act: Act) => void;
  onOpenChain: (act: Act, chainIdx: number | null) => void;
  onOpenQuest: (act: Act, chainIdx: number, questIdx: number) => void;
}

export function GoalActPage({
  act,
  readOnly,
  onBack,
  onCancel,
  onSave,
  onOpenChain,
  onOpenQuest,
}: GoalActPageProps) {
  const [draft, setDraft] = useState<Act>(normalizeActForSave(act));
  const [expandedChainIdx, setExpandedChainIdx] = useState<number | null>(null);
  const scheduleTaskTemplates = useScheduleStore((state) => state.taskTemplates);
  const scheduleTasks = useScheduleStore((state) => state.tasks);
  const resources = useResourceStore((state) => state.resources);

  function updateDraft(partial: Partial<Act>) {
    setDraft((current) => normalizeActForSave({ ...current, ...partial }));
  }

  function updateToggle<K extends keyof NonNullable<Act['toggle']>>(key: K, value: NonNullable<Act['toggle']>[K]) {
    const nextToggle = { ...getActToggle(draft), [key]: value };
    updateDraft({ toggle: nextToggle });
  }

  function commitAndOpenChain(chainIdx: number | null) {
    const normalized = normalizeActForSave(draft);
    setDraft(normalized);
    onOpenChain(normalized, chainIdx);
  }

  function commitAndOpenQuest(chainIdx: number, questIdx: number) {
    const normalized = normalizeActForSave(draft);
    setDraft(normalized);
    onOpenQuest(normalized, chainIdx, questIdx);
  }

  const activeChain = useMemo(() => {
    const activeChainIndex = getActToggle(draft).activeChainIndex;
    return draft.chains[activeChainIndex] ?? null;
  }, [draft]);

  const activeQuests = useMemo(
    () => activeChain?.quests.filter((_, questIdx) => getQuestDisplayState(activeChain, questIdx) === 'active') ?? [],
    [activeChain],
  );

  const commitmentSummary = useMemo(() => {
    const taskTemplateRefs = Array.from(new Set(
      activeQuests.flatMap((quest) => quest.measurable.taskTemplateRefs ?? []),
    ));
    const resourceRefs = Array.from(new Set(
      activeQuests.flatMap((quest) => {
        const refs: string[] = [];
        if (quest.measurable.resourceRef) refs.push(quest.measurable.resourceRef);
        if (quest.specific.resourceRef) refs.push(quest.specific.resourceRef);
        return refs;
      }),
    ));

    const coachTemplateMap = new Map(
      starterTaskTemplates
        .filter((template): template is typeof template & { id: string } => !!template.id)
        .map((template) => [template.id, template]),
    );

    return {
      templates: taskTemplateRefs.map((ref) => ({
        ref,
        template: scheduleTaskTemplates[ref] ?? coachTemplateMap.get(ref) ?? null,
      })),
      resources: resourceRefs
        .map((ref) => resources[ref])
        .filter((resource): resource is NonNullable<typeof resource> => !!resource),
    };
  }, [activeQuests, resources, scheduleTaskTemplates]);

  const completedTaskTemplateRefs = useMemo(
    () => new Set(
      Object.values(scheduleTasks)
        .filter((task) => task.completionState === 'complete')
        .map((task) => task.templateRef),
    ),
    [scheduleTasks],
  );

  function getCompletionNeededLabel(targetValue: number) {
    const safeTarget = Math.max(1, targetValue || 1);
    return `${safeTarget} completion${safeTarget === 1 ? '' : 's'} needed`;
  }

  const footer = (
    <>
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        Cancel
      </button>
      <button
        type="button"
        disabled={readOnly}
        onClick={() => onSave(normalizeActForSave(draft))}
        className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        Save
      </button>
    </>
  );

  return (
    <GoalPageShell
      title={draft.name || 'Act'}
      subtitle={readOnly ? 'Read-only adventure' : 'Habitat act editor'}
      onBack={onBack}
      footer={footer}
    >
      <GoalSection title="Act">
        <div className="flex items-end gap-4">
          <div className="shrink-0 pb-0.5">
            <IconPicker
              value={draft.icon}
              onChange={(icon) => updateDraft({ icon })}
              align="left"
            />
          </div>
          <div className="min-w-0 flex-1">
            <GoalField label="Name">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={draft.name}
                  disabled={readOnly}
                  onChange={(e) => updateDraft({ name: e.target.value })}
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
            onChange={(e) => updateDraft({ description: e.target.value })}
            rows={4}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
          />
        </GoalField>
      </GoalSection>

      <GoalSection title="Chains">
        <div className="space-y-3">
          {draft.chains.map((chain, chainIdx) => {
            const isExpanded = expandedChainIdx === chainIdx;
            const progress = getChainProgressPercent(chain);
            const isActive = getActToggle(draft).activeChainIndex === chainIdx;
            return (
              <div key={`${chain.name}-${chainIdx}`} className="rounded-2xl border border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setExpandedChainIdx((current) => current === chainIdx ? null : chainIdx)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <IconDisplay iconKey={chain.icon} size={20} className="h-5 w-5 shrink-0 object-contain" alt="" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {chain.name || `Chain ${chainIdx + 1}`}
                      </p>
                      {isActive ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                          Active
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1">
                      <GoalProgressBar value={progress} />
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">{isExpanded ? 'Hide' : 'Show'}</span>
                </button>
                {isExpanded ? (
                  <div className="space-y-3 border-t border-gray-200 px-4 py-3 text-sm dark:border-gray-700">
                    <p className="text-gray-600 dark:text-gray-300">
                      {chain.quests.length} quests • {chain.completionState} • {getUnlockConditionLabel(chain.unlockCondition)}
                    </p>
                    <div className="space-y-2">
                      {chain.quests.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">No quests yet.</p>
                      ) : (
                        chain.quests.map((quest, questIdx) => {
                          const taskTemplatePills = getQuestTaskTemplates(quest, scheduleTaskTemplates);
                          const displayState = getQuestDisplayState(chain, questIdx);
                          const isUnlocked = displayState !== 'pending';
                          return (
                            <button
                              key={`${quest.name}-${questIdx}`}
                              type="button"
                              onClick={() => commitAndOpenQuest(chainIdx, questIdx)}
                              className="w-full rounded-xl border border-gray-200 px-3 py-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                            >
                              <div className="flex items-center gap-2">
                                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                                  {quest.name || `Quest ${questIdx + 1}`}
                                </p>
                                <span className="text-xs text-gray-500 dark:text-gray-400">{quest.progressPercent}%</span>
                                <GoalStateBadge state={displayState} />
                              </div>
                              <div className="mt-2">
                                <GoalProgressBar value={quest.progressPercent} />
                              </div>
                              <p className="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
                                {quest.description || 'No description yet.'}
                              </p>
                              {taskTemplatePills.length > 0 || quest.measurable.resourceRef ? (
                                <div className="mt-2 flex flex-wrap gap-2">
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
                                      <span>{resources[quest.measurable.resourceRef]?.name ?? quest.measurable.resourceRef}</span>
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
                                <span>{getCompletionNeededLabel(quest.specific.targetValue)}</span>
                                <span className="truncate text-right">{getQuestTimelySummary(quest)}</span>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => commitAndOpenChain(chainIdx)}
                        className="rounded-xl bg-sky-600 px-3 py-2 text-sm font-medium text-white"
                      >
                        Open Chain
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!readOnly ? (
            <button
              type="button"
              onClick={() => commitAndOpenChain(null)}
              className="w-full rounded-2xl border border-dashed border-emerald-400 px-4 py-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
            >
              + Add Chain
            </button>
          ) : null}
        </div>
      </GoalSection>

      <GoalSection title="Act Area">
        <GoalField label="Accountability">
          <div className="rounded-xl bg-gray-100 px-3 py-3 text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-400">
            Share progress with contacts - coming in a future update
          </div>
        </GoalField>

        <GoalField
          label="Commitment"
          hint={
            activeQuests.length > 0
              ? `Tracking active quest${activeQuests.length === 1 ? '' : 's'}: ${activeQuests.map((quest) => quest.name || 'Unnamed quest').join(', ')}`
              : activeChain
                ? `Tracking the active chain: ${activeChain.name || 'Unnamed chain'}`
                : 'No active chain selected'
          }
        >
          <div className="space-y-3 rounded-xl border border-gray-200 px-3 py-3 dark:border-gray-700">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Tasks
              </p>
              {commitmentSummary.templates.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No measurable task templates on the active quests yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {commitmentSummary.templates.map(({ ref, template }) => (
                    <div
                      key={ref}
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${
                        completedTaskTemplateRefs.has(ref)
                          ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                          : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
                      }`}
                    >
                      <IconDisplay iconKey={template?.icon ?? 'task'} size={16} className="h-4 w-4 object-contain" alt="" />
                      <span>{template?.name ?? ref}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Resources
              </p>
              {commitmentSummary.resources.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No measurable resources on the active quests yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {commitmentSummary.resources.map((resource) => (
                    <div
                      key={resource.id}
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${
                        activeQuests.some((quest) => quest.progressPercent > 0)
                          ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                          : 'bg-sky-50 text-sky-800 dark:bg-sky-950/30 dark:text-sky-200'
                      }`}
                    >
                      <IconDisplay iconKey={resource.icon} size={16} className="h-4 w-4 object-contain" alt="" />
                      <span>{resource.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </GoalField>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Toggle Area</h4>
          <div className="grid grid-cols-2 gap-4">
          <GoalField label="Auto-advance chains">
            <label className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-700">
              <span className="text-sm text-gray-700 dark:text-gray-200">Enabled</span>
              <input
                type="checkbox"
                checked={getActToggle(draft).autoAdvanceChains}
                disabled={readOnly}
                onChange={(e) => updateToggle('autoAdvanceChains', e.target.checked)}
                className="h-4 w-4 accent-emerald-600"
              />
            </label>
          </GoalField>

          <GoalField label="Sleep with chain">
            <label className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-700">
              <span className="text-sm text-gray-700 dark:text-gray-200">Enabled</span>
              <input
                type="checkbox"
                checked={getActToggle(draft).sleepWithChain}
                disabled={readOnly}
                onChange={(e) => updateToggle('sleepWithChain', e.target.checked)}
                className="h-4 w-4 accent-emerald-600"
              />
            </label>
          </GoalField>
          </div>
        </div>

        <GoalField label="Active chain">
          <select
            value={String(getActToggle(draft).activeChainIndex)}
            disabled={readOnly || draft.chains.length === 0}
            onChange={(e) => updateToggle('activeChainIndex', parseInt(e.target.value, 10) || 0)}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
          >
            {draft.chains.map((chain, idx) => (
              <option key={`${chain.name}-${idx}`} value={idx}>
                {chain.name || `Chain ${idx + 1}`}
              </option>
            ))}
          </select>
        </GoalField>
      </GoalSection>
    </GoalPageShell>
  );
}
