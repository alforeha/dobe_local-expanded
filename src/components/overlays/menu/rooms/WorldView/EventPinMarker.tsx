import { useEffect } from 'react';
import L from 'leaflet';
import { resolveIcon } from '../../../../../constants/iconMap';
import type { Event } from '../../../../../types';

interface EventPinMarkerProps {
  map: L.Map;
  events: Event[];
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

function createEventPinIcon(iconKey: string | null | undefined, date: string): L.DivIcon {
  const resolved = resolveIcon(iconKey ?? 'event-nav-actions');
  const isImage = resolved.includes('/') || resolved.includes('.');

  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'center';
  wrapper.style.gap = '2px';

  const pin = document.createElement('div');
  pin.style.width = '40px';
  pin.style.height = '40px';
  pin.style.borderRadius = '50% 50% 50% 0';
  pin.style.transform = 'rotate(-45deg)';
  pin.style.background = '#2563eb';
  pin.style.border = '3px solid #ffffff';
  pin.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.4)';
  pin.style.display = 'flex';
  pin.style.alignItems = 'center';
  pin.style.justifyContent = 'center';

  const inner = document.createElement('div');
  inner.style.transform = 'rotate(45deg)';
  inner.style.display = 'flex';
  inner.style.alignItems = 'center';
  inner.style.justifyContent = 'center';
  inner.style.width = '22px';
  inner.style.height = '22px';

  if (isImage) {
    const img = document.createElement('img');
    img.src = resolved;
    img.alt = '';
    img.style.width = '18px';
    img.style.height = '18px';
    img.style.objectFit = 'contain';
    img.style.filter = 'brightness(0) invert(1)';
    inner.appendChild(img);
  } else {
    inner.style.fontSize = '16px';
    inner.style.lineHeight = '1';
    inner.textContent = resolved;
  }

  pin.appendChild(inner);
  wrapper.appendChild(pin);

  const dateLabel = document.createElement('div');
  dateLabel.style.background = '#ffffff';
  dateLabel.style.border = '1px solid #e2e8f0';
  dateLabel.style.borderRadius = '6px';
  dateLabel.style.padding = '1px 5px';
  dateLabel.style.fontSize = '9px';
  dateLabel.style.fontWeight = '600';
  dateLabel.style.color = '#2563eb';
  dateLabel.style.whiteSpace = 'nowrap';
  dateLabel.style.boxShadow = '0 1px 4px rgba(15,23,42,0.10)';
  dateLabel.textContent = date;
  wrapper.appendChild(dateLabel);

  return L.divIcon({
    className: '',
    html: wrapper,
    iconSize: [40, 56],
    iconAnchor: [20, 52],
    popupAnchor: [0, -54],
  });
}

export function EventPinMarker({ map, events, show, onGoToDay }: EventPinMarkerProps) {
  useEffect(() => {
    if (!show) return;

    const layer = L.layerGroup().addTo(map);
    const cleanupFns: Array<() => void> = [];

    for (const event of events) {
      const location = event.location;
      if (!location) continue;

      const icon = createEventPinIcon(event.icon, event.startDate);
      const marker = L.marker([location.latitude, location.longitude], { icon }).addTo(layer);
      const popupContent = document.createElement('div');
      const resolved = resolveIcon(event.icon ?? 'event-nav-actions');
      const isImg = resolved.includes('/') || resolved.includes('.');
      const iconHtml = isImg
        ? `<img src="${resolved}" alt="" style="width:16px;height:16px;object-fit:contain;" />`
        : `<span>${escapeHtml(resolved)}</span>`;

      popupContent.className = 'cdb-map-popup';
      popupContent.innerHTML = `
        <div class="cdb-map-popup-header">
          <div class="cdb-map-popup-icon">${iconHtml}</div>
          <p class="cdb-map-popup-title">${escapeHtml(event.name)}</p>
        </div>
        <div class="cdb-map-popup-detail">${escapeHtml(event.startDate)}</div>
      `;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cdb-map-popup-button';
      button.textContent = 'Go to day';
      const handleGoToDay = () => onGoToDay(event.startDate);
      button.addEventListener('click', handleGoToDay);
      cleanupFns.push(() => button.removeEventListener('click', handleGoToDay));
      const actions = document.createElement('div');
      actions.className = 'cdb-map-popup-actions';
      actions.appendChild(button);
      popupContent.appendChild(actions);
      marker.bindPopup(popupContent);
    }

    return () => {
      for (const cleanup of cleanupFns) cleanup();
      layer.remove();
    };
  }, [events, map, onGoToDay, show]);

  return null;
}
