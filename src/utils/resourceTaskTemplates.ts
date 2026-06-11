// ─────────────────────────────────────────
// RESOURCE TASK TEMPLATES — virtual TaskTemplate resolution for
// `resource-task:` prefixed refs (Sprint 4, A3).
//
// Resource tasks are not stored in useScheduleStore.taskTemplates (they would
// be stripped on persist-merge). Instead, a TaskTemplate is derived on demand
// from the owning resource. This lifts the old `resource-task:` filter from
// favorites: refs land in User.lists.favouritesList alongside regular template
// refs and are resolved here at render/execution time.
// ─────────────────────────────────────────

import { taskTemplateLibrary } from '../coach';
import { CUSTOM_ITEM_TEMPLATE_PREFIX, getItemTaskTemplateMeta } from '../coach/ItemLibrary';
import type {
  AccountResource,
  ContactResource,
  HomeResource,
  InventoryResource,
  Resource,
  VehicleResource,
} from '../types/resource';
import type { InputFields, TaskTemplate, XpAward } from '../types/taskTemplate';
import type { InventoryItemTemplate } from '../types/resource';
import { normaliseResourceTaskTypeForSave } from './resourceTaskUtils';
import { buildTaskInputFields } from './taskUtils';

export const RESOURCE_TASK_PREFIX = 'resource-task:';

const EMPTY_XP: XpAward = {
  health: 0,
  strength: 0,
  agility: 0,
  defense: 0,
  charisma: 0,
  wisdom: 0,
};

export function isResourceTaskRef(ref: string): boolean {
  return ref.startsWith(RESOURCE_TASK_PREFIX);
}

interface BuildResourceTaskTemplateArgs {
  templateKey: string;
  name: string;
  description?: string;
  icon?: string;
  taskType?: string | null;
  inputFields?: Partial<InputFields> | null;
}

/**
 * Build a virtual TaskTemplate for a resource-backed task. Default award
 * mirrors the listsEngine favourite fallback (+5 wisdom) so executing a
 * favorited resource task grants the same XP as before the lift.
 */
export function buildResourceTaskTemplate(args: BuildResourceTaskTemplateArgs): TaskTemplate {
  const taskType = normaliseResourceTaskTypeForSave(args.taskType);
  return {
    id: args.templateKey,
    name: args.name,
    description: args.description ?? '',
    icon: args.icon ?? 'task',
    taskType,
    inputFields: buildTaskInputFields(taskType, args.name, args.inputFields) as InputFields,
    xpAward: { ...EMPTY_XP, wisdom: 5 },
    cooldown: null,
    media: null,
    items: [],
    secondaryTag: null,
  };
}

function humanizeTaskRef(taskTemplateRef: string): string {
  return taskTemplateRef
    .replace(/^item-tmpl-/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim();
}

/**
 * Resolve the display name of an ItemRecurringTask's taskTemplateRef —
 * custom item-template tasks store the name itself as the ref; coach refs
 * resolve through the libraries.
 */
export function resolveRecurringTaskName(
  taskTemplateRef: string,
  itemTemplateRef: string,
  itemTemplates: InventoryItemTemplate[],
): string {
  if (itemTemplateRef.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX)) {
    const itemTemplate = itemTemplates.find((entry) => entry.id === itemTemplateRef);
    const customTask = itemTemplate?.customTaskTemplates?.find(
      (entry) => entry.name.trim() === taskTemplateRef,
    );
    if (customTask) {
      return customTask.name;
    }
  }

  const coachTask = taskTemplateLibrary.find((entry) => entry.id === taskTemplateRef);
  if (coachTask) {
    return coachTask.name;
  }

  const itemTaskMeta = getItemTaskTemplateMeta(taskTemplateRef);
  if (itemTaskMeta) {
    return itemTaskMeta.name;
  }

  return humanizeTaskRef(taskTemplateRef);
}

/**
 * Resolve a `resource-task:` ref to a virtual TaskTemplate from resource data.
 * Returns undefined when the ref does not parse or the backing resource/task
 * no longer exists (callers should drop the entry, mirroring how favorites
 * already drop refs whose templates are missing).
 *
 * Supported ref shapes (matching resourceEngine key generation):
 *   resource-task:{rid}:birthday
 *   resource-task:{rid}:insurance | :service | :payment-due
 *   resource-task:{rid}:contact-task:{taskId}
 *   resource-task:{rid}:maintenance:{taskId} | :vehicle-task:{taskId}
 *   resource-task:{rid}:account-task:{taskId}
 *   resource-task:{rid}:chore:{choreId}
 *   resource-task:{rid}:home-placement:{placementId}:{taskId}
 *   resource-task:{rid}:inventory:{itemId}:{taskId}
 *   resource-task:{rid}:inventory-container:{containerId}:carry-task:{taskId}
 *   resource-task:{rid}:inventory-container:{containerId}:{taskId}
 */
