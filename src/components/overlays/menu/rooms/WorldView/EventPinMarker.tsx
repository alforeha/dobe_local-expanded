import { useEffect } from 'react';
import L from 'leaflet';
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

function formatDateTime(event: Event): string {
  const date = event.endDate && event.endDate !== event.startDate
    ? `${event.startDate} to ${event.endDate}`
    : event.startDate;

  return `${date} ${event.startTime}-${event.endTime}`;
}

function createEventPinIcon() {
  return L.divIcon({
    className: 'cdb-event-pin-icon',
    html: `
      <svg viewBox="0 0 32 42" aria-hidden="true" focusable="false">
        <path class="cdb-event-pin-shadow" d="M16 41c5-7 13-16 13-26A13 13 0 1 0 3 15c0 10 8 19 13 26Z" />
        <circle class="cdb-event-pin-core" cx="16" cy="15" r="5" />
      </svg>
    `,
    iconSize: [32, 42],
    iconAnchor: [16, 40],
    popupAnchor: [0, -34],
  });
}

export function EventPinMarker({ map, events, show, onGoToDay }: EventPinMarkerProps) {
  useEffect(() => {
    if (!show) return;

    const layer = L.layerGroup().addTo(map);
    const icon = createEventPinIcon();
    const cleanupFns: Array<() => void> = [];

    for (const event of events) {
      const location = event.location;
      if (!location) continue;

      const marker = L.marker([location.latitude, location.longitude], { icon }).addTo(layer);
      const popupContent = document.createElement('div');
      popupContent.className = 'cdb-event-pin-popup';
      popupContent.innerHTML = `
        <p class="cdb-event-pin-popup-title">${escapeHtml(event.name)}</p>
        <p class="cdb-event-pin-popup-time">${escapeHtml(formatDateTime(event))}</p>
      `;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cdb-event-pin-popup-button';
      button.textContent = 'Go to day';
      const handleGoToDay = () => onGoToDay(event.startDate);
      button.addEventListener('click', handleGoToDay);
      cleanupFns.push(() => button.removeEventListener('click', handleGoToDay));

      popupContent.appendChild(button);
      marker.bindPopup(popupContent);
    }

    return () => {
      for (const cleanup of cleanupFns) cleanup();
      layer.remove();
    };
  }, [events, map, onGoToDay, show]);

  return null;
}
