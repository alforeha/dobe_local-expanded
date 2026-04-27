import { useMemo, useState } from 'react';
import { taskTemplateLibrary } from '../../../coach';
import { starterTaskTemplates } from '../../../coach/StarterQuestLibrary';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import type { Event, EventAttachment, Task } from '../../../types';
import type { EventLocation } from '../../../types/plannedEvent';
import type { InputFields, LocationPointInputFields, LocationTrailInputFields, TaskTemplate, TaskType, Waypoint } from '../../../types/taskTemplate';
import { resolveTaskDisplayName } from '../../../utils/resolveTaskDisplayName';
import { resolveTaskTemplate } from '../../../utils/resolveTaskTemplate';

interface GlobePoint {
  lat: number;
  lng: number;
}

interface BaseLayerDefinition {
  key: string;
  label: string;
  points: GlobePoint[];
}

interface EventLocationLayerDefinition extends BaseLayerDefinition {
  kind: 'event-location';
  location: EventLocation;
}

interface TrailLayerDefinition extends BaseLayerDefinition {
  kind: 'trail';
  task: Task;
  taskName: string;
  waypoints: Waypoint[];
}

interface PointLayerDefinition extends BaseLayerDefinition {
  kind: 'point';
  taskName: string;
  point: GlobePoint;
  timestamp?: string;
}

interface PhotoLayerDefinition extends BaseLayerDefinition {
  kind: 'photo';
  attachment: EventAttachment;
}

export type EventGlobeLayerDefinition =
  | EventLocationLayerDefinition
  | TrailLayerDefinition
  | PointLayerDefinition
  | PhotoLayerDefinition;

function buildTemplateRecord(scheduleTemplates: Record<string, TaskTemplate>): Record<string, TaskTemplate> {
  const templates: Record<string, TaskTemplate> = {};

  for (const template of taskTemplateLibrary) {
    if (template.id) templates[template.id] = template;
  }

  for (const template of starterTaskTemplates) {
    if (template.id) templates[template.id] = template;
  }

  for (const [id, template] of Object.entries(scheduleTemplates)) {
    templates[id] = template;
  }

  return templates;
}

function resolveEventTaskType(task: Task | undefined, templates: Record<string, TaskTemplate>): TaskType | null {
  if (!task) return null;
  if (task.isUnique === true) return (task.taskType as TaskType | null) ?? null;
  if (!task.templateRef) return null;

  return resolveTaskTemplate(task.templateRef, templates, starterTaskTemplates, taskTemplateLibrary)?.taskType ?? null;
}

function getAttachmentLabel(attachment: EventAttachment): string {
  if (attachment.label.trim()) return attachment.label.trim();

  const fromUri = attachment.uri.split('/').pop()?.split('?')[0]?.trim();
  return fromUri || 'Photo attachment';
}

export function useEventGlobeLayers(event: Event | undefined, previewResults: Record<string, Partial<InputFields>> = {}) {
  const [layerVisibilityOverrides, setLayerVisibilityOverrides] = useState<Record<string, boolean>>({});
  const tasks = useScheduleStore((state) => state.tasks);
  const scheduleTemplates = useScheduleStore((state) => state.taskTemplates);
  const templates = useMemo(() => buildTemplateRecord(scheduleTemplates), [scheduleTemplates]);

  const layerDefinitions = useMemo<EventGlobeLayerDefinition[]>(() => {
    if (!event) return [];

    const layers: EventGlobeLayerDefinition[] = [];

    if (event.location) {
      layers.push({
        key: 'event-location',
        kind: 'event-location',
        label: 'Event Location',
        location: event.location,
        points: [{ lat: event.location.latitude, lng: event.location.longitude }],
      });
    }

    const tasksForEvent = Array.isArray(event.tasks) ? event.tasks : [];

    for (const taskId of tasksForEvent) {
      const task = tasks[taskId];
      const taskType = resolveEventTaskType(task, templates);
      if (!task || !taskType) continue;

      const taskName = resolveTaskDisplayName(task, scheduleTemplates, starterTaskTemplates);
      const hasPreviewResults = Object.keys(previewResults[task.id] ?? {}).length > 0;
      const effectiveResultFields = ((task.completionState !== 'complete' && hasPreviewResults)
        ? previewResults[task.id]
        : task.resultFields ?? {}) as Partial<InputFields>;

      if (taskType === 'LOCATION_TRAIL') {
        const resultFields = effectiveResultFields as Partial<LocationTrailInputFields>;
        const waypoints = (resultFields.waypoints ?? []).filter(
          (waypoint): waypoint is Waypoint => typeof waypoint.lat === 'number' && typeof waypoint.lng === 'number',
        );

        if (waypoints.length > 0) {
          layers.push({
            key: task.id,
            kind: 'trail',
            label: taskName,
            task,
            taskName,
            waypoints,
            points: waypoints.map((waypoint) => ({ lat: waypoint.lat, lng: waypoint.lng })),
          });
        }
      }

      if (taskType === 'LOCATION_POINT') {
        const resultFields = effectiveResultFields as Partial<LocationPointInputFields>;
        if (typeof resultFields.lat === 'number' && typeof resultFields.lng === 'number') {
          layers.push({
            key: task.id,
            kind: 'point',
            label: taskName,
            taskName,
            point: { lat: resultFields.lat, lng: resultFields.lng },
            timestamp: resultFields.timestamp,
            points: [{ lat: resultFields.lat, lng: resultFields.lng }],
          });
        }
      }
    }

    for (const attachment of event.attachments) {
      if (attachment.type !== 'photo') continue;
      if (!attachment.location) continue;
      if (typeof attachment.location.latitude !== 'number' || typeof attachment.location.longitude !== 'number') continue;

      layers.push({
        key: attachment.id,
        kind: 'photo',
        label: getAttachmentLabel(attachment),
        attachment,
        points: [{ lat: attachment.location.latitude, lng: attachment.location.longitude }],
      });
    }

    return layers;
  }, [event, previewResults, scheduleTemplates, tasks, templates]);

  const layerVisibility = useMemo(() => {
    const next: Record<string, boolean> = {};
    for (const layer of layerDefinitions) {
      next[layer.key] = layerVisibilityOverrides[layer.key] ?? true;
    }
    return next;
  }, [layerDefinitions, layerVisibilityOverrides]);

  const toggleLayer = (layerKey: string) => {
    setLayerVisibilityOverrides((current) => ({
      ...current,
      [layerKey]: !(current[layerKey] ?? true),
    }));
  };

  return { layerDefinitions, layerVisibility, toggleLayer };
}
