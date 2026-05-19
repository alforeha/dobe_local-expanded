import { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
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
  kind: 'photo' | 'stale' | 'note';
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
          kind: entry.photoUri ? 'photo' : 'note',
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
          kind: entry.photoUri ? 'photo' : 'note',
        });
      }
    }

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 60,
      showCoverageOnHover: false,
    });
    cluster.addTo(map);
    const cleanupFns: Array<() => void> = [];

    for (const pin of pins) {
      const icon = createPhotoPinIcon(pin.photoUri, pin.kind);
      const marker = L.marker([pin.latitude, pin.longitude], { icon }).addTo(cluster);
      const popupContent = document.createElement('div');
      popupContent.className = 'cdb-map-popup';

      if (pin.kind === 'photo' || pin.kind === 'stale') {
        const imgWrapper = document.createElement('div');
        imgWrapper.style.width = '100%';
        imgWrapper.style.height = '120px';
        imgWrapper.style.borderRadius = '8px';
        imgWrapper.style.overflow = 'hidden';
        imgWrapper.style.marginBottom = '6px';
        imgWrapper.style.background = '#e2e8f0';
        imgWrapper.style.display = 'flex';
        imgWrapper.style.alignItems = 'center';
        imgWrapper.style.justifyContent = 'center';
        imgWrapper.style.position = 'relative';

        const img = document.createElement('img');
        img.src = pin.photoUri ?? '';
        img.alt = '';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.onerror = () => {
          img.style.display = 'none';
          const ghost = document.createElement('span');
          ghost.textContent = '\uD83D\uDDBC\uFE0F';
          ghost.style.fontSize = '32px';
          ghost.style.opacity = '0.4';
          imgWrapper.appendChild(ghost);
        };
        imgWrapper.appendChild(img);
        popupContent.appendChild(imgWrapper);
      }

      const header = document.createElement('div');
      header.className = 'cdb-map-popup-header';
      header.innerHTML = `<p class="cdb-map-popup-title">${escapeHtml(pin.label)}</p>`;
      popupContent.appendChild(header);

      if (pin.date) {
        const dateDetail = document.createElement('div');
        dateDetail.className = 'cdb-map-popup-detail';
        dateDetail.textContent = pin.date;
        popupContent.appendChild(dateDetail);
      }

      if (pin.placeName) {
        const placeDetail = document.createElement('div');
        placeDetail.className = 'cdb-map-popup-detail';
        placeDetail.textContent = pin.placeName;
        popupContent.appendChild(placeDetail);
      }

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
      marker.bindPopup(popupContent, {
        maxWidth: 200,
        offset: [0, 10],
      });
    }

    return () => {
      for (const cleanup of cleanupFns) cleanup();
      cluster.remove();
    };
  }, [events, map, resources, show, onGoToDay]);

  return null;
}
