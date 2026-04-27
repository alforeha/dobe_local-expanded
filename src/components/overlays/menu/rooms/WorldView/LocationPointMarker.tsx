import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { starterTaskTemplates } from '../../../../../coach/StarterQuestLibrary';
import { taskTemplateLibrary } from '../../../../../coach';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { resolveTaskDisplayName } from '../../../../../utils/resolveTaskDisplayName';
import type { Event, LocationPointInputFields, Task, TaskTemplate } from '../../../../../types';
import type { WorldViewFilters } from './FilterPanel';

interface LocationPointMarkerProps {
  map: L.Map;
  events: Event[];
  filters: WorldViewFilters;
}

function createLocationPointIcon() {
  return L.divIcon({
    className: 'cdb-location-point-icon',
    html: `
      <svg viewBox="0 0 28 28" aria-hidden="true" focusable="false">
        <circle class="cdb-location-point-ring" cx="14" cy="14" r="12" />
        <circle class="cdb-location-point-core" cx="14" cy="14" r="5" />
      </svg>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

function resolveTaskType(task: Task, templates: Record<string, TaskTemplate>): string | null {
  if (task.isUnique === true) return task.taskType ?? null;

  const template = task.templateRef ? templates[task.templateRef] : null;
  if (template) return template.taskType;

  return starterTaskTemplates.find((entry) => entry.id === task.templateRef)?.taskType ?? null;
}

export function LocationPointMarker({ map, events, filters }: LocationPointMarkerProps) {
  const tasks = useScheduleStore((state) => state.tasks);
  const scheduleTemplates = useScheduleStore((state) => state.taskTemplates);
  const templates = useMemo(() => buildTemplateRecord(scheduleTemplates), [scheduleTemplates]);

  useEffect(() => {
    if (!filters.showLocationPoints) return;

    const layer = L.layerGroup().addTo(map);
    const icon = createLocationPointIcon();

    for (const event of events) {
      const tasksForEvent = Array.isArray(event.tasks) ? event.tasks : [];

      for (const taskId of tasksForEvent) {
        const task = tasks[taskId];
        if (!task || resolveTaskType(task, templates) !== 'LOCATION_POINT') continue;

        const resultFields = task.resultFields as Partial<LocationPointInputFields>;
        if (typeof resultFields.lat !== 'number' || typeof resultFields.lng !== 'number') continue;

        const marker = L.marker([resultFields.lat, resultFields.lng], { icon }).addTo(layer);
        const popupContent = document.createElement('div');
        popupContent.className = 'cdb-map-popup';
        popupContent.innerHTML = `
          <p class="cdb-map-popup-title">${escapeHtml(resolveTaskDisplayName(task, templates, starterTaskTemplates))}</p>
          <p class="cdb-map-popup-line">${escapeHtml(event.name)}</p>
          ${
            resultFields.timestamp
              ? `<p class="cdb-map-popup-line">${escapeHtml(resultFields.timestamp)}</p>`
              : ''
          }
        `;
        marker.bindPopup(popupContent);
      }
    }

    return () => {
      layer.remove();
    };
  }, [events, filters.showLocationPoints, map, tasks, templates]);

  return null;
}
