import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useResourceStore } from '../../../../stores/useResourceStore';
import { useScheduleStore } from '../../../../stores/useScheduleStore';
import { forwardGeocode } from '../../../../utils/geocode';
import { isContact, isHome, type Event, type EventLocation } from '../../../../types';

interface LocationSectionProps {
  event: Event;
  isEditMode: boolean;
  addRequestNonce: number;
}

interface ResourceLocationOption {
  id: string;
  label: string;
  address: string;
  placeName: string;
}

function formatCoordinateLabel(location: EventLocation): string {
  return `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
}

function StaticLocationMap({ location }: { location: EventLocation }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, {
      attributionControl: true,
      dragging: false,
      doubleClickZoom: false,
      keyboard: false,
      scrollWheelZoom: false,
      touchZoom: false,
      zoomControl: false,
    }).setView([location.latitude, location.longitude], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    markerRef.current = L.circleMarker([location.latitude, location.longitude], {
      color: '#7c3aed',
      fillColor: '#a855f7',
      fillOpacity: 0.9,
      radius: 7,
      weight: 2,
    }).addTo(map);

    mapRef.current = map;
    const resizeId = window.setTimeout(() => map.invalidateSize(), 50);

    return () => {
      window.clearTimeout(resizeId);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [location.latitude, location.longitude]);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;

    const latLng: L.LatLngExpression = [location.latitude, location.longitude];
    mapRef.current.setView(latLng, 13);
    markerRef.current.setLatLng(latLng);
  }, [location]);

  return <div ref={containerRef} className="h-40 w-full overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700" />;
}

export function LocationSection({ event, isEditMode, addRequestNonce }: LocationSectionProps) {
  const updateEvent = useScheduleStore((state) => state.updateEvent);
  const resources = useResourceStore((state) => state.resources);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const resourceOptions = useMemo<ResourceLocationOption[]>(() => {
    const homes = Object.values(resources)
      .filter(isHome)
      .filter((home) => Boolean(home.address?.trim()))
      .map((home) => ({
        id: `home:${home.id}`,
        label: `${home.name} (Home)`,
        address: home.address!.trim(),
        placeName: home.name,
      }));

    const contacts = Object.values(resources)
      .filter(isContact)
      .filter((contact) => Boolean(contact.address?.trim()))
      .map((contact) => ({
        id: `contact:${contact.id}`,
        label: `${contact.displayName || contact.name} (Contact)`,
        address: contact.address!.trim(),
        placeName: contact.displayName || contact.name,
      }));

    return [...homes, ...contacts].sort((left, right) => left.label.localeCompare(right.label));
  }, [resources]);

  useEffect(() => {
    if (!resourceOptions.some((option) => option.id === selectedResourceId)) {
      setSelectedResourceId(resourceOptions[0]?.id ?? '');
    }
  }, [resourceOptions, selectedResourceId]);

  useEffect(() => {
    if (!isEditMode || addRequestNonce === 0) return;
    addressInputRef.current?.focus();
  }, [addRequestNonce, isEditMode]);

  const saveLocation = async (address: string, fallbackPlaceName: string, displayName?: string) => {
    setIsSaving(true);
    setStatusMessage(null);

    try {
      const result = await forwardGeocode(address);
      if (!result) {
        setStatusMessage('Unable to resolve that address.');
        return;
      }

      updateEvent(event.id, {
        location: {
          latitude: result.lat,
          longitude: result.lng,
          placeName: displayName || result.displayName || fallbackPlaceName,
        },
      });
      setStatusMessage('Location saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResourceSelect = async () => {
    const selectedResource = resourceOptions.find((option) => option.id === selectedResourceId);
    if (!selectedResource) return;

    await saveLocation(selectedResource.address, selectedResource.placeName, selectedResource.placeName);
  };

  const handleManualSubmit = async (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    const trimmedAddress = manualAddress.trim();
    if (!trimmedAddress) {
      setStatusMessage('Enter an address first.');
      return;
    }

    await saveLocation(trimmedAddress, trimmedAddress);
  };

  const handleClearLocation = () => {
    updateEvent(event.id, { location: null });
    setStatusMessage('Location cleared.');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
        Location
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
        {event.location ? (
          <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/70">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                {event.location.placeName?.trim() || formatCoordinateLabel(event.location)}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {formatCoordinateLabel(event.location)}
              </p>
            </div>
            <StaticLocationMap location={event.location} />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No location set
          </div>
        )}

        {isEditMode && (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/70">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                From a resource
              </p>

              {resourceOptions.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No Home or Contact resources with addresses are available.</p>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    value={selectedResourceId}
                    onChange={(event) => setSelectedResourceId(event.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  >
                    {resourceOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={handleResourceSelect}
                    disabled={!selectedResourceId || isSaving}
                    className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                  >
                    Use resource
                  </button>
                </div>
              )}
            </div>

            <form
              onSubmit={handleManualSubmit}
              className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/70"
            >
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Manual address entry
              </label>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  ref={addressInputRef}
                  type="text"
                  value={manualAddress}
                  onChange={(event) => setManualAddress(event.target.value)}
                  placeholder="Enter an address"
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                >
                  Save location
                </button>
              </div>
            </form>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleClearLocation}
                className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                Clear location
              </button>

              {statusMessage && (
                <span className="text-xs text-gray-500 dark:text-gray-400">{statusMessage}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}