export function resolveResourceTaskTemplate(
  ref: string,
  resources: Record<string, Resource>,
  itemTemplates: InventoryItemTemplate[] = [],
): TaskTemplate | undefined {
  if (!isResourceTaskRef(ref)) return undefined;

  const parts = ref.split(':');
  // parts[0] = 'resource-task', parts[1] = resourceId, parts[2] = kind
  if (parts.length < 3) return undefined;
  const resource = resources[parts[1]];
  if (!resource) return undefined;
  const kind = parts[2];

  switch (kind) {
    case 'birthday': {
      if (resource.type !== 'contact') return undefined;
      const contact = resource as ContactResource;
      return buildResourceTaskTemplate({
        templateKey: ref,
        name: `${contact.displayName || contact.name}'s Birthday`,
        icon: contact.icon,
      });
    }

    case 'insurance': {
      if (resource.type !== 'vehicle') return undefined;
      return buildResourceTaskTemplate({
        templateKey: ref,
        name: `${resource.name} Insurance`,
        icon: resource.icon,
      });
    }

    case 'service': {
      if (resource.type !== 'vehicle') return undefined;
      return buildResourceTaskTemplate({
        templateKey: ref,
        name: `${resource.name} Service Due`,
        icon: resource.icon,
      });
    }

    case 'payment-due': {
      if (resource.type !== 'account') return undefined;
      return buildResourceTaskTemplate({
        templateKey: ref,
        name: `${resource.name} Payment Due`,
        icon: resource.icon,
      });
    }

    case 'contact-task': {
      if (resource.type !== 'contact') return undefined;
      const contact = resource as ContactResource;
      const task = (contact.tasks ?? []).find((t) => t.id === parts[3]);
      if (!task) return undefined;
      return buildResourceTaskTemplate({
        templateKey: ref,
        name: `${contact.displayName || contact.name}: ${task.name}`,
        icon: task.icon || contact.icon,
        taskType: task.taskType,
      });
    }

    case 'maintenance':
    case 'vehicle-task': {
      if (resource.type !== 'vehicle') return undefined;
      const vehicle = resource as VehicleResource;
      const task = (vehicle.maintenanceTasks ?? []).find((t) => t.id === parts[3]);
      if (!task) return undefined;
      return buildResourceTaskTemplate({
        templateKey: ref,
        name: `${vehicle.name}: ${task.name}`,
        icon: task.icon || vehicle.icon,
        taskType: task.taskType,
        inputFields: task.inputFields,
      });
    }

    case 'account-task': {
      if (resource.type !== 'account') return undefined;
      const account = resource as AccountResource;
      const task = [...(account.accountTasks ?? []), ...(account.allowanceTasks ?? [])].find(
        (t) => t.id === parts[3],
      );
      if (!task) return undefined;
      return buildResourceTaskTemplate({
        templateKey: ref,
        name: `${account.name}: ${task.name}`,
        icon: task.icon || account.icon,
        taskType: task.taskType,
        inputFields: task.inputFields,
      });
    }

    case 'chore': {
      if (resource.type !== 'home') return undefined;
      const home = resource as HomeResource;
      const chore = (home.chores ?? []).find((c) => c.id === parts[3]);
      if (!chore) return undefined;
      return buildResourceTaskTemplate({
        templateKey: ref,
        name: `${home.name}: ${chore.name}`,
        icon: chore.icon || home.icon,
        taskType: chore.taskType,
        inputFields: chore.inputFields,
      });
    }

    case 'home-placement': {
      if (resource.type !== 'home') return undefined;
      const home = resource as HomeResource;
      const placementId = parts[3];
      const taskId = parts[4];
      for (const story of home.stories ?? []) {
        for (const room of story.rooms) {
          const placement = (room.placedItems ?? []).find((p) => p.id === placementId);
          if (!placement) continue;
          const task = (placement.recurringTasks ?? []).find((t) => t.id === taskId);
          if (!task) return undefined;
          const taskName = resolveRecurringTaskName(task.taskTemplateRef, placement.refId, itemTemplates);
          return buildResourceTaskTemplate({
            templateKey: ref,
            name: `${home.name} - ${room.name}: ${taskName}`,
            icon: task.icon || home.icon,
            taskType: task.taskType,
            inputFields: task.inputFields,
          });
        }
      }
      return undefined;
    }

    case 'inventory': {
      if (resource.type !== 'inventory') return undefined;
      const inventory = resource as InventoryResource;
      const itemId = parts[3];
      const taskId = parts[4];
      const allItems = [
        ...inventory.items,
        ...(inventory.containers ?? []).flatMap((container) => container.items),
      ];
      const item = allItems.find((i) => i.id === itemId);
      if (!item) return undefined;
      const task = (item.recurringTasks ?? []).find((t) => t.id === taskId);
      if (!task) return undefined;
      const taskName = resolveRecurringTaskName(task.taskTemplateRef, item.itemTemplateRef, itemTemplates);
      return buildResourceTaskTemplate({
        templateKey: ref,
        name: `${inventory.name}: ${taskName}`,
        icon: task.icon || inventory.icon,
        taskType: task.taskType,
        inputFields: task.inputFields,
      });
    }

    case 'inventory-container': {
      if (resource.type !== 'inventory') return undefined;
      const inventory = resource as InventoryResource;
      const container = (inventory.containers ?? []).find((c) => c.id === parts[3]);
      if (!container) return undefined;

      if (parts[4] === 'carry-task') {
        const carryTask = container.carryTask;
        if (!carryTask || carryTask.id !== parts[5]) return undefined;
        return buildResourceTaskTemplate({
          templateKey: ref,
          name: carryTask.name || `Carry ${container.name}`,
          icon: carryTask.icon || container.icon || inventory.icon,
          taskType: carryTask.taskType,
        });
      }

      const legacyTasks =
        (container as { recurringTasks?: Array<{ id: string; name?: string; icon?: string; taskType?: string; inputFields?: Partial<InputFields>; taskTemplateRef?: string }> })
          .recurringTasks ?? [];
      const task = legacyTasks.find((t) => t.id === parts[4]);
      if (!task) return undefined;
      const taskName =
        task.name
        ?? (task.taskTemplateRef
          ? resolveRecurringTaskName(task.taskTemplateRef, '', itemTemplates)
          : 'Task');
      return buildResourceTaskTemplate({
        templateKey: ref,
        name: `${inventory.name}: ${container.name} - ${taskName}`,
        icon: task.icon || container.icon || inventory.icon,
        taskType: task.taskType,
        inputFields: task.inputFields,
      });
    }

    default:
      return undefined;
  }
}
