import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useResourceStore } from '../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../stores/useUserStore';
import { useSystemStore } from '../../../../../stores/useSystemStore';
import type { InventoryResource, Resource, ResourceType } from '../../../../../types/resource';
import { ResourceRoomHeader } from './ResourceRoomHeader';
import { ResourceRoomSubHeader } from './ResourceRoomSubHeader';
import { ResourceRoomBody } from './ResourceRoomBody';
import { TypeSelectorSheet } from './TypeSelectorSheet';
import { ContactForm } from './contact/ContactForm';
import { HomeForm } from './home/HomeForm';
import { VehicleForm } from './vehicle/VehicleForm';
import { AccountForm } from './account/AccountForm';
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

export function ResourceRoom() {
  const menuResourceTarget = useSystemStore((s) => s.menuResourceTarget);
  const clearMenuResourceTarget = useSystemStore((s) => s.clearMenuResourceTarget);
  const [activeType, setActiveType] = useState<ResourceType>(menuResourceTarget?.resourceType ?? 'contact');
  const [addStep, setAddStep] = useState<AddStep>('closed');
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [inventoryEditMode, setInventoryEditMode] = useState<'all' | 'item' | 'container'>('all');
  const [editingInventoryContainerId, setEditingInventoryContainerId] = useState<string | null>(null);
  const [expandedResourceId, setExpandedResourceId] = useState<string | null>(menuResourceTarget?.resourceId ?? null);

  const resources = useResourceStore((s) => s.resources);
  const setResource = useResourceStore((s) => s.setResource);
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const filtered = Object.values(resources).filter((r) => r.type === activeType);

  useEffect(() => {
    autoCompleteSystemTask('task-sys-explore-resources');
  }, []);

  useEffect(() => {
    if (!menuResourceTarget) return;
    const timer = window.setTimeout(() => {
      setActiveType(menuResourceTarget.resourceType);
      setExpandedResourceId(menuResourceTarget.resourceId);
      setAddStep('closed');
      clearMenuResourceTarget();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [clearMenuResourceTarget, menuResourceTarget]);

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
    const onDone = () => {
      setEditingResource(null);
      setEditingInventoryContainerId(null);
    };
    return (
      <div className="flex flex-col h-full">
        {editingResource.type === 'home'      && <HomeForm      existing={editingResource} onSaved={onDone} onCancel={onDone} />}
        {editingResource.type === 'vehicle'   && <VehicleForm   existing={editingResource} onSaved={onDone} onCancel={onDone} />}
        {editingResource.type === 'account'   && <AccountForm   existing={editingResource} onSaved={onDone} onCancel={onDone} />}
        {editingResource.type === 'inventory' && <InventoryForm existing={editingResource} onSaved={onDone} onCancel={onDone} editorMode={inventoryEditMode} editingContainerId={editingInventoryContainerId} />}
        {editingResource.type === 'doc'       && <DocForm       existing={editingResource} onSaved={onDone} onCancel={onDone} />}
        {editingResource.type === 'contact'   && <ContactForm   existing={editingResource} onSaved={onDone} onCancel={onDone} />}
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
          onCancel={() => {
            setAddStep('closed');
          }}
        />
      </div>
    );
  }

  // ── Add flow: individual forms ─────────────────────────────────────────────
  const backToSelector = () => setAddStep('type-selector');
  const onAdded = () => setAddStep('closed');

  if (addStep === 'contact-form') {
    return <div className="flex flex-col h-full"><ContactForm   onSaved={onAdded} onCancel={backToSelector} /></div>;
  }
  if (addStep === 'home-form') {
    return <div className="flex flex-col h-full"><HomeForm      onSaved={onAdded} onCancel={backToSelector} /></div>;
  }
  if (addStep === 'vehicle-form') {
    return <div className="flex flex-col h-full"><VehicleForm   onSaved={onAdded} onCancel={backToSelector} /></div>;
  }
  if (addStep === 'account-form') {
    return <div className="flex flex-col h-full"><AccountForm   onSaved={onAdded} onCancel={backToSelector} /></div>;
  }
  if (addStep === 'inventory-form') {
    return <div className="flex flex-col h-full"><InventoryForm onSaved={onAdded} onCancel={backToSelector} /></div>;
  }
  if (addStep === 'doc-form') {
    return <div className="flex flex-col h-full"><DocForm       onSaved={onAdded} onCancel={backToSelector} /></div>;
  }

  // ── Normal room view ──────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <ResourceRoomHeader
        activeType={activeType}
        onTypeChange={(t) => {
          setActiveType(t);
          setAddStep('closed');
          setExpandedResourceId(null);
        }}
        onAdd={() => setAddStep('type-selector')}
      />
      <ResourceRoomSubHeader type={activeType} />
      <ResourceRoomBody
        resources={filtered}
        onEdit={(resource) => {
          setInventoryEditMode('all');
          setEditingInventoryContainerId(null);
          setEditingResource(resource);
        }}
        onEditInventoryContainers={(resource, containerId = null) => {
          setInventoryEditMode('container');
          setEditingInventoryContainerId(containerId);
          setEditingResource(resource);
        }}
        expandedResourceId={expandedResourceId}
      />
    </div>
  );
}

