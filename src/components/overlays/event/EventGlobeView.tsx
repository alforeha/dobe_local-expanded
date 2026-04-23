import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { taskTemplateLibrary } from '../../../coach';
import { starterTaskTemplates } from '../../../coach/StarterQuestLibrary';
import { useAutoLocationPreferences } from '../../../hooks/useAutoLocationPreferences';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import type { Event, EventAttachment, Task } from '../../../types';
import type { EventLocation } from '../../../types/plannedEvent';
import type { InputFields, LocationPointInputFields, LocationTrailInputFields, TaskTemplate, TaskType, Waypoint } from '../../../types/taskTemplate';
import { resolveTaskDisplayName } from '../../../utils/resolveTaskDisplayName';
import { resolveTaskTemplate } from '../../../utils/resolveTaskTemplate';
import './EventGlobeView.css';

interface EventGlobeViewProps {
  event: Event;
  onClose: () => void;
  previewResults?: Record<string, Partial<InputFields>>;
}

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

type GlobeLayerDefinition =
  | EventLocationLayerDefinition
  | TrailLayerDefinition
  | PointLayerDefinition
  | PhotoLayerDefinition;

const WORLD_CENTER: L.LatLngExpression = [20, 0];
const WORLD_ZOOM = 2;
const LOCAL_ZOOM = 13;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatCoordinates(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

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

function getTrailColor(source: HTMLElement | null): string {
  const target = source ?? document.documentElement;
  return getComputedStyle(target).getPropertyValue('--map-trail-color').trim() || '#0ea5e9';
}

function isImageAttachment(attachment: EventAttachment): boolean {
  return attachment.mimeType.startsWith('image/');
}

function getAttachmentLabel(attachment: EventAttachment): string {
  if (attachment.label.trim()) return attachment.label.trim();

  const fromUri = attachment.uri.split('/').pop()?.split('?')[0]?.trim();
  return fromUri || 'Photo attachment';
}

function createEventLocationIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: '<div class="cdb-event-globe-view__event-pin">✦</div>',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -12],
  });
}

function createPhotoIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: '<div class="cdb-event-globe-view__photo-pin">📷</div>',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -12],
  });
}

function buildLayerPopup(layer: GlobeLayerDefinition): string {
  if (layer.kind === 'event-location') {
    return `
      <div class="cdb-event-globe-view__popup">
        <p class="cdb-event-globe-view__popup-title">${escapeHtml(layer.location.placeName || 'Event location')}</p>
        <p class="cdb-event-globe-view__popup-line">${escapeHtml(formatCoordinates(layer.location.latitude, layer.location.longitude))}</p>
      </div>
    `;
  }

  if (layer.kind === 'trail') {
    return `
      <div class="cdb-event-globe-view__popup">
        <p class="cdb-event-globe-view__popup-title">${escapeHtml(layer.taskName)}</p>
        <p class="cdb-event-globe-view__popup-line">${layer.waypoints.length} waypoint${layer.waypoints.length === 1 ? '' : 's'}</p>
      </div>
    `;
  }

  if (layer.kind === 'point') {
    return `
      <div class="cdb-event-globe-view__popup">
        <p class="cdb-event-globe-view__popup-title">${escapeHtml(layer.taskName)}</p>
        ${layer.timestamp ? `<p class="cdb-event-globe-view__popup-line">${escapeHtml(new Date(layer.timestamp).toLocaleString())}</p>` : ''}
      </div>
    `;
  }

  const title = getAttachmentLabel(layer.attachment);
  const imageMarkup = layer.attachment.uri && isImageAttachment(layer.attachment)
    ? `<img class="cdb-event-globe-view__popup-thumb" src="${escapeHtml(layer.attachment.uri)}" alt="${escapeHtml(title)}" />`
    : '';

  return `
    <div class="cdb-event-globe-view__popup">
      <p class="cdb-event-globe-view__popup-title">${escapeHtml(title)}</p>
      <p class="cdb-event-globe-view__popup-line">${escapeHtml(formatCoordinates(layer.points[0].lat, layer.points[0].lng))}</p>
      ${imageMarkup}
    </div>
  `;
}

