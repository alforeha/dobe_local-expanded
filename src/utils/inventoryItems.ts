import type { ItemTemplate } from '../coach/ItemLibrary';
import { getItemTemplateByRef } from '../coach/ItemLibrary';
import type { InventoryItemTemplate } from '../types/resource';
import type { User } from '../types/user';

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
  const builtIn = getItemTemplateByRef(itemTemplateRef);

  if (userTemplate && builtIn && !builtIn.isCustom) {
    return {
      ...builtIn,
      name: userTemplate.name || builtIn.name,
      icon: userTemplate.icon || builtIn.icon,
      kind: userTemplate.kind ?? builtIn.kind,
      source: 'library',
    };
  }

  if (userTemplate) {
    return {
      id: userTemplate.id,
      name: userTemplate.name,
      icon: userTemplate.icon,
      description: 'Custom inventory item',
      kind: userTemplate.kind ?? 'consumable',
      resourceType: 'inventory',
      category: 'workspace',
      rarity: 'common',
      isCustom: true,
      associatedTaskTemplateRef: null,
      builtInTasks: (userTemplate.customTaskTemplates ?? []).map((taskTemplate) => ({
        taskTemplateRef: taskTemplate.name,
      })),
      source: 'user',
    };
  }

  return builtIn ? { ...builtIn, source: 'library' } : null;
}
