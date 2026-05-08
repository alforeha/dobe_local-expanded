import { useEffect, useMemo, useRef, useState } from 'react';
import type { Resource, ResourceLink, ResourceType } from '../../types/resource';
import { getRelationshipOptions } from '../../types/resource';
import { useResourceStore } from '../../stores/useResourceStore';
import { IconDisplay } from './IconDisplay';

interface ResourceLinksTabNewProps {
  resource: Resource;
  pendingAutoLinkId?: string;
  pendingAutoLinkRelationship?: string;
}

interface ReverseLinkEntry {
  key: string;
  sourceId: string;
  relationship: string;
  createdAt: string;
}

const TYPE_LABELS: Record<ResourceType, string> = {
  contact: 'Contact',
  home: 'Home',
  vehicle: 'Vehicle',
  account: 'Account',
  inventory: 'Inventory',
  doc: 'Doc',
};

function sortByResourceName(entries: Array<{ targetId: string }>, resources: Record<string, Resource>) {
  return [...entries].sort((left, right) => {
    const leftName = resources[left.targetId]?.name ?? '';
    const rightName = resources[right.targetId]?.name ?? '';
    return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' });
  });
}

function buildReverseLinks(currentResource: Resource, resources: Record<string, Resource>): ReverseLinkEntry[] {
  const mirroredCurrentLinks = (currentResource.links ?? [])
    .filter((link) => link.isMirrored === true)
    .map((link) => ({
      key: `mirror:${link.id}`,
      sourceId: link.targetResourceId,
      relationship: link.relationship,
      createdAt: link.createdAt,
    }));

  const mirroredSourceIds = new Set(mirroredCurrentLinks.map((link) => link.sourceId));

  const scannedIncomingLinks = Object.values(resources)
    .filter((entry) => entry.id !== currentResource.id)
    .flatMap((entry) =>
      (entry.links ?? [])
        .filter((link) => link.targetResourceId === currentResource.id && link.isMirrored === false)
        .map((link) => ({
          key: `scan:${entry.id}:${link.id}`,
          sourceId: entry.id,
          relationship: link.relationship,
          createdAt: link.createdAt,
        })),
    )
    .filter((link) => !mirroredSourceIds.has(link.sourceId));

  return [...mirroredCurrentLinks, ...scannedIncomingLinks].sort((left, right) => {
    const leftName = resources[left.sourceId]?.name ?? '';
    const rightName = resources[right.sourceId]?.name ?? '';
    return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' });
  });
}

