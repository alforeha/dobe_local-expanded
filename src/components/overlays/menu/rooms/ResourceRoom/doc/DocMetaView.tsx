import type { DocResource } from '../../../../../../types/resource';
import { isHome, isVehicle } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { getItemTemplateByRef } from '../../../../../../coach/ItemLibrary';
import { getUserInventoryItemTemplates } from '../../../../../../utils/inventoryItems';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { ResourceMetaTabs } from '../shared/ResourceMetaTabs';

interface DocMetaViewProps {
  resource: DocResource;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function DocMetaView({ resource }: DocMetaViewProps) {
  const allResources = useResourceStore((s) => s.resources);
  const user = useUserStore((s) => s.user);

  // Resolve item name from itemRef (library + user templates)
  function resolveItemName(itemRef: string): string {
    const libItem = getItemTemplateByRef(itemRef);
    if (libItem) return libItem.name;
    const userItem = getUserInventoryItemTemplates(user).find((t) => t.id === itemRef);
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

  // ── Layout ────────────────────────────────────────────────────
  if (resource.docType === 'layout') {
    const linkedId = resource.linkedResourceRef ?? resource.linkedResourceRefs?.[0];
    const linkedResource = linkedId ? allResources[linkedId] : undefined;
    const linkedHome = linkedResource && isHome(linkedResource) ? linkedResource : null;
    const linkedVehicle = linkedResource && isVehicle(linkedResource) ? linkedResource : null;

    const details = (
      <div className="mb-1 space-y-2 text-xs text-gray-600 dark:text-gray-300">
        {headerRow}

        {linkedResource ? (
          <div className="flex items-center gap-1.5">
            <IconDisplay iconKey={linkedResource.icon} size={14} className="h-3.5 w-3.5 object-contain" alt="" />
            <span className="font-medium text-gray-700 dark:text-gray-200">{linkedResource.name}</span>
          </div>
        ) : null}

        {linkedHome && (linkedHome.rooms ?? []).length > 0 ? (
          <div className="space-y-1">
            {(linkedHome.rooms ?? []).map((room) => {
              const matchingAreas = (resource.layoutAreas ?? []).filter((a) => a.roomId === room.id);
              return (
                <div key={room.id} className="rounded bg-gray-50 px-2 py-1.5 dark:bg-gray-700">
                  <div className="flex items-center gap-1.5">
                    {room.icon ? <IconDisplay iconKey={room.icon} size={12} className="h-3 w-3 object-contain" alt="" /> : null}
                    <span className="font-medium">{room.name}</span>
                    {matchingAreas.length > 0 && (
                      <span className="ml-auto text-gray-400">{matchingAreas.length} area{matchingAreas.length === 1 ? '' : 's'}</span>
                    )}
                  </div>
                  {matchingAreas.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1 pl-4">
                      {matchingAreas.map((a) => (
                        <span key={a.id} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 dark:bg-gray-600 dark:text-gray-300">{a.name}</span>
                      ))}
                    </div>
                  )}
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
                {(resource.layoutAreas ?? []).map((a) => (
                  <span key={a.id} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-600 dark:text-gray-300">{a.name}</span>
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

  // ── Recipe ────────────────────────────────────────────────────
  if (resource.docType === 'recipe') {
    const ingredients = resource.recipeIngredients ?? [];
    const steps = resource.recipeSteps ?? [];

    const details = (
      <div className="mb-1 space-y-2 text-xs text-gray-600 dark:text-gray-300">
        {headerRow}

        {ingredients.length > 0 && (
          <div className="space-y-1">
            <span className="font-medium text-gray-500 dark:text-gray-400">Ingredients</span>
            <div className="space-y-0.5">
              {ingredients.map((ing) => {
                const name = ing.itemRef ? resolveItemName(ing.itemRef) : ing.name;
                const qty = ing.quantity != null ? String(ing.quantity) : '';
                const unit = ing.unit ?? '';
                return (
                  <div key={ing.id} className="flex items-center gap-2 rounded bg-gray-50 px-2 py-1 dark:bg-gray-700">
                    <span className="flex-1">{name}</span>
                    {(qty || unit) && (
                      <span className="shrink-0 text-gray-400">{[qty, unit].filter(Boolean).join(' ')}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {steps.length > 0 && (
          <div className="space-y-1">
            <span className="font-medium text-gray-500 dark:text-gray-400">Steps</span>
            <ol className="space-y-0.5 pl-0">
              {steps.map((step, idx) => (
                <li key={step.id} className="flex items-start gap-1.5 rounded bg-gray-50 px-2 py-1 dark:bg-gray-700">
                  <span className="shrink-0 font-medium text-gray-400">{idx + 1}.</span>
                  <span>{step.text}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {ingredients.length === 0 && steps.length === 0 && (
          <p className="text-xs italic text-gray-400">No details on file.</p>
        )}
      </div>
    );

    return <ResourceMetaTabs resource={resource} details={details} noteLabelWidth="w-20" />;
  }

  // ── Contract ──────────────────────────────────────────────────
  if (resource.docType === 'contract') {
    const contractContacts = (resource.linkedContactIds ?? []).map((id) => allResources[id]).filter(Boolean);
    const contractAccount = resource.linkedAccountId ? allResources[resource.linkedAccountId] : undefined;
    const deposit = resource.contractDepositTemplate;
    const trackedTasks = resource.trackedTasks ?? [];

    const details = (
      <div className="mb-1 space-y-2 text-xs text-gray-600 dark:text-gray-300">
        {headerRow}

        {contractContacts.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="w-20 shrink-0 text-gray-400">Contacts</span>
            <div className="flex flex-wrap gap-1">
              {contractContacts.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                >
                  <IconDisplay iconKey={c.icon} size={12} className="h-3 w-3 object-contain" alt="" />
                  <span>{c.name}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {contractAccount && (
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-gray-400">Account</span>
            <span className="inline-flex items-center gap-1">
              <IconDisplay iconKey={contractAccount.icon} size={12} className="h-3 w-3 object-contain" alt="" />
              <span>{contractAccount.name}</span>
            </span>
          </div>
        )}

        {deposit?.name && (
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-gray-400">Deposit</span>
            <span>
              {deposit.name}
              {deposit.value != null ? ` — $${deposit.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
            </span>
          </div>
        )}

        {trackedTasks.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="w-20 shrink-0 text-gray-400">Tasks</span>
            <div className="flex flex-wrap gap-1">
              {trackedTasks.map((t, idx) => (
                <span key={idx} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 dark:bg-gray-600 dark:text-gray-300">{t}</span>
              ))}
            </div>
          </div>
        )}

        {!contractContacts.length && !contractAccount && !deposit?.name && !trackedTasks.length && (
          <p className="text-xs italic text-gray-400">No details on file.</p>
        )}
      </div>
    );

    return <ResourceMetaTabs resource={resource} details={details} noteLabelWidth="w-20" />;
  }

  // ── Reference / Manual / Course / fallback ────────────────────
  const manualLinked = resource.docType === 'manual' && resource.linkedResourceRef
    ? allResources[resource.linkedResourceRef]
    : undefined;

  const manualLinkedName = (() => {
    if (!resource.linkedResourceRef) return null;
    if (manualLinked) return manualLinked.name;
    // Could be an item template ref
    const libItem = getItemTemplateByRef(resource.linkedResourceRef);
    if (libItem) return libItem.name;
    const userItem = getUserInventoryItemTemplates(user).find((t) => t.id === resource.linkedResourceRef);
    return userItem?.name ?? null;
  })();

  const hasAny =
    !!resource.url ||
    !!manualLinkedName;

  const details = (
    <div className="mb-1 space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
      {headerRow}

      {resource.docType === 'course' ? (
        <p className="text-xs italic text-gray-400">Course content — coming soon.</p>
      ) : !hasAny ? (
        <p className="text-xs italic text-gray-400">No details on file.</p>
      ) : null}

      {resource.url && (
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
      )}

      {manualLinkedName && (
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
      )}
    </div>
  );

  return <ResourceMetaTabs resource={resource} details={details} noteLabelWidth="w-20" />;
}
