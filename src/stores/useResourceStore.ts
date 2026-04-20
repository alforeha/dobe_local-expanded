// ─────────────────────────────────────────
// useResourceStore — RESOURCE STORE
// Holds: Resources (all 6 types), Useables, Attachments, Badges, Gear.
// DEVICE → cloud sync in MULTI-USER.
// ─────────────────────────────────────────

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type {
  AccountResource,
  ContactResource,
  DocResource,
  HomeResource,
  InventoryResource,
  Resource,
  VehicleResource,
} from '../types';
import { isAccount, isContact, isDoc, isHome, isInventory, isVehicle } from '../types';

// ── STATE ─────────────────────────────────────────────────────────────────────

interface ResourceState {
  /** Keyed by Resource.id */
  resources: Record<string, Resource>;
}

// ── ACTIONS ───────────────────────────────────────────────────────────────────

interface ResourceActions {
  setResource: (resource: Resource) => void;
  removeResource: (id: string) => string[];
  addResourceLink: (sourceId: string, targetId: string, relationship: string) => void;
  updateResourceLink: (sourceId: string, linkId: string, relationship: string) => void;
  removeResourceLink: (sourceId: string, linkId: string) => void;
  getContacts: () => ContactResource[];
  getContact: (id: string) => ContactResource | undefined;
  getHomes: () => HomeResource[];
  getHome: (id: string) => HomeResource | undefined;
  getVehicles: () => VehicleResource[];
  getVehicle: (id: string) => VehicleResource | undefined;
  getAccounts: () => AccountResource[];
  getAccount: (id: string) => AccountResource | undefined;
  getInventories: () => InventoryResource[];
  getInventory: (id: string) => InventoryResource | undefined;
  getDocs: () => DocResource[];
  getDoc: (id: string) => DocResource | undefined;
  reset: () => void;
}

// ── INITIAL STATE ─────────────────────────────────────────────────────────────

const initialState: ResourceState = {
  resources: {},
};

function getInverseContactRelationship(relationship: string): string {
  const normalized = relationship.trim().toLowerCase();
  switch (normalized) {
    case 'parent':
      return 'child';
    case 'child':
      return 'parent';
    case 'sibling':
    case 'spouse':
    case 'partner':
    case 'friend':
    case 'colleague':
    case 'acquaintance':
      return normalized;
    default:
      return relationship.trim();
  }
}

function collectCascadeIds(resources: Record<string, Resource>, rootId: string): string[] {
  const pending = [rootId];
  const deletions = new Set<string>();

  while (pending.length > 0) {
    const currentId = pending.pop();
    if (!currentId || deletions.has(currentId)) continue;
    deletions.add(currentId);

    for (const resource of Object.values(resources)) {
      if (deletions.has(resource.id)) continue;
      if (!isDoc(resource)) continue;
      if (resource.linkedResourceRef === currentId || resource.linkedResourceRefs?.includes(currentId)) {
        pending.push(resource.id);
      }
    }
  }

  return [...deletions];
}

