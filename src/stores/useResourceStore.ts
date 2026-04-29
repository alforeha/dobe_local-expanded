// ─────────────────────────────────────────
// useResourceStore — RESOURCE STORE
// Holds: Resources (all 6 types), Useables, Attachments, Badges, Gear.
// DEVICE → cloud sync in MULTI-USER.
// ─────────────────────────────────────────

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { useUserStore } from './useUserStore';
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
import { getItemTemplateByRef } from '../coach/ItemLibrary';

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
        containers: resource.containers?.map((container) => ({
          ...container,
          links: container.links?.filter((link) => !link.targetResourceId || !deletedIds.has(link.targetResourceId)),
        })),
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

function getHomeRoomIds(home: HomeResource): Set<string> {
  const roomIds = new Set<string>();
  for (const story of home.stories ?? []) {
    for (const room of story.rooms) {
      roomIds.add(room.id);
    }
  }
  for (const room of home.rooms ?? []) {
    roomIds.add(room.id);
  }
  return roomIds;
}

function getRoomPlacementCenter(room: NonNullable<HomeResource['stories']>[number]['rooms'][number]) {
  let currentX = room.origin.x;
  let currentY = room.origin.y;
  let minX = currentX;
  let maxX = currentX;
  let minY = currentY;
  let maxY = currentY;

  for (const segment of room.segments) {
    switch (segment.direction) {
      case 'up':
        currentY -= segment.distance;
        break;
      case 'down':
        currentY += segment.distance;
        break;
      case 'left':
        currentX -= segment.distance;
        break;
      case 'right':
        currentX += segment.distance;
        break;
    }
    minX = Math.min(minX, currentX);
    maxX = Math.max(maxX, currentX);
    minY = Math.min(minY, currentY);
    maxY = Math.max(maxY, currentY);
  }

  return {
    x: Math.round((minX + maxX) / 2),
    y: Math.round((minY + maxY) / 2),
  };
}