export function EventGlobeView({ event, onClose, previewResults = {} }: EventGlobeViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});
  const activeLocation = useAutoLocationPreferences();
  const tasks = useScheduleStore((state) => state.tasks);
  const scheduleTemplates = useScheduleStore((state) => state.taskTemplates);
  const templates = useMemo(() => buildTemplateRecord(scheduleTemplates), [scheduleTemplates]);

  const layerDefinitions = useMemo<GlobeLayerDefinition[]>(() => {
    const layers: GlobeLayerDefinition[] = [];

    if (event.location) {
      layers.push({
        key: 'event-location',
        kind: 'event-location',
        label: 'Event Location',
        location: event.location,
        points: [{ lat: event.location.latitude, lng: event.location.longitude }],
      });
    }

    for (const taskId of event.tasks) {
      const task = tasks[taskId];
      const taskType = resolveEventTaskType(task, templates);
      if (!task || !taskType) continue;

      const taskName = resolveTaskDisplayName(task, scheduleTemplates, starterTaskTemplates);
      const effectiveResultFields = (Object.keys(previewResults[task.id] ?? {}).length > 0
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

  useEffect(() => {
    setLayerVisibility((current) => {
      const next: Record<string, boolean> = {};
      let changed = false;

      for (const layer of layerDefinitions) {
        next[layer.key] = current[layer.key] ?? true;
        if (next[layer.key] !== current[layer.key]) {
          changed = true;
        }
      }

      if (Object.keys(current).length !== layerDefinitions.length) {
        changed = true;
      }

      return changed ? next : current;
    });
  }, [layerDefinitions]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const hasUserLocation = typeof activeLocation?.lat === 'number' && typeof activeLocation?.lng === 'number';
    const initialCenter: L.LatLngExpression = hasUserLocation ? [activeLocation.lat, activeLocation.lng] : WORLD_CENTER;
    const initialZoom = hasUserLocation ? LOCAL_ZOOM : WORLD_ZOOM;

    const leafletMap = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView(initialCenter, initialZoom);

    L.control.zoom({ position: 'bottomright' }).addTo(leafletMap);
    L.control.attribution({ prefix: false, position: 'bottomleft' }).addTo(leafletMap);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      className: 'cdb-map-tiles',
      maxZoom: 19,
    }).addTo(leafletMap);

    mapRef.current = leafletMap;
    layerGroupRef.current = L.layerGroup().addTo(leafletMap);

    const resizeId = window.setTimeout(() => leafletMap.invalidateSize(), 50);

    return () => {
      window.clearTimeout(resizeId);
      leafletMap.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, [activeLocation]);

  useEffect(() => {
    if (!mapRef.current || !layerGroupRef.current) return;

    const layerGroup = layerGroupRef.current;
    layerGroup.clearLayers();
    const trailColor = getTrailColor(rootRef.current);

    for (const layer of layerDefinitions) {
      if (!layerVisibility[layer.key]) continue;

      if (layer.kind === 'event-location') {
        L.marker([layer.location.latitude, layer.location.longitude], {
          icon: createEventLocationIcon(),
        })
          .bindPopup(buildLayerPopup(layer))
          .addTo(layerGroup);
        continue;
      }

      if (layer.kind === 'trail') {
        const polyline = L.polyline(
          layer.waypoints.map((waypoint): L.LatLngExpression => [waypoint.lat, waypoint.lng]),
          { color: trailColor, opacity: 0.92, weight: 4 },
        ).addTo(layerGroup);

        polyline.bindPopup(buildLayerPopup(layer));
        continue;
      }

      if (layer.kind === 'point') {
        L.circleMarker([layer.point.lat, layer.point.lng], {
          radius: 7,
          color: '#0f172a',
          fillColor: '#38bdf8',
          fillOpacity: 0.95,
          weight: 2,
        })
          .bindPopup(buildLayerPopup(layer))
          .addTo(layerGroup);
        continue;
      }

      L.marker([layer.points[0].lat, layer.points[0].lng], {
        icon: createPhotoIcon(),
      })
        .bindPopup(buildLayerPopup(layer))
        .addTo(layerGroup);
    }
  }, [layerDefinitions, layerVisibility]);

  useEffect(() => {
    if (!mapRef.current) return;

    const visiblePoints = layerDefinitions
      .filter((layer) => layerVisibility[layer.key])
      .flatMap((layer) => layer.points)
      .filter((point) => typeof point.lat === 'number' && typeof point.lng === 'number');

    if (visiblePoints.length === 0) {
      if (typeof activeLocation?.lat === 'number' && typeof activeLocation?.lng === 'number') {
        mapRef.current.setView([activeLocation.lat, activeLocation.lng], LOCAL_ZOOM);
      } else {
        mapRef.current.setView(WORLD_CENTER, WORLD_ZOOM);
      }
      return;
    }

    if (visiblePoints.length === 1) {
      mapRef.current.setView([visiblePoints[0].lat, visiblePoints[0].lng], 14);
      return;
    }

    const bounds = L.latLngBounds(visiblePoints.map((point) => [point.lat, point.lng] as [number, number]));
    mapRef.current.fitBounds(bounds, { padding: [24, 24] });
  }, [activeLocation, layerDefinitions, layerVisibility]);

  return (
    <div ref={rootRef} className="cdb-event-globe-view">
      <div className="cdb-event-globe-view__map-area">
        <div ref={containerRef} className="cdb-event-globe-view__map" aria-label="Event globe view map" />
        <button type="button" onClick={onClose} className="cdb-event-globe-view__map-close">
          Close
        </button>
      </div>

      <div className="cdb-event-globe-view__layers">
        <p className="cdb-event-globe-view__layers-title">Layers</p>

        {layerDefinitions.length === 0 ? (
          <div className="cdb-event-globe-view__empty">No mapped event data</div>
        ) : (
          <div className="cdb-event-globe-view__layers-list">
            {layerDefinitions.map((layer) => {
              const isOn = layerVisibility[layer.key] ?? true;

              return (
                <div key={layer.key} className="cdb-event-globe-view__toggle-row">
                  <span className="cdb-event-globe-view__toggle-label">{layer.label}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isOn}
                    aria-label={`Toggle ${layer.label}`}
                    onClick={() => setLayerVisibility((current) => ({ ...current, [layer.key]: !isOn }))}
                    className={`cdb-event-globe-view__toggle-switch${isOn ? ' is-on' : ''}`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}