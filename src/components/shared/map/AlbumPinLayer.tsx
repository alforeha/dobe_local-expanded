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
}

interface AlbumPinLayerProps {
  map: L.Map;
  show: boolean;
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

export function AlbumPinLayer({ map, show }: AlbumPinLayerProps) {
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
        });
      }
    }

    const layer = L.layerGroup().addTo(map);

    for (const pin of pins) {
      const icon = createPhotoPinIcon(pin.photoUri);
      const marker = L.marker([pin.latitude, pin.longitude], { icon }).addTo(layer);
      const popupContent = document.createElement('div');
      popupContent.className = 'cdb-event-pin-popup';
      popupContent.innerHTML = `
        <p class="cdb-event-pin-popup-title">${escapeHtml(pin.label)}</p>
        ${pin.placeName ? `<p class="cdb-event-pin-popup-time">${escapeHtml(pin.placeName)}</p>` : ''}
      `;
      marker.bindPopup(popupContent);
    }

    return () => {
      layer.remove();
    };
  }, [activeEvents, historyEvents, map, resources, show]);

  return null;
}
