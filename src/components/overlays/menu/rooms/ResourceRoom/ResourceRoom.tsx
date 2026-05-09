import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useResourceStore } from '../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../stores/useUserStore';
import { useSystemStore } from '../../../../../stores/useSystemStore';
import type { ContactResource, InventoryResource, Resource, ResourceType } from '../../../../../types/resource';
import { ResourceRoomHeader } from './ResourceRoomHeader';
import { ResourceRoomSubHeader } from './ResourceRoomSubHeader';
import { ResourceRoomBody } from './ResourceRoomBody';
import { TypeSelectorSheet } from './TypeSelectorSheet';
import { ContactFormNew } from './contact/ContactFormNew';
import { HomeForm } from './home/HomeForm';
import { VehicleForm } from './vehicle/VehicleForm';
import { AccountFormNew } from './account/AccountFormNew';
import { InventoryForm } from './inventory/InventoryForm';
import { DocForm } from './doc/DocForm';
import { autoCompleteSystemTask } from '../../../../../engine/resourceEngine';

type AddStep =
  | 'closed'
  | 'type-selector'
  | 'contact-form'
  | 'home-form'
  | 'vehicle-form'
  | 'account-form'
  | 'inventory-form'
  | 'doc-form';

const TYPE_TO_ADD_STEP: Record<ResourceType, AddStep> = {
  contact:   'contact-form',
  home:      'home-form',
  vehicle:   'vehicle-form',
  account:   'account-form',
  inventory: 'inventory-form',
  doc:       'doc-form',
};

interface ResourceRoomProps {
  onOverlayActiveChange?: (active: boolean) => void;
}

