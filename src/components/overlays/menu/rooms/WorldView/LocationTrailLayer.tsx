import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import { starterTaskTemplates } from '../../../../../coach/StarterQuestLibrary';
import { taskTemplateLibrary } from '../../../../../coach';
import { resolveIcon } from '../../../../../constants/iconMap';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { resolveTaskDisplayName } from '../../../../../utils/resolveTaskDisplayName';
import type { Event, LocationTrailInputFields, Task, TaskTemplate } from '../../../../../types';
import type { WorldViewFilters } from './FilterPanel';

interface LocationTrailLayerProps {
  map: L.Map;
  events: Event[];
  filters: WorldViewFilters;
  onGoToDay: (dateIso: string) => void;
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

function getTrailDistanceKm(waypoints: { lat: number; lng: number }[]): number {
  const R = 6371;
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    const dLat = ((curr.lat - prev.lat) * Math.PI) / 180;
    const dLng = ((curr.lng - prev.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((prev.lat * Math.PI) / 180) *
        Math.cos((curr.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total;
}

function formatTrailDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(2)} km`;
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

function createTrailFlagIcon(iconValue: string): L.DivIcon {
  const isImage = iconValue.includes('/') || iconValue.includes('.');

  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'flex-start';

  const flag = document.createElement('div');
  flag.style.display = 'flex';
  flag.style.alignItems = 'center';
  flag.style.gap = '2px';

  const pole = document.createElement('div');
  pole.style.width = '3px';
  pole.style.height = '32px';
  pole.style.background = '#7c3aed';
  pole.style.borderRadius = '2px';
  pole.style.flexShrink = '0';

  const banner = document.createElement('div');
  banner.style.background = '#7c3aed';
  banner.style.borderRadius = '0 6px 6px 0';
  banner.style.padding = '3px 6px';
  banner.style.display = 'flex';
  banner.style.alignItems = 'center';
  banner.style.justifyContent = 'center';
  banner.style.width = '28px';
  banner.style.height = '24px';
  banner.style.boxShadow = '0 2px 6px rgba(124,58,237,0.3)';

  if (isImage) {
    const img = document.createElement('img');
    img.src = iconValue;
    img.alt = '';
    img.style.width = '14px';
    img.style.height = '14px';
    img.style.objectFit = 'contain';
    img.style.filter = 'brightness(0) invert(1)';
    banner.appendChild(img);
  } else {
    banner.style.fontSize = '13px';
    banner.style.lineHeight = '1';
    banner.textContent = iconValue;
  }

  flag.appendChild(pole);
  flag.appendChild(banner);
  wrapper.appendChild(flag);

  return L.divIcon({
    className: '',
    html: wrapper,
    iconSize: [34, 32],
    iconAnchor: [2, 32],
    popupAnchor: [16, -32],
  });
}

export function LocationTrailLayer({ map, events, filters, onGoToDay }: LocationTrailLayerProps) {
  const tasks = useScheduleStore((state) => state.tasks);
  const scheduleTemplates = useScheduleStore((state) => state.taskTemplates);
  const templates = useMemo(() => buildTemplateRecord(scheduleTemplates), [scheduleTemplates]);

  useEffect(() => {
    if (!filters.showLocationTrails) return;

    const polylineLayer = L.layerGroup().addTo(map);
    const flagLayer = L.markerClusterGroup({
      maxClusterRadius: 60,
      showCoverageOnHover: false,
      iconCreateFunction: (c) => L.divIcon({
        html: `<div style="background:rgba(234,88,12,0.9);width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid rgba(234,88,12,0.3);box-shadow:0 2px 8px rgba(234,88,12,0.4)"><span style="color:#fff;font-weight:700;font-size:13px">${c.getChildCount()}</span></div>`,
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      }),
    }).addTo(map);
    const trailColor = getTrailColor();
    const cleanupFns: Array<() => void> = [];
    const allPolylines: L.Polyline[] = [];
    const allFlagMarkers: L.Marker[] = [];
    let activeTrailIndex = -1;

    const applyHighlight = (selectedIndex: number) => {
      activeTrailIndex = selectedIndex;
      allPolylines.forEach((pl, i) => {
        pl.setStyle({
          opacity: selectedIndex === -1 || i === selectedIndex ? 0.9 : 0.2,
          weight: i === selectedIndex ? 6 : 4,
        });
      });
      allFlagMarkers.forEach((fm, i) => {
        fm.setOpacity(selectedIndex === -1 || i === selectedIndex ? 1 : 0.3);
      });
    };

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
        const polyline = L.polyline(path, {
          color: trailColor,
          opacity: 0.9,
          weight: 4,
        }).addTo(polylineLayer);
        const trailIndex = allPolylines.length;
        allPolylines.push(polyline);

        const template = task.templateRef
          ? templates[task.templateRef] ?? starterTaskTemplates.find((entry) => entry.id === task.templateRef) ?? null
          : null;
        const iconKey = template?.icon ?? task.icon ?? 'task-type-location-point';
        const iconValue = resolveIcon(iconKey);
        const flagIcon = createTrailFlagIcon(iconValue);

        const flagMarker = L.marker([first.lat, first.lng], { icon: flagIcon }).addTo(flagLayer);
        allFlagMarkers.push(flagMarker);

        const taskName = resolveTaskDisplayName(task, templates, starterTaskTemplates);
        const popupEl = document.createElement('div');
        const resolvedPopupIcon = resolveIcon(iconKey);
        const isPopupImg = resolvedPopupIcon.includes('/') || resolvedPopupIcon.includes('.');
        const popupIconHtml = isPopupImg
          ? `<img src="${resolvedPopupIcon}" alt="" style="width:12px;height:12px;object-fit:contain;opacity:0.6;" />`
          : `<span>${escapeHtml(resolvedPopupIcon)}</span>`;
        const resolvedEventIcon = resolveIcon(event.icon ?? 'event-nav-actions');
        const isEventImg = resolvedEventIcon.includes('/') || resolvedEventIcon.includes('.');
        const eventIconHtml = isEventImg
          ? `<img src="${resolvedEventIcon}" alt="" style="width:12px;height:12px;object-fit:contain;opacity:0.6;" />`
          : `<span>${escapeHtml(resolvedEventIcon)}</span>`;

        popupEl.className = 'cdb-map-popup';
        popupEl.innerHTML = `
          <div class="cdb-map-popup-header">
            <div class="cdb-map-popup-icon">${popupIconHtml}</div>
            <p class="cdb-map-popup-title">${escapeHtml(taskName)}</p>
          </div>
          <div class="cdb-map-popup-detail">
            <div class="cdb-map-popup-icon">${eventIconHtml}</div>
            ${escapeHtml(event.name)}
          </div>
          <div class="cdb-map-popup-detail">${escapeHtml(event.startDate)}</div>
          <div class="cdb-map-popup-detail">${escapeHtml(formatTrailDistance(getTrailDistanceKm(waypoints)))}</div>
        `;
        flagMarker.bindPopup(popupEl);
        const actionsEl = document.createElement('div');
        actionsEl.className = 'cdb-map-popup-actions';
        const trailBtn = document.createElement('button');
        trailBtn.type = 'button';
        trailBtn.className = 'cdb-map-popup-button';
        trailBtn.textContent = 'Go to day';
        const handleGoToDay = () => onGoToDay(event.startDate);
        trailBtn.addEventListener('click', handleGoToDay);
        cleanupFns.push(() => trailBtn.removeEventListener('click', handleGoToDay));
        actionsEl.appendChild(trailBtn);
        popupEl.appendChild(actionsEl);

        const handleFlagClick = () => {
          if (activeTrailIndex === trailIndex) {
            applyHighlight(-1);
          } else {
            applyHighlight(trailIndex);
          }
        };
        flagMarker.on('click', handleFlagClick);
        cleanupFns.push(() => flagMarker.off('click', handleFlagClick));
        const handlePopupClose = () => {
          applyHighlight(-1);
        };
        flagMarker.on('popupclose', handlePopupClose);
        cleanupFns.push(() => flagMarker.off('popupclose', handlePopupClose));
      }
    }

    return () => {
      for (const cleanup of cleanupFns) cleanup();
      polylineLayer.remove();
      flagLayer.remove();
    };
  }, [events, filters.showLocationTrails, map, onGoToDay, tasks, templates]);

  return null;
}