export function ResourceLinksTabNew({
  resource,
  pendingAutoLinkId,
  pendingAutoLinkRelationship,
}: ResourceLinksTabNewProps) {
  const resources = useResourceStore((state) => state.resources);
  const addResourceLink = useResourceStore((state) => state.addResourceLink);
  const updateResourceLink = useResourceStore((state) => state.updateResourceLink);
  const removeResourceLink = useResourceStore((state) => state.removeResourceLink);
  const currentResource = resources[resource.id] ?? resource;

  const [isAdding, setIsAdding] = useState(false);
  const [addStep, setAddStep] = useState<'search' | 'relationship'>('search');
  const [searchText, setSearchText] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [relationshipDraft, setRelationshipDraft] = useState('');
  const [expandedLinkId, setExpandedLinkId] = useState<string | null>(null);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editingRelationship, setEditingRelationship] = useState('');
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const confirmResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const relationshipSelectRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    if (!isAdding || addStep !== 'search') return;
    searchInputRef.current?.focus();
  }, [addStep, isAdding]);

  useEffect(() => {
    if (!isAdding || addStep !== 'relationship') return;
    relationshipSelectRef.current?.focus();
  }, [addStep, isAdding]);

  useEffect(() => () => {
    if (confirmResetRef.current) clearTimeout(confirmResetRef.current);
  }, []);

  const forwardLinks = useMemo(
    () =>
      sortByResourceName(
        (currentResource.links ?? [])
          .filter((link) => link.isMirrored === false)
          .map((link) => ({ ...link, targetId: link.targetResourceId })),
        resources,
      ) as Array<ResourceLink & { targetId: string }>,
    [currentResource.links, resources],
  );

  const reverseLinks = useMemo(
    () => buildReverseLinks(currentResource, resources),
    [currentResource, resources],
  );

  const normalizedSearch = searchText.trim().toLowerCase();

  const selectableResources = useMemo(
    () => {
      const directlyLinkedTargetIds = new Set((currentResource.links ?? []).map((link) => link.targetResourceId));

      return Object.values(resources)
        .filter((entry) => {
          if (entry.id === currentResource.id) return false;
          if (directlyLinkedTargetIds.has(entry.id)) return false;
          if (!normalizedSearch) return true;
          return entry.name.toLowerCase().includes(normalizedSearch);
        })
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
    },
    [currentResource.id, currentResource.links, normalizedSearch, resources],
  );

  const selectedTarget = selectedTargetId ? resources[selectedTargetId] : undefined;
  const selectedRelationshipOptions = selectedTarget
    ? getRelationshipOptions(currentResource.type, selectedTarget.type)
    : [];
  const expandedLink = expandedLinkId
    ? forwardLinks.find((link) => link.id === expandedLinkId) ?? null
    : null;
  const expandedTarget = expandedLink ? resources[expandedLink.targetResourceId] : undefined;
  const expandedRelationshipOptions = expandedTarget
    ? getRelationshipOptions(currentResource.type, expandedTarget.type)
    : [];
  const persistedPendingAutoLink = pendingAutoLinkId
    ? forwardLinks.find((link) => link.targetResourceId === pendingAutoLinkId && link.isPullLink === true)
    : undefined;
  const pendingAutoLinkTarget = pendingAutoLinkId ? resources[pendingAutoLinkId] : undefined;
  const showPendingAutoLinkPreview = Boolean(
    pendingAutoLinkId &&
    pendingAutoLinkRelationship &&
    pendingAutoLinkTarget &&
    !persistedPendingAutoLink,
  );

  function resetAddFlow() {
    setIsAdding(false);
    setAddStep('search');
    setSearchText('');
    setSelectedTargetId('');
    setRelationshipDraft('');
  }

  function openAddFlow() {
    setIsAdding(true);
    setExpandedLinkId(null);
    setEditingLinkId(null);
    setConfirmRemoveId(null);
    setAddStep('search');
    setSearchText('');
    setSelectedTargetId('');
    setRelationshipDraft('');
  }

  function handleSelectResource(targetId: string) {
    const target = resources[targetId];
    setSelectedTargetId(targetId);
    setRelationshipDraft(target ? getRelationshipOptions(currentResource.type, target.type)[0] ?? '' : '');
    setAddStep('relationship');
  }

  function handleSaveNewLink() {
    const trimmedRelationship = relationshipDraft.trim();
    if (!selectedTargetId || !trimmedRelationship) return;
    addResourceLink(currentResource.id, selectedTargetId, trimmedRelationship);
    resetAddFlow();
  }

  function startRemoveConfirmation(linkId: string) {
    if (confirmResetRef.current) {
      clearTimeout(confirmResetRef.current);
      confirmResetRef.current = null;
    }

    if (confirmRemoveId === linkId) {
      setConfirmRemoveId(null);
      removeResourceLink(currentResource.id, linkId);
      return;
    }

    setConfirmRemoveId(linkId);
    confirmResetRef.current = setTimeout(() => {
      setConfirmRemoveId(null);
      confirmResetRef.current = null;
    }, 3000);
  }

  function startEditing(link: ResourceLink) {
    const target = resources[link.targetResourceId];
    const options = target ? getRelationshipOptions(currentResource.type, target.type) : [];
    setEditingLinkId(link.id);
    setEditingRelationship(
      options.length > 0
        ? (options.includes(link.relationship) ? link.relationship : options[0])
        : link.relationship,
    );
    setConfirmRemoveId(null);
  }

  function cancelEditing() {
    setEditingLinkId(null);
    setEditingRelationship('');
  }

  function saveEdit(linkId: string) {
    const trimmedRelationship = editingRelationship.trim();
    if (!trimmedRelationship) return;
    updateResourceLink(currentResource.id, linkId, trimmedRelationship);
    cancelEditing();
  }

  function collapseExpandedLink() {
    setExpandedLinkId(null);
    cancelEditing();
    setConfirmRemoveId(null);
  }

  function renderLockedLinkRow(targetResource: Resource | undefined, relationship: string, key: string) {
    return (
      <div
        key={key}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-left dark:border-gray-700 dark:bg-gray-800/70"
      >
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <IconDisplay
              iconKey={targetResource?.icon ?? 'doc'}
              size={18}
              className="h-5 w-5 shrink-0 object-contain"
              alt=""
            />
            <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
              {targetResource?.name ?? 'Missing resource'}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {relationship}
            </span>
            <span className="text-xs text-gray-400" aria-label="Locked auto-link">
              {'🔒'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const hasAnyLinks = forwardLinks.length > 0 || reverseLinks.length > 0 || showPendingAutoLinkPreview;
  const showLinkLists = !isAdding && !expandedLink;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={isAdding ? resetAddFlow : openAddFlow}
          className="rounded-md bg-blue-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-600"
        >
          {isAdding ? 'Cancel' : '+ Add Link'}
        </button>
      </div>

      {isAdding ? (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/70">
          {addStep === 'search' ? (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Search resources</label>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Type a resource name..."
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
                />
              </div>

              <div className="max-h-72 space-y-2 overflow-y-auto">
                {selectableResources.length === 0 ? (
                  <div className="rounded-md bg-white px-3 py-3 text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                    No matching resources available.
                  </div>
                ) : (
                  selectableResources.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => handleSelectResource(entry.id)}
                      className="flex w-full items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/60 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-500/60 dark:hover:bg-gray-800"
                    >
                      <IconDisplay
                        iconKey={entry.icon ?? 'doc'}
                        size={18}
                        className="h-5 w-5 shrink-0 object-contain"
                        alt=""
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                          {entry.name}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        {TYPE_LABELS[entry.type]}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="rounded-md bg-white px-3 py-2 dark:bg-gray-900">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Selected resource</div>
                <div className="mt-1 flex items-center gap-2">
                  <IconDisplay
                    iconKey={selectedTarget?.icon ?? 'doc'}
                    size={18}
                    className="h-5 w-5 shrink-0 object-contain"
                    alt=""
                  />
                  <div className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                    {selectedTarget?.name ?? 'Missing resource'}
                  </div>
                  {selectedTarget ? (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      {TYPE_LABELS[selectedTarget.type]}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Relationship type
                </label>
                <select
                  ref={relationshipSelectRef}
                  value={relationshipDraft}
                  onChange={(event) => setRelationshipDraft(event.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
                >
                  <option value="">Select relationship</option>
                  {selectedRelationshipOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddStep('search')}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSaveNewLink}
                  disabled={!selectedTargetId || !relationshipDraft.trim()}
                  className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
                >
                  Confirm
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {!hasAnyLinks && !isAdding ? (
        <div className="rounded-lg bg-gray-50 px-3 py-4 text-center dark:bg-gray-800/60">
          <p className="text-xs italic text-gray-400">No links yet. Add a link using the button above.</p>
        </div>
      ) : null}

      {expandedLink && expandedTarget ? (
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-800/70">
          <div className="flex items-center gap-3">
            <IconDisplay
              iconKey={expandedTarget.icon ?? 'doc'}
              size={18}
              className="h-5 w-5 shrink-0 object-contain"
              alt=""
            />
            <div className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
              {expandedTarget.name}
            </div>
            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {expandedLink.relationship}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {editingLinkId === expandedLink.id ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Relationship</label>
                <select
                  value={editingRelationship}
                  onChange={(event) => setEditingRelationship(event.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                >
                  <option value="">Select relationship</option>
                  {expandedRelationshipOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelEditing}
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => saveEdit(expandedLink.id)}
                    disabled={!editingRelationship.trim()}
                    className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => startEditing(expandedLink)}
                  className="rounded-md border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-500/40 dark:text-blue-300 dark:hover:bg-blue-500/10"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => startRemoveConfirmation(expandedLink.id)}
                  className={
                    confirmRemoveId === expandedLink.id
                      ? 'text-xs font-semibold text-red-600'
                      : 'text-xs font-medium text-red-400 hover:text-red-500'
                  }
                >
                  {confirmRemoveId === expandedLink.id ? 'Tap again to remove' : 'Remove'}
                </button>
              </div>
            )}

            <div className="flex justify-start">
              <button
                type="button"
                onClick={collapseExpandedLink}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showLinkLists && (forwardLinks.length > 0 || showPendingAutoLinkPreview) ? (
        <div className="space-y-2">
          {showPendingAutoLinkPreview
            ? renderLockedLinkRow(
                pendingAutoLinkTarget,
                pendingAutoLinkRelationship ?? 'direct transaction',
                `pending-auto-link:${pendingAutoLinkId}`,
              )
            : null}
          {forwardLinks.map((link) => {
            const targetResource = resources[link.targetResourceId];

            if (showPendingAutoLinkPreview && link.targetResourceId === pendingAutoLinkId) {
              return null;
            }

            if (link.isPullLink === true) {
              return renderLockedLinkRow(targetResource, link.relationship, link.id);
            }

            return (
              <button
                key={link.id}
                type="button"
                onClick={() => {
                  setExpandedLinkId(link.id);
                  setEditingLinkId(null);
                  setConfirmRemoveId(null);
                }}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40 dark:border-gray-700 dark:bg-gray-800/70 dark:hover:border-blue-500/60 dark:hover:bg-gray-800"
              >
                <div className="flex items-center gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <IconDisplay
                      iconKey={targetResource?.icon ?? 'doc'}
                      size={18}
                      className="h-5 w-5 shrink-0 object-contain"
                      alt=""
                    />
                    <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                      {targetResource?.name ?? 'Missing resource'}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {link.relationship}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      {showLinkLists && reverseLinks.length > 0 ? (
        <div className="space-y-2">
          <div className="border-t border-gray-200 pt-3 dark:border-gray-700">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Linked by others
            </p>
          </div>

          {reverseLinks.map((link) => {
            const sourceResource = resources[link.sourceId];
            return (
              <div
                key={link.key}
                className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 px-3 py-2 opacity-80 dark:border-gray-700 dark:bg-gray-800/40"
              >
                <div className="flex items-center gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <IconDisplay
                      iconKey={sourceResource?.icon ?? 'doc'}
                      size={18}
                      className="h-5 w-5 shrink-0 object-contain"
                      alt=""
                    />
                    <div className="truncate text-sm font-medium text-gray-600 dark:text-gray-400">
                      {sourceResource?.name ?? 'Missing resource'}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    {link.relationship}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
