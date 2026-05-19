import { useEffect } from 'react';
import L from 'leaflet';
import { useResourceStore } from '../../../stores/useResourceStore';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import type { AlbumEntry, Event, EventAlbumEntry, QAAlbumEntry, QuickActionsEvent, Resource } from '../../../types';
import { createPhotoPinIcon } from '../../../utils/mapPinUtils';

interface AlbumPin {
  latitude: number;
  longitude: number;
  photoUri?: string;
  placeName?: string;
  label: string;
  date?: string;
}

interface AlbumPinLayerProps {
  map: L.Map;
  show: boolean;
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

function getResourceAlbum(resource: Resource): AlbumEntry[] {
  return 'album' in resource && Array.isArray(resource.album) ? resource.album : [];
}

function isQuickActionsEvent(event: Event | QuickActionsEvent): event is QuickActionsEvent {
  return 'date' in event && !('name' in event);
}

function getEventAlbum(event: Event | QuickActionsEvent): Array<EventAlbumEntry | QAAlbumEntry> {
  if (isQuickActionsEvent(event)) {
    return Array.isArray(event.album) ? event.album : [];
  }
  return Array.isArray(event.eventAlbum) ? event.eventAlbum : [];
}

export function AlbumPinLayer({ map, show, onGoToDay }: AlbumPinLayerProps) {
  const resources = useResourceStore((state) => state.resources);
  const activeEvents = useScheduleStore((state) => state.activeEvents);
  const historyEvents = useScheduleStore((state) => state.historyEvents);

  useEffect(() => {
    if (!show) return;

    const pins: AlbumPin[] = [];

    for (const resource of Object.values(resources)) {
      for (const entry of getResourceAlbum(resource)) {
        if (!entry.location) continue;

        pins.push({
          latitude: entry.location.latitude,
          longitude: entry.location.longitude,
          photoUri: entry.photoUri,
          placeName: entry.location.placeName,
          label: resource.name || 'Album entry',
          date: entry.date,
        });
      }
    }

    for (const event of [...Object.values(activeEvents), ...Object.values(historyEvents)]) {
      for (const entry of getEventAlbum(event)) {
        if (!entry.location) continue;

        pins.push({
          latitude: entry.location.latitude,
          longitude: entry.location.longitude,
          photoUri: entry.photoUri,
          placeName: entry.location.placeName,
          label: isQuickActionsEvent(event) ? 'Album entry' : event.name || 'Album entry',
          date: entry.date,
        });
      }
    }

    const layer = L.layerGroup().addTo(map);
    const cleanupFns: Array<() => void> = [];

    for (const pin of pins) {
      const icon = createPhotoPinIcon(pin.photoUri);
      const marker = L.marker([pin.latitude, pin.longitude], { icon }).addTo(layer);
      const popupContent = document.createElement('div');
      popupContent.className = 'cdb-map-popup';
      popupContent.innerHTML = `
        <div class="cdb-map-popup-header">
          <p class="cdb-map-popup-title">${escapeHtml(pin.label)}</p>
        </div>
        ${pin.date ? `<div class="cdb-map-popup-detail">${escapeHtml(pin.date)}</div>` : ''}
        ${pin.placeName ? `<div class="cdb-map-popup-detail">${escapeHtml(pin.placeName)}</div>` : ''}
      `;
      if (pin.date) {
        const actions = document.createElement('div');
        actions.className = 'cdb-map-popup-actions';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cdb-map-popup-button';
        btn.textContent = 'Go to day';
        const handleClick = () => onGoToDay(pin.date!);
        btn.addEventListener('click', handleClick);
        cleanupFns.push(() => btn.removeEventListener('click', handleClick));
        actions.appendChild(btn);
        popupContent.appendChild(actions);
      }
      marker.bindPopup(popupContent);
    }

    return () => {
      for (const cleanup of cleanupFns) cleanup();
      layer.remove();
    };
  }, [activeEvents, historyEvents, map, onGoToDay, resources, show]);

  return null;
}