function pruneDeletedReferences(resource: Resource, deletedIds: Set<string>): Resource {
  const nextLinks = resource.links?.filter((link) => !deletedIds.has(link.targetResourceId));

  switch (resource.type) {
    case 'contact':
      return {
        ...resource,
        links: nextLinks?.length ? nextLinks : undefined,
        linkedHomeId: resource.linkedHomeId && deletedIds.has(resource.linkedHomeId) ? undefined : resource.linkedHomeId,
        linkedAccountIds: resource.linkedAccountIds?.filter((id) => !deletedIds.has(id)),
      };
    case 'home':
      return {
        ...resource,
        links: nextLinks?.length ? nextLinks : undefined,
        members: resource.members?.filter((id) => !deletedIds.has(id)),
        linkedAccountIds: resource.linkedAccountIds?.filter((id) => !deletedIds.has(id)),
        linkedDocIds: resource.linkedDocIds?.filter((id) => !deletedIds.has(id)),
      };
    case 'vehicle':
      return {
        ...resource,
        links: nextLinks?.length ? nextLinks : undefined,
        linkedContactId: resource.linkedContactId && deletedIds.has(resource.linkedContactId) ? undefined : resource.linkedContactId,
        linkedAccountId: resource.linkedAccountId && deletedIds.has(resource.linkedAccountId) ? undefined : resource.linkedAccountId,
        linkedDocIds: resource.linkedDocIds?.filter((id) => !deletedIds.has(id)),
      };
    case 'account':
      return {
        ...resource,
        links: nextLinks?.length ? nextLinks : undefined,
        linkedHomeId: resource.linkedHomeId && deletedIds.has(resource.linkedHomeId) ? undefined : resource.linkedHomeId,
        linkedContactId: resource.linkedContactId && deletedIds.has(resource.linkedContactId) ? undefined : resource.linkedContactId,
        linkedAccountId: resource.linkedAccountId && deletedIds.has(resource.linkedAccountId) ? undefined : resource.linkedAccountId,
      };
    case 'inventory':
      return {
        ...resource,
        links: nextLinks?.length ? nextLinks : undefined,
        linkedHomeId: resource.linkedHomeId && deletedIds.has(resource.linkedHomeId) ? undefined : resource.linkedHomeId,
      };
    case 'doc':
      return {
        ...resource,
        links: nextLinks?.length ? nextLinks : undefined,
        linkedResourceRef: resource.linkedResourceRef && deletedIds.has(resource.linkedResourceRef) ? undefined : resource.linkedResourceRef,
        linkedResourceRefs: resource.linkedResourceRefs?.filter((id) => !deletedIds.has(id)),
      };
  }
}

// ── STORE ─────────────────────────────────────────────────────────────────────

