import type { ItemTemplate } from '../coach/ItemLibrary';
import { getItemTemplateByRef, itemLibrary } from '../coach/ItemLibrary';
import type { InventoryItemTemplate } from '../types/resource';
import type { User } from '../types/user';

export function getLibraryItem(id: string): InventoryItemTemplate | undefined {
  const item = itemLibrary.find((entry) => entry.id === id);
  if (!item) return undefined;

  return {
    id: item.id,
    name: item.name,
    icon: item.icon,
    kind: item.kind,
    dimensions: item.dimensions,
    category: item.category,
    description: item.description,
    isCustom: false,
  };
}

export function getUserInventoryItemTemplates(user: User | null | undefined): InventoryItemTemplate[] {
  return user?.lists.inventoryItemTemplates ?? [];
}

export function mergeInventoryItemTemplates(
  ...groups: Array<InventoryItemTemplate[] | null | undefined>
): InventoryItemTemplate[] {
  const byId = new Map<string, InventoryItemTemplate>();

  for (const group of groups) {
    for (const item of group ?? []) {
      if (!item?.id) continue;
      byId.set(item.id, item);
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveInventoryItemTemplate(
  itemTemplateRef: string,
  userTemplates: InventoryItemTemplate[] = [],
): (ItemTemplate & { source: 'library' | 'user' }) | null {
  const userTemplate = userTemplates.find((item) => item.id === itemTemplateRef);
  const liveTemplate = getLibraryItem(itemTemplateRef);
  const builtIn = getItemTemplateByRef(itemTemplateRef);

  if (userTemplate && liveTemplate && builtIn) {
    return {
      ...builtIn,
      name: liveTemplate.name,
      icon: liveTemplate.icon,
      description: liveTemplate.description ?? builtIn.description,
      kind: liveTemplate.kind ?? builtIn.kind,
      dimensions: liveTemplate.dimensions ?? userTemplate.dimensions ?? builtIn.dimensions,
      category: (liveTemplate.category as ItemTemplate['category'] | undefined) ?? builtIn.category,
      source: 'library',
    };
  }

  if (userTemplate) {
    return {
      id: userTemplate.id,
      name: userTemplate.name,
      icon: userTemplate.icon,
      description: userTemplate.description || 'Custom inventory item',
      kind: userTemplate.kind ?? 'consumable',
      dimensions: userTemplate.dimensions,
      resourceType: 'inventory',
      category: (userTemplate.category as ItemTemplate['category'] | undefined) ?? 'workspace',
      rarity: 'common',
      isCustom: userTemplate.isCustom ?? true,
      associatedTaskTemplateRef: null,
      builtInTasks: (userTemplate.customTaskTemplates ?? []).map((taskTemplate) => ({
        taskTemplateRef: taskTemplate.name,
      })),
      source: 'user',
    };
  }

  return builtIn ? { ...builtIn, source: 'library' } : null;
}
