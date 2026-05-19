import { useEffect, useMemo, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import type { Event, QuickActionsEvent } from '../../../../../types';
import { WorldMapContainer } from './WorldMapContainer';
import { EventPinMarker } from './EventPinMarker';
import { LocationPointMarker } from './LocationPointMarker';
import { LocationTrailLayer } from './LocationTrailLayer';
import { FilterPanel, type WorldViewFilters } from './FilterPanel';
import { AlbumPinLayer } from '../../../../shared/map/AlbumPinLayer';
import './WorldView.css';

interface WorldViewProps {
  onGoToDay: (dateIso: string) => void;
  onWorldNavHiddenChange: (hidden: boolean) => void;
}

const DEFAULT_FILTERS: WorldViewFilters = {
  showEventPins: true,
  showAlbumPins: true,
  showLocationPoints: true,
  showLocationTrails: true,
  startDate: '',
  endDate: '',
  selectedContactIds: [],
};

function isEvent(event: Event | QuickActionsEvent): event is Event {
  return event.eventType !== 'quickActions';
}

function isWithinDateRange(event: Event, filters: WorldViewFilters): boolean {
  if (filters.startDate && event.startDate < filters.startDate) return false;
  if (filters.endDate && event.startDate > filters.endDate) return false;
  return true;
}

function matchesContactFilter(event: Event, filters: WorldViewFilters): boolean {
  if (filters.selectedContactIds.length === 0) return true;
  const sharedWith = Array.isArray(event.sharedWith) ? event.sharedWith : [];
  return filters.selectedContactIds.some((contactId) => sharedWith.includes(contactId));
}

function WorldMapCapture({
  map,
  onMapChange,
}: {
  map: LeafletMap;
  onMapChange: (map: LeafletMap | null) => void;
}) {
  useEffect(() => {
    onMapChange(map);
    return () => onMapChange(null);
  }, [map, onMapChange]);

  return null;
}

export function WorldView({ onGoToDay, onWorldNavHiddenChange }: WorldViewProps) {
  const [navHidden, setNavHidden] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mode, setMode] = useState<'revisit' | 'explore'>('revisit');
  const [filters, setFilters] = useState<WorldViewFilters>(DEFAULT_FILTERS);
  const [map, setMap] = useState<LeafletMap | null>(null);
  const activeEvents = useScheduleStore((state) => state.activeEvents);
  const historyEvents = useScheduleStore((state) => state.historyEvents);

  useEffect(() => {
    onWorldNavHiddenChange(true);
    return () => onWorldNavHiddenChange(false);
  }, [onWorldNavHiddenChange]);

  const filteredEvents = useMemo(
    () => [...Object.values(activeEvents), ...Object.values(historyEvents)]
      .filter(isEvent)
      .filter((event) => isWithinDateRange(event, filters))
      .filter((event) => matchesContactFilter(event, filters)),
    [activeEvents, filters, historyEvents],
  );

  const locatedEvents = useMemo(
    () => filteredEvents.filter((event) => event.location !== null),
    [filteredEvents],
  );

  const mapLayerFilters = useMemo(
    () => ({
      ...filters,
      showEventPins: mode === 'revisit' && filters.showEventPins,
      showAlbumPins: mode === 'revisit' && filters.showAlbumPins,
      showLocationPoints: mode === 'revisit' && filters.showLocationPoints,
      showLocationTrails: mode === 'revisit' && filters.showLocationTrails,
    }),
    [filters, mode],
  );

  const handleGoToMyLocation = () => {
    if (!navigator.geolocation || !map) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        map.setView([position.coords.latitude, position.coords.longitude], 13);
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div className="cdb-world-view">
      <WorldMapContainer>
        {(leafletMap) => (
          <>
            <WorldMapCapture map={leafletMap} onMapChange={setMap} />
            <EventPinMarker
              map={leafletMap}
              events={locatedEvents}
              show={mapLayerFilters.showEventPins}
              onGoToDay={onGoToDay}
            />
            <AlbumPinLayer map={leafletMap} show={mapLayerFilters.showAlbumPins} onGoToDay={onGoToDay} />
            <LocationPointMarker
              map={leafletMap}
              events={filteredEvents}
              filters={mapLayerFilters}
              onGoToDay={onGoToDay}
            />
            <LocationTrailLayer
              map={leafletMap}
              events={filteredEvents}
              filters={mapLayerFilters}
              onGoToDay={onGoToDay}
            />
            {mode === 'explore' && (
              <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center">
                <div className="rounded-2xl border border-gray-200 bg-white/90 px-6 py-4 text-center shadow-lg backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/90">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Explore Mode</p>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Event centers coming soon</p>
                </div>
              </div>
            )}
          </>
        )}
      </WorldMapContainer>

      <div className={`cdb-world-controls ${filtersOpen ? 'is-open' : ''}`}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !navHidden;
              setNavHidden(next);
              onWorldNavHiddenChange(next);
            }}
            aria-label={navHidden ? 'Show navigation' : 'Hide navigation'}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white/90 text-gray-500 shadow-sm backdrop-blur-sm hover:bg-white dark:border-gray-700 dark:bg-gray-800/90 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {navHidden ? '\u276F' : '\u276E'}
          </button>
          <button
            type="button"
            onClick={handleGoToMyLocation}
            aria-label="Go to my location"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white/90 text-gray-500 shadow-sm backdrop-blur-sm hover:bg-white dark:border-gray-700 dark:bg-gray-800/90 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            &#x25CE;
          </button>
          <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white/90 p-1 shadow-sm backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/90">
            <button
              type="button"
              onClick={() => { setMode('revisit'); }}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                mode === 'revisit'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              Revisit
            </button>
            <button
              type="button"
              onClick={() => { setMode('explore'); setFiltersOpen(false); }}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                mode === 'explore'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              Explore
            </button>
          </div>

          {mode === 'revisit' && (
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              aria-controls="world-view-filters"
              className="flex h-9 items-center gap-1 rounded-full border border-gray-200 bg-white/90 px-3 text-xs font-medium text-gray-500 shadow-sm backdrop-blur-sm hover:bg-white dark:border-gray-700 dark:bg-gray-800/90 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Filters {filtersOpen ? '\u2227' : '\u2228'}
            </button>
          )}
        </div>

        <aside className="cdb-world-filter-panel">
          <FilterPanel filters={filters} onChange={setFilters} />
        </aside>
      </div>
    </div>
  );
}
