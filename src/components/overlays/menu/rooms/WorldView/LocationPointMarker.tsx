import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { starterTaskTemplates } from '../../../../../coach/StarterQuestLibrary';
import { taskTemplateLibrary } from '../../../../../coach';
import { getTaskTypeIconKey, resolveIcon } from '../../../../../constants/iconMap';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { resolveTaskDisplayName } from '../../../../../utils/resolveTaskDisplayName';
import type { Event, LocationPointInputFields, Task, TaskTemplate } from '../../../../../types';
import type { WorldViewFilters } from './FilterPanel';

interface LocationPointMarkerProps {
  map: L.Map;
  events: Event[];
  filters: WorldViewFilters;
  onGoToDay: (dateIso: string) => void;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createLocationPinIcon(iconValue: string): L.DivIcon {
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'center';

  const pin = document.createElement('div');
  pin.style.width = '36px';
  pin.style.height = '36px';
  pin.style.borderRadius = '50% 50% 50% 0';
  pin.style.transform = 'rotate(-45deg)';
  pin.style.background = '#7c3aed';
  pin.style.border = '3px solid #ffffff';
  pin.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.4)';
  pin.style.display = 'flex';
  pin.style.alignItems = 'center';
  pin.style.justifyContent = 'center';

  const inner = document.createElement('div');
  inner.style.transform = 'rotate(45deg)';
  inner.style.display = 'flex';
  inner.style.alignItems = 'center';
  inner.style.justifyContent = 'center';
  inner.style.width = '20px';
  inner.style.height = '20px';

  const isImagePath = iconValue.includes('/') || iconValue.includes('.');
  if (isImagePath) {
    const img = document.createElement('img');
    img.src = iconValue;
    img.alt = '';
    img.style.width = '16px';
    img.style.height = '16px';
    img.style.objectFit = 'contain';
    img.style.filter = 'brightness(0) invert(1)';
    inner.appendChild(img);
  } else {
    inner.style.fontSize = '14px';
    inner.style.lineHeight = '1';
    inner.textContent = iconValue;
  }

  pin.appendChild(inner);
  wrapper.appendChild(pin);

  return L.divIcon({
    className: '',
    html: wrapper,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
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

export function LocationPointMarker({ map, events, filters, onGoToDay }: LocationPointMarkerProps) {
  const tasks = useScheduleStore((state) => state.tasks);
  const scheduleTemplates = useScheduleStore((state) => state.taskTemplates);
  const templates = useMemo(() => buildTemplateRecord(scheduleTemplates), [scheduleTemplates]);

  useEffect(() => {
    if (!filters.showLocationPoints) return;

    const layer = L.layerGroup().addTo(map);
    const cleanupFns: Array<() => void> = [];

    for (const event of events) {
      const tasksForEvent = Array.isArray(event.tasks) ? event.tasks : [];

      for (const taskId of tasksForEvent) {
        const task = tasks[taskId];
        if (!task || resolveTaskType(task, templates) !== 'LOCATION_POINT') continue;

        const resultFields = task.resultFields as Partial<LocationPointInputFields>;
        if (typeof resultFields.lat !== 'number' || typeof resultFields.lng !== 'number') continue;

        const template = task.templateRef
          ? templates[task.templateRef] ?? starterTaskTemplates.find((entry) => entry.id === task.templateRef) ?? null
          : null;
        const iconKey = template?.icon
          ?? resultFields.iconKey
          ?? task.icon
          ?? getTaskTypeIconKey('LOCATION_POINT');
        const iconValue = resolveIcon(iconKey);
        const icon = createLocationPinIcon(iconValue);
        const marker = L.marker([resultFields.lat, resultFields.lng], { icon }).addTo(layer);
        const popupContent = document.createElement('div');
        const resolvedPopupIcon = resolveIcon(iconKey);
        const isPopupImg = resolvedPopupIcon.includes('/') || resolvedPopupIcon.includes('.');
        const popupIconHtml = isPopupImg
          ? `<img src="${resolvedPopupIcon}" alt="" style="width:12px;height:12px;object-fit:contain;opacity:0.6;" />`
          : `<span>${escapeHtml(resolvedPopupIcon)}</span>`;

        popupContent.className = 'cdb-map-popup';
        popupContent.innerHTML = `
          <div class="cdb-map-popup-header">
            <div class="cdb-map-popup-icon">${popupIconHtml}</div>
            <p class="cdb-map-popup-title">${escapeHtml(resolveTaskDisplayName(task, templates, starterTaskTemplates))}</p>
          </div>
          <div class="cdb-map-popup-detail">${escapeHtml(event.name)}</div>
          <div class="cdb-map-popup-detail">${escapeHtml(event.startDate)}</div>
        `;
        const actions = document.createElement('div');
        actions.className = 'cdb-map-popup-actions';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cdb-map-popup-button';
        btn.textContent = 'Go to day';
        const handleClick = () => onGoToDay(event.startDate);
        btn.addEventListener('click', handleClick);
        cleanupFns.push(() => btn.removeEventListener('click', handleClick));
        actions.appendChild(btn);
        popupContent.appendChild(actions);
        marker.bindPopup(popupContent);
        
      }
    }

    return () => {
      for (const cleanup of cleanupFns) cleanup();
      layer.remove();
    };
  }, [events, filters.showLocationPoints, map, onGoToDay, tasks, templates]);

  return null;
}
