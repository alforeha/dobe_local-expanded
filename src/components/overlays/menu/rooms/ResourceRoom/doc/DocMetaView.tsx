import { starterTaskTemplates } from '../../../../../../coach/StarterQuestLibrary';
import { getItemTemplateByRef } from '../../../../../../coach/ItemLibrary';
import type { ContractTask, DocResource } from '../../../../../../types/resource';
import type { Task } from '../../../../../../types/task';
import type { InputFields, TaskTemplate } from '../../../../../../types/taskTemplate';
import { isHome, isVehicle } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useScheduleStore } from '../../../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { getLibraryTemplatePool, resolveTaskTemplate } from '../../../../../../utils/resolveTaskTemplate';
import { resolveTaskDisplayName } from '../../../../../../utils/resolveTaskDisplayName';
import { getUserInventoryItemTemplates } from '../../../../../../utils/inventoryItems';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { ResourceMetaTabs } from '../shared/ResourceMetaTabs';

interface DocMetaViewProps {
  resource: DocResource;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function contractTaskToDisplayTask(task: ContractTask): Task {
  return {
    id: task.id,
    templateRef: task.isUnique ? null : (task.templateRef ?? null),
    isUnique: task.isUnique,
    title: task.title ?? null,
    taskType: task.taskType ?? null,
    completionState: 'pending',
    completedAt: null,
    resultFields: (task.parameters ?? {}) as Partial<InputFields>,
    attachmentRef: null,
    resourceRef: null,
    location: null,
    sharedWith: null,
    questRef: null,
    actRef: null,
    secondaryTag: null,
  };
}

function getContractTaskDisplayName(
  task: ContractTask,
  templates: Record<string, TaskTemplate>,
): string {
  return resolveTaskDisplayName(contractTaskToDisplayTask(task), templates, starterTaskTemplates);
}

function getContractTaskDisplayType(
  task: ContractTask,
  templates: Record<string, TaskTemplate>,
  libraryTemplates: TaskTemplate[],
): string {
  if (task.isUnique) return task.taskType ?? 'Unique';
  if (!task.templateRef) return task.taskType ?? 'Template';
  return resolveTaskTemplate(task.templateRef, templates, starterTaskTemplates, libraryTemplates)?.taskType
    ?? task.taskType
    ?? 'Template';
}

function getExpiryState(expiryDate: string | undefined, expiryLeadDays: number | undefined): {
  label: string;
  tone: string;
} | null {
  if (!expiryDate) return null;

  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const expiry = new Date(`${expiryDate}T00:00:00`);
  const expiryUtc = Date.UTC(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
  const days = Math.round((expiryUtc - todayUtc) / 86400000);
  const lead = expiryLeadDays ?? 30;

  if (days < 0) {
    return { label: 'Expired', tone: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' };
  }
  if (days <= lead) {
    return { label: `Expires in ${days} day${days === 1 ? '' : 's'}`, tone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
  }
  return null;
}

export function DocMetaView({ resource }: DocMetaViewProps) {
  const allResources = useResourceStore((s) => s.resources);
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);
  const user = useUserStore((s) => s.user);
  const libraryTemplates = getLibraryTemplatePool();

  function resolveItemName(itemRef: string): string {
    const libItem = getItemTemplateByRef(itemRef);
    if (libItem) return libItem.name;
    const userItem = getUserInventoryItemTemplates(user).find((template) => template.id === itemRef);
    return userItem?.name ?? itemRef;
  }

  const headerRow = (
    <div className="mb-2 flex items-center gap-2">
      <IconDisplay iconKey={resource.icon} size={20} className="h-5 w-5 shrink-0 object-contain" alt="" />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{resource.name}</div>
        <div className="text-xs text-gray-400">{capitalise(resource.docType)}</div>
      </div>
    </div>
  );

  if (resource.docType === 'layout') {
    const linkedId = resource.linkedResourceRef ?? resource.linkedResourceRefs?.[0];
    const linkedResource = linkedId ? allResources[linkedId] : undefined;
    const linkedHome = linkedResource && isHome(linkedResource) ? linkedResource : null;
    const linkedVehicle = linkedResource && isVehicle(linkedResource) ? linkedResource : null;

    const details = (
      <div className="mb-1 space-y-2 text-xs text-gray-600 dark:text-gray-300">
        {headerRow}

        <div className="inline-flex w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          Legacy Layout
        </div>

        {linkedResource ? (
          <div className="flex items-center gap-1.5">
            <IconDisplay iconKey={linkedResource.icon} size={14} className="h-3.5 w-3.5 object-contain" alt="" />
            <span className="font-medium text-gray-700 dark:text-gray-200">{linkedResource.name}</span>
          </div>
        ) : null}

        {linkedHome && (linkedHome.rooms ?? []).length > 0 ? (
          <div className="space-y-1">
            {(linkedHome.rooms ?? []).map((room) => {
              const matchingAreas = (resource.layoutAreas ?? []).filter((area) => area.roomId === room.id);
              return (
                <div key={room.id} className="rounded bg-gray-50 px-2 py-1.5 dark:bg-gray-700">
                  <div className="flex items-center gap-1.5">
                    {room.icon ? <IconDisplay iconKey={room.icon} size={12} className="h-3 w-3 object-contain" alt="" /> : null}
                    <span className="font-medium">{room.name}</span>
                    {matchingAreas.length > 0 ? (
                      <span className="ml-auto text-gray-400">{matchingAreas.length} area{matchingAreas.length === 1 ? '' : 's'}</span>
                    ) : null}
                  </div>
                  {matchingAreas.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1 pl-4">
                      {matchingAreas.map((area) => (
                        <span key={area.id} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 dark:bg-gray-600 dark:text-gray-300">{area.name}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : linkedHome ? (
          <p className="text-xs italic text-gray-400">No rooms on linked home.</p>
        ) : linkedVehicle ? (
          <div className="space-y-1">
            {(resource.layoutAreas ?? []).length === 0 ? (
              <p className="text-xs italic text-gray-400">No areas defined.</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {(resource.layoutAreas ?? []).map((area) => (
                  <span key={area.id} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-600 dark:text-gray-300">{area.name}</span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs italic text-gray-400">No linked home or vehicle.</p>
        )}
      </div>
    );

    return <ResourceMetaTabs resource={resource} details={details} />;
  }

  if (resource.docType === 'license') {
    const expiryState = getExpiryState(resource.expiryDate, resource.expiryLeadDays);

    const details = (
      <div className="mb-1 space-y-2 text-xs text-gray-600 dark:text-gray-300">
        {resource.licensePhoto ? (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
            <img src={resource.licensePhoto} alt={resource.name} className="h-40 w-full object-cover" />
          </div>
        ) : null}

        {headerRow}

        {resource.licenseNumber ? (
          <div className="flex gap-2">
            <span className="w-20 shrink-0 text-gray-400">Number</span>
            <span>{resource.licenseNumber}</span>
          </div>
        ) : null}

        {resource.expiryDate ? (
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-gray-400">Expiry</span>
            <div className="flex flex-wrap items-center gap-2">
              <span>{resource.expiryDate}</span>
              {expiryState ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${expiryState.tone}`}>{expiryState.label}</span> : null}
            </div>
          </div>
        ) : null}

        {resource.expiryLeadDays != null ? (
          <div className="flex gap-2">
            <span className="w-20 shrink-0 text-gray-400">Notify</span>
            <span>{resource.expiryLeadDays} day{resource.expiryLeadDays === 1 ? '' : 's'} before expiry</span>
          </div>
        ) : null}

        {resource.renewalNotes ? (
          <div className="flex gap-2">
            <span className="w-20 shrink-0 text-gray-400">Renewal</span>
            <span className="whitespace-pre-wrap">{resource.renewalNotes}</span>
          </div>
        ) : null}

        {!resource.licensePhoto && !resource.licenseNumber && !resource.expiryDate && !resource.renewalNotes ? (
          <p className="text-xs italic text-gray-400">No details on file.</p>
        ) : null}
      </div>
    );

    return <ResourceMetaTabs resource={resource} details={details} noteLabelWidth="w-20" />;
  }

  if (resource.docType === 'recipe') {
    const ingredients = resource.recipeIngredients ?? [];
    const steps = resource.recipeSteps ?? [];

    const details = (
      <div className="mb-1 space-y-2 text-xs text-gray-600 dark:text-gray-300">
        {headerRow}

        {ingredients.length > 0 ? (
          <div className="space-y-1">
            <span className="font-medium text-gray-500 dark:text-gray-400">Ingredients</span>
            <div className="space-y-0.5">
              {ingredients.map((ingredient) => {
                const name = ingredient.itemRef ? resolveItemName(ingredient.itemRef) : ingredient.name;
                const qty = ingredient.quantity != null ? String(ingredient.quantity) : '';
                const unit = ingredient.unit ?? '';
                return (
                  <div key={ingredient.id} className="flex items-center gap-2 rounded bg-gray-50 px-2 py-1 dark:bg-gray-700">
                    <span className="flex-1">{name}</span>
                    {qty || unit ? (
                      <span className="shrink-0 text-gray-400">{[qty, unit].filter(Boolean).join(' ')}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {steps.length > 0 ? (
          <div className="space-y-1">
            <span className="font-medium text-gray-500 dark:text-gray-400">Steps</span>
            <ol className="space-y-0.5 pl-0">
              {steps.map((step, index) => (
                <li key={step.id} className="flex items-start gap-1.5 rounded bg-gray-50 px-2 py-1 dark:bg-gray-700">
                  <span className="shrink-0 font-medium text-gray-400">{index + 1}.</span>
                  <span>{step.text}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {ingredients.length === 0 && steps.length === 0 ? (
          <p className="text-xs italic text-gray-400">No details on file.</p>
        ) : null}
      </div>
    );

    return <ResourceMetaTabs resource={resource} details={details} noteLabelWidth="w-20" />;
  }

  if (resource.docType === 'contract') {
    const contractContacts = (resource.linkedContactIds ?? []).map((id) => allResources[id]).filter(Boolean);
    const contractAccount = resource.linkedAccountId ? allResources[resource.linkedAccountId] : undefined;
    const deposit = resource.contractDepositTemplate;
    const contractTasks = resource.contractTasks?.length
      ? resource.contractTasks
      : (resource.trackedTasks ?? []).map((taskName, index) => ({
          id: `legacy-${index}`,
          isUnique: true,
          title: taskName,
        } satisfies ContractTask));

    const details = (
      <div className="mb-1 space-y-2 text-xs text-gray-600 dark:text-gray-300">
        {headerRow}

        {contractContacts.length > 0 ? (
          <div className="flex items-start gap-2">
            <span className="w-20 shrink-0 text-gray-400">Contacts</span>
            <div className="flex flex-wrap gap-1">
              {contractContacts.map((contact) => (
                <span
                  key={contact.id}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                >
                  <IconDisplay iconKey={contact.icon} size={12} className="h-3 w-3 object-contain" alt="" />
                  <span>{contact.name}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {contractAccount ? (
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-gray-400">Account</span>
            <span className="inline-flex items-center gap-1">
              <IconDisplay iconKey={contractAccount.icon} size={12} className="h-3 w-3 object-contain" alt="" />
              <span>{contractAccount.name}</span>
            </span>
          </div>
        ) : null}

        {deposit?.name ? (
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-gray-400">Deposit</span>
            <span>
              {deposit.name}
              {deposit.value != null ? ` — $${deposit.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
            </span>
          </div>
        ) : null}

        {contractTasks.length > 0 ? (
          <div className="flex items-start gap-2">
            <span className="w-20 shrink-0 text-gray-400">Tasks</span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {contractTasks.map((task) => (
                <div key={task.id} className="rounded bg-gray-50 px-2 py-1.5 dark:bg-gray-700">
                  <div className="font-medium text-gray-800 dark:text-gray-100">{getContractTaskDisplayName(task, taskTemplates)}</div>
                  <div className="text-[11px] text-gray-400">{getContractTaskDisplayType(task, taskTemplates, libraryTemplates)}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!contractContacts.length && !contractAccount && !deposit?.name && contractTasks.length === 0 ? (
          <p className="text-xs italic text-gray-400">No details on file.</p>
        ) : null}
      </div>
    );

    return <ResourceMetaTabs resource={resource} details={details} noteLabelWidth="w-20" />;
  }

  const manualLinked = resource.docType === 'manual' && resource.linkedResourceRef
    ? allResources[resource.linkedResourceRef]
    : undefined;

  const manualLinkedName = (() => {
    if (!resource.linkedResourceRef) return null;
    if (manualLinked) return manualLinked.name;
    const libItem = getItemTemplateByRef(resource.linkedResourceRef);
    if (libItem) return libItem.name;
    const userItem = getUserInventoryItemTemplates(user).find((template) => template.id === resource.linkedResourceRef);
    return userItem?.name ?? null;
  })();

  const hasAny = !!resource.url || !!manualLinkedName;

  const details = (
    <div className="mb-1 space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
      {headerRow}

      {resource.docType === 'course' ? (
        <p className="text-xs italic text-gray-400">Course content — coming soon.</p>
      ) : !hasAny ? (
        <p className="text-xs italic text-gray-400">No details on file.</p>
      ) : null}

      {resource.url ? (
        <div className="flex gap-2">
          <span className="w-20 shrink-0 text-gray-400">URL</span>
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-blue-500 underline underline-offset-2 hover:text-blue-600"
          >
            {resource.url}
          </a>
        </div>
      ) : null}

      {manualLinkedName ? (
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-gray-400">For</span>
          {manualLinked ? (
            <span className="inline-flex items-center gap-1">
              <IconDisplay iconKey={manualLinked.icon} size={12} className="h-3 w-3 object-contain" alt="" />
              <span>{manualLinked.name}</span>
            </span>
          ) : (
            <span>{manualLinkedName}</span>
          )}
        </div>
      ) : null}
    </div>
  );

  return <ResourceMetaTabs resource={resource} details={details} noteLabelWidth="w-20" />;
}