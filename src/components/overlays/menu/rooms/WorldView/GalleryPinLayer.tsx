import { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';

export interface GalleryPhoto {
  uri: string;
  latitude: number;
  longitude: number;
  capturedAt?: string;
  date: string;
  timeRounded: string;
  isAlbumMatched: boolean;
}

interface GalleryPinLayerProps {
  map: L.Map;
  photos: GalleryPhoto[];
  show: boolean;
  onEventize: (photo: GalleryPhoto) => void;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createGalleryPinIcon(uri: string, isMatched: boolean): L.DivIcon {
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'center';

  const frame = document.createElement('div');
  frame.style.width = '48px';
  frame.style.height = '48px';
  frame.style.overflow = 'hidden';
  frame.style.borderRadius = '16px';
  frame.style.border = `3px solid ${isMatched ? '#10b981' : '#f59e0b'}`;
  frame.style.background = '#ffffff';
  frame.style.boxShadow = '0 10px 24px rgba(15, 23, 42, 0.28)';

  const img = document.createElement('img');
  img.src = uri;
  img.alt = '';
  img.style.width = '100%';
  img.style.height = '100%';
  img.style.objectFit = 'cover';
  frame.appendChild(img);

  const notch = document.createElement('div');
  notch.style.width = '0';
  notch.style.height = '0';
  notch.style.marginTop = '-1px';
  notch.style.borderLeft = '8px solid transparent';
  notch.style.borderRight = '8px solid transparent';
  notch.style.borderTop = `12px solid ${isMatched ? '#10b981' : '#f59e0b'}`;
  notch.style.filter = 'drop-shadow(0 8px 12px rgba(15, 23, 42, 0.24))';

  wrapper.appendChild(frame);
  wrapper.appendChild(notch);

  return L.divIcon({
    className: '',
    html: wrapper,
    iconSize: [54, 64],
    iconAnchor: [27, 60],
    popupAnchor: [0, 0],
  });
}

export function GalleryPinLayer({ map, photos, show, onEventize }: GalleryPinLayerProps) {
  useEffect(() => {
    if (!show || photos.length === 0) return;

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 60,
      showCoverageOnHover: false,
    });
    cluster.addTo(map);

    const cleanupFns: Array<() => void> = [];

    for (const photo of photos) {
      const icon = createGalleryPinIcon(photo.uri, photo.isAlbumMatched);
      const marker = L.marker([photo.latitude, photo.longitude], { icon }).addTo(cluster);

      const popupEl = document.createElement('div');
      popupEl.className = 'cdb-map-popup';

      if (photo.uri) {
        const imgWrapper = document.createElement('div');
        imgWrapper.style.width = '100%';
        imgWrapper.style.height = '120px';
        imgWrapper.style.borderRadius = '8px';
        imgWrapper.style.overflow = 'hidden';
        imgWrapper.style.marginBottom = '6px';

        const img = document.createElement('img');
        img.src = photo.uri;
        img.alt = '';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        imgWrapper.appendChild(img);
        popupEl.appendChild(imgWrapper);
      }

      const header = document.createElement('div');
      header.className = 'cdb-map-popup-header';
      header.innerHTML = `<p class="cdb-map-popup-title">${escapeHtml(photo.date)}</p>`;
      popupEl.appendChild(header);

      const timeDetail = document.createElement('div');
      timeDetail.className = 'cdb-map-popup-detail';
      timeDetail.textContent = photo.timeRounded;
      popupEl.appendChild(timeDetail);

      if (photo.isAlbumMatched) {
        const matchDetail = document.createElement('div');
        matchDetail.className = 'cdb-map-popup-detail';
        matchDetail.textContent = '\u2713 In album';
        popupEl.appendChild(matchDetail);
      }

      if (!photo.isAlbumMatched) {
        const actions = document.createElement('div');
        actions.className = 'cdb-map-popup-actions';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cdb-map-popup-button';
        btn.style.background = '#f59e0b';
        btn.textContent = 'Eventize';
        const handleClick = () => onEventize(photo);
        btn.addEventListener('click', handleClick);
        cleanupFns.push(() => btn.removeEventListener('click', handleClick));
        actions.appendChild(btn);
        popupEl.appendChild(actions);
      }

      marker.bindPopup(popupEl, {
        maxWidth: 200,
      });
    }

    return () => {
      for (const cleanup of cleanupFns) cleanup();
      cluster.remove();
    };
  }, [map, onEventize, photos, show]);

  return null;
}