function sanitizeResources(resources: Record<string, Resource>): Record<string, Resource> {
  let changed = false;
  const nextResources: Record<string, Resource> = {};
  const userInventoryTemplateIds = new Set(useUserStore.getState().user?.lists.inventoryItemTemplates?.map((item) => item.id) ?? []);
  const legacyInventoryItems = new Map<string, { itemTemplateRef: string; quantity?: number }>();
  const inventoryContainerIds = new Set<string>();

  for (const resource of Object.values(resources)) {
    if (!isInventory(resource)) continue;
    for (const item of resource.items) {
      legacyInventoryItems.set(item.id, {
        itemTemplateRef: item.itemTemplateRef,
        quantity: item.quantity,
      });
    }
    for (const container of resource.containers ?? []) inventoryContainerIds.add(container.id);
  }

  const isValidPlacedItemRef = (
    refId: string,
    roomDedicatedItemIds?: Set<string>,
  ) => userInventoryTemplateIds.has(refId)
    || roomDedicatedItemIds?.has(refId) === true
    || refId.startsWith('room-item-')
    || getItemTemplateByRef(refId) !== null;

  for (const [resourceId, resource] of Object.entries(resources)) {
    if (isInventory(resource)) {
      let resourceChanged = false;
      const nextContainers = resource.containers?.map((container) => {
        let containerChanged = false;
        const nextLinks = container.links?.map((link) => {
          if (link.relationship !== 'location') return link;
          if (!link.targetResourceId) return link;

          const target = resources[link.targetResourceId];
          if (!target) {
            containerChanged = true;
            return {
              ...link,
              targetResourceId: undefined,
              targetRoomId: undefined,
            };
          }

          if (link.targetKind === 'home-room') {
            if (!isHome(target)) {
              containerChanged = true;
              return {
                ...link,
                targetResourceId: undefined,
                targetRoomId: undefined,
              };
            }

            if (link.targetRoomId && !getHomeRoomIds(target).has(link.targetRoomId)) {
              containerChanged = true;
              return {
                ...link,
                targetRoomId: undefined,
              };
            }
          }

          if (link.targetKind === 'vehicle' && !isVehicle(target)) {
            containerChanged = true;
            return {
              ...link,
              targetResourceId: undefined,
              targetRoomId: undefined,
            };
          }

          return link;
        });

        if (!containerChanged) return container;
        resourceChanged = true;
        return {
          ...container,
          links: nextLinks,
        };
      });

      const nextItems = resource.items.length > 0 ? [] : resource.items;
      if (nextItems !== resource.items) {
        resourceChanged = true;
      }

      if (resourceChanged) {
        changed = true;
        nextResources[resourceId] = {
          ...resource,
          containers: nextContainers,
          items: nextItems,
        };
        continue;
      }

      nextResources[resourceId] = resource;
      continue;
    }

    if (isHome(resource)) {
      let resourceChanged = false;
      const nextStories = resource.stories?.map((story) => {
        let storyChanged = false;
        const nextStoryPlacedItems = story.placedItems.flatMap((placement) => {
          if (placement.kind === 'container') {
            return inventoryContainerIds.has(placement.refId) ? [placement] : [];
          }

          const migrated = legacyInventoryItems.get(placement.refId);
          const nextPlacement = migrated
            ? {
                ...placement,
                refId: migrated.itemTemplateRef,
                quantity: placement.quantity ?? migrated.quantity,
              }
            : placement;

          if (nextPlacement !== placement) {
            storyChanged = true;
          }

          return isValidPlacedItemRef(nextPlacement.refId) ? [nextPlacement] : [];
        });
        if (nextStoryPlacedItems.length !== story.placedItems.length) {
          storyChanged = true;
        }

        const nextRooms = story.rooms.map((room) => {
          const roomDedicatedItemIds = new Set((room.dedicatedItems ?? []).map((item) => item.id));
          const roomDedicatedContainerIds = new Set((room.dedicatedContainers ?? []).map((container) => container.id));
          const nextPlacedItems = room.placedItems.flatMap((placement) => {
            if (placement.kind === 'container') {
              return inventoryContainerIds.has(placement.refId) || roomDedicatedContainerIds.has(placement.refId) ? [placement] : [];
            }

            const migrated = legacyInventoryItems.get(placement.refId);
            const nextPlacement = migrated
              ? {
                  ...placement,
                  refId: migrated.itemTemplateRef,
                  quantity: placement.quantity ?? migrated.quantity,
                }
              : placement;

            if (nextPlacement !== placement) {
              storyChanged = true;
            }

            return isValidPlacedItemRef(nextPlacement.refId, roomDedicatedItemIds) ? [nextPlacement] : [];
          });
          const restoredPlacedItems = [...nextPlacedItems];
          const existingContainerPlacementIds = new Set(
            restoredPlacedItems
              .filter((placement) => placement.kind === 'container')
              .map((placement) => placement.refId),
          );
          const roomCenter = getRoomPlacementCenter(room);
          for (const container of room.dedicatedContainers ?? []) {
            if (existingContainerPlacementIds.has(container.id)) continue;
            storyChanged = true;
            restoredPlacedItems.push({
              id: `restored-room-container:${room.id}:${container.id}`,
              kind: 'container',
              refId: container.id,
              width: Math.max(1, container.dimensions?.width ?? 24),
              depth: Math.max(1, container.dimensions?.depth ?? 24),
              x: roomCenter.x,
              y: roomCenter.y,
              rotation: 0,
            });
          }

          if (restoredPlacedItems.length !== room.placedItems.length) {
            storyChanged = true;
            return {
              ...room,
              placedItems: restoredPlacedItems,
            };
          }
          if (restoredPlacedItems.some((placement, index) => placement !== room.placedItems[index])) {
            storyChanged = true;
            return {
              ...room,
              placedItems: restoredPlacedItems,
            };
          }
          return room;
        });

        if (!storyChanged) return story;
        resourceChanged = true;
        return {
          ...story,
          placedItems: nextStoryPlacedItems,
          rooms: nextRooms,
        };
      });

      if (resourceChanged) {
        changed = true;
        nextResources[resourceId] = {
          ...resource,
          stories: nextStories,
        };
        continue;
      }
    }

    nextResources[resourceId] = resource;
  }

  return changed ? nextResources : resources;
}

// ── STORE ─────────────────────────────────────────────────────────────────────

export const useResourceStore = create<ResourceState & ResourceActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setResource: (resource) => {
        set((state) => ({ resources: { ...state.resources, [resource.id]: resource } }));
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
    {
      name: 'cdb-resources',
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const sanitizedResources = sanitizeResources(state.resources);
        if (sanitizedResources !== state.resources) {
          state.resources = sanitizedResources;
        }
      },
    },
  ),
);
