import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { starterTaskTemplates } from '../../../../../coach/StarterQuestLibrary';
import { taskTemplateLibrary } from '../../../../../coach';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { resolveTaskDisplayName } from '../../../../../utils/resolveTaskDisplayName';
import type { Event, LocationTrailInputFields, Task, TaskTemplate } from '../../../../../types';
import type { WorldViewFilters } from './FilterPanel';

interface LocationTrailLayerProps {
  map: L.Map;
  events: Event[];
  filters: WorldViewFilters;
}

function buildTemplateRecord(scheduleTemplates: Record<string, TaskTemplate>): Record<string, TaskTemplate> {
  const templates: Record<string, TaskTemplate> = {};

  for (const template of taskTemplateLibrary) {
    if (template.id) templates[template.id] = template;
  }
  for (const [id, template] of Object.entries(scheduleTemplates)) {
    templates[id] = template;
  }

  return templates;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function resolveTaskType(task: Task, templates: Record<string, TaskTemplate>): string | null {
  if (task.isUnique === true) return task.taskType ?? null;

  const template = task.templateRef ? templates[task.templateRef] : null;
  if (template) return template.taskType;

  return starterTaskTemplates.find((entry) => entry.id === task.templateRef)?.taskType ?? null;
}

function getTrailColor(): string {
  const worldView = document.querySelector('.cdb-world-view');
  const source = worldView ?? document.documentElement;
  return getComputedStyle(source).getPropertyValue('--map-trail-color').trim() || '#0ea5e9';
}

export function LocationTrailLayer({ map, events, filters }: LocationTrailLayerProps) {
  const tasks = useScheduleStore((state) => state.tasks);
  const scheduleTemplates = useScheduleStore((state) => state.taskTemplates);
  const templates = useMemo(() => buildTemplateRecord(scheduleTemplates), [scheduleTemplates]);

  useEffect(() => {
    if (!filters.showLocationTrails) return;

    const layer = L.layerGroup().addTo(map);
    const trailColor = getTrailColor();

    for (const event of events) {
      const tasksForEvent = Array.isArray(event.tasks) ? event.tasks : [];

      for (const taskId of tasksForEvent) {
        const task = tasks[taskId];
        if (!task || resolveTaskType(task, templates) !== 'LOCATION_TRAIL') continue;

        const resultFields = task.resultFields as Partial<LocationTrailInputFields>;
        const waypoints = resultFields.waypoints ?? [];
        if (waypoints.length === 0) continue;

        const path = waypoints
          .filter((waypoint) => typeof waypoint.lat === 'number' && typeof waypoint.lng === 'number')
          .map((waypoint): L.LatLngExpression => [waypoint.lat, waypoint.lng]);
        if (path.length === 0) continue;

        const first = waypoints[0];
        const last = waypoints[waypoints.length - 1];
        const polyline = L.polyline(path, {
          color: trailColor,
          opacity: 0.9,
          weight: 4,
        }).addTo(layer);

        polyline.bindPopup(`
          <div class="cdb-map-popup">
            <p class="cdb-map-popup-title">${escapeHtml(resolveTaskDisplayName(task, templates, starterTaskTemplates))}</p>
            <p class="cdb-map-popup-line">${escapeHtml(event.name)}</p>
            <p class="cdb-map-popup-line">${waypoints.length} waypoint${waypoints.length === 1 ? '' : 's'}</p>
            <p class="cdb-map-popup-line">${escapeHtml(first?.timestamp ?? 'Unknown start')} to ${escapeHtml(last?.timestamp ?? 'Unknown end')}</p>
          </div>
        `);
      }
    }

    return () => {
      layer.remove();
    };
  }, [events, filters.showLocationTrails, map, tasks, templates]);

  return null;
}