export function ResourceRoom({ onOverlayActiveChange }: ResourceRoomProps) {
  const menuResourceTarget = useSystemStore((s) => s.menuResourceTarget);
  const clearMenuResourceTarget = useSystemStore((s) => s.clearMenuResourceTarget);
  const [activeType, setActiveType] = useState<ResourceType>(menuResourceTarget?.resourceType ?? 'contact');
  const [contactSearch, setContactSearch] = useState('');
  const [contactGroupFilter, setContactGroupFilter] = useState('');
  const [addStep, setAddStep] = useState<AddStep>('closed');
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [inventoryEditMode, setInventoryEditMode] = useState<'all' | 'item' | 'container'>('all');
  const [editingInventoryContainerId, setEditingInventoryContainerId] = useState<string | null>(null);
  const [expandedResourceId, setExpandedResourceId] = useState<string | null>(menuResourceTarget?.resourceId ?? null);
  const [activeExpandedResourceId, setActiveExpandedResourceId] = useState<string | null>(menuResourceTarget?.resourceId ?? null);
  const contactFormAutoSaveRef = useRef<(() => void) | null>(null);

  const resources = useResourceStore((s) => s.resources);
  const setResource = useResourceStore((s) => s.setResource);
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const allResources = useMemo(() => Object.values(resources), [resources]);
  const contactResources = useMemo(
    () => allResources.filter((resource): resource is ContactResource => resource.type === 'contact'),
    [allResources],
  );
  const contactGroupOptions = useMemo(() => {
    const uniqueGroups = new Set<string>();
    for (const resource of contactResources) {
      for (const group of resource.groups) uniqueGroups.add(group);
      for (const group of resource.customGroups ?? []) uniqueGroups.add(group);
    }
    return [...uniqueGroups].sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: 'base' }),
    );
  }, [contactResources]);
  const filtered = useMemo(() => {
    const typedResources = allResources.filter((resource) => resource.type === activeType);
    if (activeType !== 'contact') return typedResources;

    const normalizedSearch = contactSearch.trim().toLowerCase();
    return typedResources.filter((resource): resource is ContactResource => resource.type === 'contact')
      .filter((resource) => {
        if (contactGroupFilter) {
          const matchesGroup =
            resource.groups.includes(contactGroupFilter as ContactResource['groups'][number]) ||
            (resource.customGroups ?? []).includes(contactGroupFilter);
          if (!matchesGroup) return false;
        }

        if (!normalizedSearch) return true;
        const haystack = [
          resource.displayName,
          resource.name,
          resource.phone ?? '',
          resource.email ?? '',
        ].join(' ').toLowerCase();
        return haystack.includes(normalizedSearch);
      });
  }, [activeType, allResources, contactGroupFilter, contactSearch]);
  const overlayActive = useMemo(
    () => editingResource !== null || addStep !== 'closed' || activeExpandedResourceId !== null,
    [activeExpandedResourceId, addStep, editingResource],
  );

  useEffect(() => {
    autoCompleteSystemTask('task-sys-explore-resources');
  }, []);

  useEffect(() => {
    onOverlayActiveChange?.(overlayActive);
    return () => {
      onOverlayActiveChange?.(false);
    };
  }, [onOverlayActiveChange, overlayActive]);

  const registerContactFormAutoSave = useCallback((callback: (() => void) | null) => {
    contactFormAutoSaveRef.current = callback;
  }, []);

  const triggerContactFormAutoSave = useCallback(() => {
    const callback = contactFormAutoSaveRef.current;
    contactFormAutoSaveRef.current = null;
    callback?.();
  }, []);

  useEffect(() => {
    if (!menuResourceTarget) return;
    const timer = window.setTimeout(() => {
      triggerContactFormAutoSave();
      setActiveType(menuResourceTarget.resourceType);
      setExpandedResourceId(menuResourceTarget.resourceId);
      setActiveExpandedResourceId(menuResourceTarget.resourceId);
      setAddStep('closed');
      clearMenuResourceTarget();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [clearMenuResourceTarget, menuResourceTarget, triggerContactFormAutoSave]);

  useEffect(() => {
    return () => {
      triggerContactFormAutoSave();
    };
  }, [triggerContactFormAutoSave]);

  const handleEditDone = useCallback(() => {
    contactFormAutoSaveRef.current = null;
    setEditingResource(null);
    setEditingInventoryContainerId(null);
  }, []);

  const handleAdded = useCallback(() => {
    contactFormAutoSaveRef.current = null;
    setAddStep('closed');
  }, []);

  const handleBackToSelector = useCallback(() => {
    triggerContactFormAutoSave();
    setAddStep('type-selector');
  }, [triggerContactFormAutoSave]);

  const handleCloseTypeSelector = useCallback(() => {
    triggerContactFormAutoSave();
    setAddStep('closed');
  }, [triggerContactFormAutoSave]);

  const handleTypeChange = useCallback((type: ResourceType) => {
    triggerContactFormAutoSave();
    setActiveType(type);
    setAddStep('closed');
    setExpandedResourceId(null);
    setActiveExpandedResourceId(null);
  }, [triggerContactFormAutoSave]);

  const handleExpandedChange = useCallback((resourceId: string | null) => {
    if (resourceId == null) {
      triggerContactFormAutoSave();
    }
    setActiveExpandedResourceId(resourceId);
  }, [triggerContactFormAutoSave]);

  useEffect(() => {
    if (activeType !== 'inventory' || !user || filtered.length > 0) return;

    const now = new Date().toISOString();
    const starterInventory: InventoryResource = {
      id: uuidv4(),
      type: 'inventory',
      name: 'Inventory',
      icon: 'inventory',
      description: '',
      attachments: [],
      log: [],
      createdAt: now,
      updatedAt: now,
      itemTemplates: undefined,
      containers: [],
      items: [],
      notes: [],
      links: undefined,
      sharedWith: null,
    };

    setResource(starterInventory);
    setUser({
      ...user,
      resources: {
        ...user.resources,
        inventory: user.resources.inventory.includes(starterInventory.id)
          ? user.resources.inventory
          : [...user.resources.inventory.filter((id) => resources[id]?.type === 'inventory'), starterInventory.id],
      },
    });
  }, [activeType, filtered.length, resources, setResource, setUser, user]);

  // ── Edit overlay ──────────────────────────────────────────────────────────
  if (editingResource) {
    return (
      <div className="flex flex-col h-full">
        {editingResource.type === 'home'      && <HomeForm existing={editingResource} onSaved={handleEditDone} onCancel={handleEditDone} />}
        {editingResource.type === 'vehicle'   && <VehicleForm existing={editingResource} onSaved={handleEditDone} onCancel={handleEditDone} />}
        {editingResource.type === 'account'   && <AccountFormNew existing={editingResource} onSaved={handleEditDone} onCancel={handleEditDone} />}
        {editingResource.type === 'inventory' && <InventoryForm existing={editingResource} onSaved={handleEditDone} onCancel={handleEditDone} editorMode={inventoryEditMode} editingContainerId={editingInventoryContainerId} />}
        {editingResource.type === 'doc'       && <DocForm existing={editingResource} onSaved={handleEditDone} onCancel={handleEditDone} />}
        {editingResource.type === 'contact'   && <ContactFormNew existing={editingResource} onSaved={handleEditDone} registerOnAutoSave={registerContactFormAutoSave} />}
      </div>
    );
  }

  // ── Add flow: type selector ───────────────────────────────────────────────
  if (addStep === 'type-selector') {
    return (
      <div className="flex flex-col h-full">
        <TypeSelectorSheet
          onSelect={(selection) => {
            setAddStep(TYPE_TO_ADD_STEP[selection]);
          }}
          onCancel={handleCloseTypeSelector}
        />
      </div>
    );
  }

  // ── Add flow: individual forms ─────────────────────────────────────────────
  if (addStep === 'contact-form') {
    return <div className="flex flex-col h-full"><ContactFormNew onSaved={handleAdded} registerOnAutoSave={registerContactFormAutoSave} /></div>;
  }
  if (addStep === 'home-form') {
    return <div className="flex flex-col h-full"><HomeForm      onSaved={handleAdded} onCancel={handleBackToSelector} /></div>;
  }
  if (addStep === 'vehicle-form') {
    return <div className="flex flex-col h-full"><VehicleForm   onSaved={handleAdded} onCancel={handleBackToSelector} /></div>;
  }
  if (addStep === 'account-form') {
    return <div className="flex flex-col h-full"><AccountFormNew   onSaved={handleAdded} onCancel={handleBackToSelector} /></div>;
  }
  if (addStep === 'inventory-form') {
    return <div className="flex flex-col h-full"><InventoryForm onSaved={handleAdded} onCancel={handleBackToSelector} /></div>;
  }
  if (addStep === 'doc-form') {
    return <div className="flex flex-col h-full"><DocForm       onSaved={handleAdded} onCancel={handleBackToSelector} /></div>;
  }

  // ── Normal room view ──────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <ResourceRoomHeader
        activeType={activeType}
        onTypeChange={handleTypeChange}
        onAdd={() => {
          triggerContactFormAutoSave();
          setAddStep('type-selector');
        }}
      />
      {!activeExpandedResourceId ? (
        <ResourceRoomSubHeader
          type={activeType}
          searchValue={contactSearch}
          onSearchChange={setContactSearch}
          selectedGroup={contactGroupFilter}
          onGroupChange={setContactGroupFilter}
          groupOptions={contactGroupOptions}
        />
      ) : null}
      <ResourceRoomBody
        resources={filtered}
        onEdit={(resource) => {
          triggerContactFormAutoSave();
          setInventoryEditMode('all');
          setEditingInventoryContainerId(null);
          setEditingResource(resource);
        }}
        expandedResourceId={expandedResourceId}
        onExpandedChange={handleExpandedChange}
      />
    </div>
  );
}