export const useResourceStore = create<ResourceState & ResourceActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setResource: (resource) => {
        set((state) => ({ resources: { ...state.resources, [resource.id]: resource } }));
        void import('../engine/resourceEngine').then(({ seedResourceTemplateForResource }) => {
          seedResourceTemplateForResource(resource);
        });
        // TODO: MVP06 — storageSet(storageKey.resource(resource.id), resource)
      },

      removeResource: (id) => {
        const deletedIds = collectCascadeIds(get().resources, id);
        const deletedSet = new Set(deletedIds);

        set((state) => {
          const resources = Object.fromEntries(
            Object.entries(state.resources)
              .filter(([resourceId]) => !deletedSet.has(resourceId))
              .map(([resourceId, resource]) => [resourceId, pruneDeletedReferences(resource, deletedSet)]),
          );
          return { resources };
        });

        return deletedIds;
      },

      addResourceLink: (sourceId, targetId, relationship) => {
        const source = get().resources[sourceId];
        const target = get().resources[targetId];
        if (!source || !target) return;

        const now = new Date().toISOString();
        const trimmedRelationship = relationship.trim();
        const existingSourceLink = (source.links ?? []).find((link) => link.targetResourceId === targetId);
        const nextSourceLinks = existingSourceLink
          ? (source.links ?? []).map((link) =>
              link.id === existingSourceLink.id
                ? {
                    ...link,
                    relationship: trimmedRelationship,
                    sourceResourceId: sourceId,
                    isMirrored: false,
                  }
                : link,
            )
          : [
              ...(source.links ?? []),
              {
                id: uuidv4(),
                targetResourceId: targetId,
                relationship: trimmedRelationship,
                createdAt: now,
                sourceResourceId: sourceId,
                isMirrored: false,
              },
            ];

        get().setResource({
          ...source,
          updatedAt: now,
          links: nextSourceLinks,
        });

        if (source.type === 'contact' && target.type === 'contact') {
          const inverseRelationship = getInverseContactRelationship(trimmedRelationship);
          const existingReciprocal = (target.links ?? []).find((link) => link.targetResourceId === sourceId);
          get().setResource({
            ...target,
            updatedAt: now,
            links: existingReciprocal
              ? (target.links ?? []).map((link) =>
                  link.id === existingReciprocal.id ? { ...link, relationship: inverseRelationship } : link,
                )
              : [
                  ...(target.links ?? []),
                  {
                    id: uuidv4(),
                    targetResourceId: sourceId,
                    relationship: inverseRelationship,
                    createdAt: now,
                    sourceResourceId: sourceId,
                    isMirrored: true,
                  },
                ],
          });
        }
      },

      updateResourceLink: (sourceId, linkId, relationship) => {
        const source = get().resources[sourceId];
        if (!source?.links?.length) return;
        const existingLink = source.links.find((link) => link.id === linkId);
        if (!existingLink) return;
        const target = get().resources[existingLink.targetResourceId];
        const trimmedRelationship = relationship.trim();
        const now = new Date().toISOString();

        get().setResource({
          ...source,
          updatedAt: now,
          links: source.links.map((link) =>
            link.id === linkId
              ? {
                  ...link,
                  relationship: trimmedRelationship,
                  sourceResourceId: sourceId,
                  isMirrored: false,
                }
              : link,
          ),
        });

        if (source.type === 'contact' && target?.type === 'contact') {
          const inverseRelationship = getInverseContactRelationship(trimmedRelationship);
          const reciprocal = (target.links ?? []).find((link) => link.targetResourceId === sourceId);
          get().setResource({
            ...target,
            updatedAt: now,
            links: reciprocal
              ? (target.links ?? []).map((link) =>
                  link.id === reciprocal.id ? { ...link, relationship: inverseRelationship } : link,
                )
              : [
                  ...(target.links ?? []),
                  {
                    id: uuidv4(),
                    targetResourceId: sourceId,
                    relationship: inverseRelationship,
                    createdAt: now,
                    sourceResourceId: sourceId,
                    isMirrored: true,
                  },
                ],
          });
        }
      },

      removeResourceLink: (sourceId, linkId) => {
        const source = get().resources[sourceId];
        if (!source?.links?.length) return;
        const existingLink = source.links.find((link) => link.id === linkId);
        if (!existingLink) return;
        const target = get().resources[existingLink.targetResourceId];
        const now = new Date().toISOString();

        const nextLinks = source.links.filter((link) => link.id !== linkId);
        get().setResource({
          ...source,
          updatedAt: now,
          links: nextLinks.length > 0 ? nextLinks : undefined,
        });

        if (source.type === 'contact' && target?.type === 'contact' && target.links?.length) {
          const reciprocalLinks = target.links.filter((link) => link.targetResourceId !== sourceId);
          get().setResource({
            ...target,
            updatedAt: now,
            links: reciprocalLinks.length > 0 ? reciprocalLinks : undefined,
          });
        }
      },

      getContacts: () => Object.values(get().resources).filter(isContact),

      getContact: (id) => {
        const resource = get().resources[id];
        return resource && isContact(resource) ? resource : undefined;
      },

      getHomes: () => Object.values(get().resources).filter(isHome),

      getHome: (id) => {
        const resource = get().resources[id];
        return resource && isHome(resource) ? resource : undefined;
      },

      getVehicles: () => Object.values(get().resources).filter(isVehicle),

      getVehicle: (id) => {
        const resource = get().resources[id];
        return resource && isVehicle(resource) ? resource : undefined;
      },

      getAccounts: () => Object.values(get().resources).filter(isAccount),

      getAccount: (id) => {
        const resource = get().resources[id];
        return resource && isAccount(resource) ? resource : undefined;
      },

      getInventories: () => Object.values(get().resources).filter(isInventory),

      getInventory: (id) => {
        const resource = get().resources[id];
        return resource && isInventory(resource) ? resource : undefined;
      },

      getDocs: () => Object.values(get().resources).filter(isDoc),

      getDoc: (id) => {
        const resource = get().resources[id];
        return resource && isDoc(resource) ? resource : undefined;
      },

      reset: () => set(initialState),
    }),
    { name: 'cdb-resources' },
  ),
);
