import { useEffect } from 'react';
import L from 'leaflet';
import type { Event, QuickActionsEvent } from '../../../types';
import type { AlbumEntry, Resource } from '../../../types/resource';
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
  events: (Event | QuickActionsEvent)[];
  resources: Record<string, Resource>;
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

export function AlbumPinLayer({ map, show, onGoToDay, events, resources }: AlbumPinLayerProps) {
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

    for (const event of events) {
      const album = (event as Event).eventAlbum
        ?? (event as QuickActionsEvent).album
        ?? [];
      for (const entry of album) {
        if (!entry.location) continue;
        const titledEntry = entry as typeof entry & { title?: string };

        pins.push({
          latitude: entry.location.latitude,
          longitude: entry.location.longitude,
          photoUri: entry.photoUri,
          placeName: entry.location.placeName,
          label: titledEntry.title ?? (event as Event).name ?? 'Album entry',
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
  }, [events, map, resources, show, onGoToDay]);

  return null;
}
