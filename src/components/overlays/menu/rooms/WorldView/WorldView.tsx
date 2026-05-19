import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import type { ChangeEvent } from 'react';
import L from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { useResourceStore } from '../../../../../stores/useResourceStore';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { readPhotoFile } from '../../../../../utils/photoCapture';
import type { Event, QuickActionsEvent } from '../../../../../types';
import { WorldMapContainer } from './WorldMapContainer';
import { EventPinMarker } from './EventPinMarker';
import { LocationPointMarker } from './LocationPointMarker';
import { LocationTrailLayer } from './LocationTrailLayer';
import { FilterPanel, type WorldViewFilters } from './FilterPanel';
import { LegendPanel } from './LegendPanel';
import { GalleryPinLayer, type GalleryPhoto } from './GalleryPinLayer';
import { GalleryDateSlider } from './GalleryDateSlider';
import { EventizePopup } from './EventizePopup';
import { EventCenterLayer, type EventCenter, type EventCenterCategory } from './EventCenterLayer';
import { EventCenterPopup } from './EventCenterPopup';
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

const GALLERY_CHUNK_SIZE = 500;
const GALLERY_BATCH_SIZE = 20;
const ALL_CATEGORIES: EventCenterCategory[] = [
  'outdoors',
  'food',
  'faith',
  'arts',
  'sports',
  'health',
  'education',
  'travel',
];

const EXPLORE_CATEGORY_CONFIG: Record<EventCenterCategory, { label: string; emoji: string }> = {
  outdoors: { label: 'Outdoors', emoji: '\uD83C\uDF32' },
  food: { label: 'Food & Drink', emoji: '\uD83C\uDF7D\uFE0F' },
  faith: { label: 'Faith', emoji: '\u26EA' },
  arts: { label: 'Arts & Culture', emoji: '\uD83C\uDFA8' },
  sports: { label: 'Sports', emoji: '\uD83C\uDFC6' },
  health: { label: 'Health', emoji: '\u2665\uFE0F' },
  education: { label: 'Education', emoji: '\uD83D\uDCDA' },
  travel: { label: 'Travel', emoji: '\u2708\uFE0F' },
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
  const coAttendees = Array.isArray(event.coAttendees) ? event.coAttendees : [];
  return filters.selectedContactIds.some((contactId) =>
    coAttendees.some((a) => a.contactId === contactId)
  );
}

function isMapEventWithinDateRange(event: Event | QuickActionsEvent, filters: WorldViewFilters): boolean {
  const date = isEvent(event) ? event.startDate : event.date;
  if (filters.startDate && date < filters.startDate) return false;
  if (filters.endDate && date > filters.endDate) return false;
  return true;
}

function matchesMapContactFilter(event: Event | QuickActionsEvent, filters: WorldViewFilters): boolean {
  if (!isEvent(event)) return filters.selectedContactIds.length === 0;
  return matchesContactFilter(event, filters);
}

const roundToNearestHour = (isoString: string): string => {
  const d = new Date(isoString);
  if (d.getMinutes() >= 30) d.setHours(d.getHours() + 1);
  d.setMinutes(0, 0, 0);
  return d.toTimeString().slice(0, 5);
};

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
  const [legendOpen, setLegendOpen] = useState(false);
  const [mode, setMode] = useState<'revisit' | 'explore' | 'gallery'>('revisit');
  const [filters, setFilters] = useState<WorldViewFilters>(DEFAULT_FILTERS);
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhoto[]>([]);
  const [eventizePhoto, setEventizePhoto] = useState<GalleryPhoto | null>(null);
  const [eventCenterTarget, setEventCenterTarget] = useState<EventCenter | null>(null);
  const [enabledCategories, setEnabledCategories] = useState<EventCenterCategory[]>([...ALL_CATEGORIES]);
  const [exploreCenters, setExploreCenters] = useState<EventCenter[]>([]);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [exploreReloadKey, setExploreReloadKey] = useState(0);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryFileQueue, setGalleryFileQueue] = useState<File[]>([]);
  const [galleryChunkOffset, setGalleryChunkOffset] = useState(0);
  const [galleryTotal, setGalleryTotal] = useState(0);
  const [galleryProcessed, setGalleryProcessed] = useState(0);
  const [galleryStartDate, setGalleryStartDate] = useState<string>('');
  const [galleryEndDate, setGalleryEndDate] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resources = useResourceStore((state) => state.resources);
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

  const galleryDateRange = useMemo(() => {
    if (galleryPhotos.length === 0) return null;
    const dates = galleryPhotos.map((p) => p.date).filter(Boolean).sort();
    if (dates.length === 0) return null;
    return { min: dates[0], max: dates[dates.length - 1] };
  }, [galleryPhotos]);

  const effectiveGalleryStartDate = galleryStartDate || galleryDateRange?.min || '';
  const effectiveGalleryEndDate = galleryEndDate || galleryDateRange?.max || '';

  const filteredGalleryPhotos = useMemo(() => {
    if (!effectiveGalleryStartDate || !effectiveGalleryEndDate) return galleryPhotos;
    return galleryPhotos.filter(
      (photo) => photo.date >= effectiveGalleryStartDate && photo.date <= effectiveGalleryEndDate,
    );
  }, [effectiveGalleryEndDate, effectiveGalleryStartDate, galleryPhotos]);

  const locatedEvents = useMemo(
    () => filteredEvents.filter((event) => event.location !== null),
    [filteredEvents],
  );

  const filteredMapEvents = useMemo(
    () => [...Object.values(activeEvents), ...Object.values(historyEvents)]
      .filter((event) => isMapEventWithinDateRange(event, filters))
      .filter((event) => matchesMapContactFilter(event, filters)),
    [activeEvents, filters, historyEvents],
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

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<EventCenterCategory, number>> = {};
    for (const center of exploreCenters) {
      counts[center.category] = (counts[center.category] ?? 0) + 1;
    }
    return counts;
  }, [exploreCenters]);

  const visibleCount = useMemo(
    () => exploreCenters.filter((center) => enabledCategories.includes(center.category)).length,
    [enabledCategories, exploreCenters],
  );

  const handleCentersLoaded = useCallback((centers: EventCenter[]) => {
    setExploreCenters(centers);
    setExploreLoading(false);
  }, []);

  const allAlbumEntries = useMemo(() => {
    const entries: { latitude: number; longitude: number; date: string }[] = [];
    for (const event of [...Object.values(activeEvents), ...Object.values(historyEvents)]) {
      const album = (event as Event).eventAlbum ?? [];
      for (const entry of album) {
        if (entry.location && entry.date) {
          entries.push({ latitude: entry.location.latitude, longitude: entry.location.longitude, date: entry.date });
        }
      }
    }
    for (const resource of Object.values(resources)) {
      const album = (resource as { album?: { location?: { latitude: number; longitude: number }; date?: string }[] }).album ?? [];
      for (const entry of album) {
        if (entry.location && entry.date) {
          entries.push({ latitude: entry.location.latitude, longitude: entry.location.longitude, date: entry.date });
        }
      }
    }
    return entries;
  }, [activeEvents, historyEvents, resources]);

  const isAlbumMatched = useCallback((lat: number, lng: number, date: string): boolean => {
    const R = 6371000;
    return allAlbumEntries.some((entry) => {
      if (entry.date !== date) return false;
      const dLat = ((entry.latitude - lat) * Math.PI) / 180;
      const dLng = ((entry.longitude - lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat * Math.PI) / 180) *
          Math.cos((entry.latitude * Math.PI) / 180) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) < 50;
    });
  }, [allAlbumEntries]);

  const handleGalleryFiles = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const allFiles = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith('image/'),
    );
    if (allFiles.length === 0) return;
    setGalleryPhotos([]);
    setGalleryStartDate('');
    setGalleryEndDate('');
    setGalleryFileQueue(allFiles);
    setGalleryChunkOffset(0);
    setGalleryTotal(allFiles.length);
    setGalleryProcessed(0);
    event.target.value = '';
  }, []);

  const processChunk = useCallback(async (files: File[], offset: number) => {
    const chunk = files.slice(offset, offset + GALLERY_CHUNK_SIZE);
    if (chunk.length === 0) return;
    setGalleryLoading(true);
    const results: GalleryPhoto[] = [];
    for (let i = 0; i < chunk.length; i += GALLERY_BATCH_SIZE) {
      const batch = chunk.slice(i, i + GALLERY_BATCH_SIZE);
      await Promise.all(
        batch.map(async (file) => {
          try {
            const result = await readPhotoFile(file);
            if (!result.location) return;
            const capturedAt = result.capturedAt ?? new Date(file.lastModified).toISOString();
            const date = capturedAt.slice(0, 10);
            const timeRounded = roundToNearestHour(capturedAt);
            results.push({
              uri: result.uri,
              latitude: result.location.latitude,
              longitude: result.location.longitude,
              capturedAt,
              date,
              timeRounded,
              isAlbumMatched: isAlbumMatched(
                result.location.latitude,
                result.location.longitude,
                date,
              ),
            });
          } catch {
            // Skip files that fail metadata parsing.
          }
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    setGalleryPhotos((prev) => [...prev, ...results]);
    setGalleryProcessed((prev) => prev + chunk.length);
    setGalleryChunkOffset(offset + GALLERY_CHUNK_SIZE);
    setGalleryLoading(false);
  }, [isAlbumMatched]);

  useEffect(() => {
    if (galleryFileQueue.length > 0 && galleryChunkOffset === 0 && !galleryLoading) {
      const timeoutId = window.setTimeout(() => {
        void processChunk(galleryFileQueue, 0);
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [galleryFileQueue, galleryChunkOffset, galleryLoading, processChunk]);

  const handleZoomToContents = useCallback(() => {
    if (!map) return;

    const points: [number, number][] = [];

    if (mode === 'revisit') {
      for (const event of locatedEvents) {
        if (event.location) {
          points.push([event.location.latitude, event.location.longitude]);
        }
      }

      for (const entry of allAlbumEntries) {
        points.push([entry.latitude, entry.longitude]);
      }
    }

    if (mode === 'gallery') {
      for (const photo of filteredGalleryPhotos) {
        points.push([photo.latitude, photo.longitude]);
      }
    }

    if (points.length === 0) return;

    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }

    const bounds = L.latLngBounds(points.map(([lat, lng]) => L.latLng(lat, lng)));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [allAlbumEntries, filteredGalleryPhotos, locatedEvents, map, mode]);

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
      <WorldMapContainer onAttributionClick={() => setLegendOpen((value) => !value)}>
        {(leafletMap) => (
          <>
            <WorldMapCapture map={leafletMap} onMapChange={setMap} />
            <EventPinMarker
              map={leafletMap}
              events={locatedEvents}
              show={mapLayerFilters.showEventPins}
              onGoToDay={onGoToDay}
            />
            <AlbumPinLayer
              map={leafletMap}
              show={mapLayerFilters.showAlbumPins}
              onGoToDay={onGoToDay}
              events={filteredMapEvents}
              resources={resources}
            />
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
            <GalleryPinLayer
              map={leafletMap}
              photos={filteredGalleryPhotos}
              show={mode === 'gallery'}
              onEventize={setEventizePhoto}
            />
            <EventCenterLayer
              key={exploreReloadKey}
              map={leafletMap}
              show={mode === 'explore'}
              onPlanEvent={setEventCenterTarget}
              enabledCategories={enabledCategories}
              onCentersLoaded={handleCentersLoaded}
            />
            {mode === 'gallery' && galleryPhotos.length === 0 && !galleryLoading && (
              <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center">
                <div className="rounded-2xl border border-gray-200 bg-white/90 px-6 py-4 text-center shadow-lg backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/90">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Gallery Mode</p>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Select a folder to see photos on the map</p>
                </div>
              </div>
            )}
          </>
        )}
      </WorldMapContainer>
      {mode === 'gallery' && galleryDateRange && galleryPhotos.length > 0 && (
        <GalleryDateSlider
          minDate={galleryDateRange.min}
          maxDate={galleryDateRange.max}
          startDate={effectiveGalleryStartDate}
          endDate={effectiveGalleryEndDate}
          count={filteredGalleryPhotos.length}
          onRangeChange={(start, end) => {
            setGalleryStartDate(start);
            setGalleryEndDate(end);
          }}
        />
      )}
      {/* Nav toggle - top right */}
      <div className="cdb-world-nav-toggle">
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
      </div>

      {/* Top-left controls */}
      <div className="cdb-world-controls">
        {/* Row 1 - mode tabs */}
        <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white/90 p-1 shadow-sm backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/90">
          <button
            type="button"
            onClick={() => setMode('revisit')}
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
            onClick={() => {
              setMode('explore');
              setFiltersOpen(false);
              setExploreLoading(true);
              setExploreCenters([]);
            }}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              mode === 'explore'
                ? 'bg-purple-600 text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Explore
          </button>
          <button
            type="button"
            onClick={() => { setMode('gallery'); setFiltersOpen(false); }}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              mode === 'gallery'
                ? 'bg-amber-500 text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Gallery
          </button>
        </div>

        {/* Row 2 - mode-specific controls */}
        {mode === 'revisit' && (
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className="flex h-9 items-center gap-1 rounded-full border border-gray-200 bg-white/90 px-3 text-xs font-medium text-gray-500 shadow-sm backdrop-blur-sm hover:bg-white dark:border-gray-700 dark:bg-gray-800/90 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Filters {filtersOpen ? '\u2227' : '\u2228'}
          </button>
        )}

        {mode === 'explore' && (
          <div className="rounded-xl border border-gray-200 bg-white/90 shadow-sm backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/90">
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Event Centers
              </span>
              {exploreLoading ? (
                <span className="text-[10px] text-gray-400">Loading...</span>
              ) : (
                <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-300">
                  {visibleCount} showing
                </span>
              )}
            </button>
            {filtersOpen && (
              <div className="border-t border-gray-100 px-3 pb-2 dark:border-gray-700">
                {ALL_CATEGORIES.map((cat) => {
                  const checked = enabledCategories.includes(cat);
                  const count = categoryCounts[cat] ?? 0;
                  const { emoji, label } = EXPLORE_CATEGORY_CONFIG[cat];
                return (
                  <label
                    key={cat}
                    className="flex cursor-pointer items-center gap-2 py-1.5"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setEnabledCategories((prev) =>
                          checked ? prev.filter((c) => c !== cat) : [...prev, cat]
                        )
                      }
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">{emoji}</span>
                    <span className="flex-1 text-xs text-gray-700 dark:text-gray-300">{label}</span>
                    <span className="text-[10px] text-gray-400">[{count}]</span>
                  </label>
                );
              })}
              </div>
            )}
          </div>
        )}

        {mode === 'gallery' && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={galleryLoading}
                className="flex h-9 items-center gap-1.5 rounded-full border border-amber-300 bg-white/90 px-3 text-xs font-medium text-amber-600 shadow-sm backdrop-blur-sm hover:bg-white dark:border-amber-600 dark:bg-gray-800/90 dark:text-amber-400"
              >
                {galleryLoading ? 'Loading...' : '\uD83D\uDDBC\uFE0F Select Folder'}
              </button>
              {galleryTotal > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  {galleryPhotos.length} GPS / {galleryProcessed}/{galleryTotal}
                </span>
              )}
            </div>
            <p className="px-1 text-[10px] text-gray-400 dark:text-gray-500">
              Photos are read locally {'\u2014'} nothing is uploaded.
            </p>
            {galleryTotal > 0 && !galleryLoading && galleryChunkOffset < galleryTotal && (
              <button
                type="button"
                onClick={() => void processChunk(galleryFileQueue, galleryChunkOffset)}
                className="rounded-full border border-amber-300 px-2 py-0.5 text-[10px] font-medium text-amber-600 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400"
              >
                Load next {Math.min(GALLERY_CHUNK_SIZE, galleryTotal - galleryChunkOffset)} photos
              </button>
            )}
            {galleryLoading && (
              <span className="px-1 text-[10px] text-amber-500">Scanning...</span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
              onChange={handleGalleryFiles}
              className="hidden"
            />
          </div>
        )}

        {legendOpen && <LegendPanel onClose={() => setLegendOpen(false)} />}
      </div>

      {/* Filter panel - independent, anchored to left */}
      {filtersOpen && mode === 'revisit' && (
        <aside className="cdb-world-filter-panel" id="world-view-filters">
          <FilterPanel filters={filters} onChange={setFilters} />
        </aside>
      )}

      {/* Bottom-right custom buttons */}
      <div className="cdb-world-bottom-right">
        {mode === 'explore' && (
          <button
            type="button"
            onClick={() => {
              setExploreLoading(true);
              setExploreCenters([]);
              setExploreReloadKey((k) => k + 1);
            }}
            aria-label="Reload event centers"
            className="cdb-world-map-btn"
            title="Reload"
          >
            &#x27F3;
          </button>
        )}
        {(mode === 'revisit' || mode === 'gallery') && (
          <button
            type="button"
            onClick={handleZoomToContents}
            aria-label="Zoom to contents"
            className="cdb-world-map-btn"
            title="Zoom to contents"
          >
            &#x26F6;
          </button>
        )}
        <button
          type="button"
          onClick={handleGoToMyLocation}
          aria-label="Go to my location"
          className="cdb-world-map-btn"
          title="My location"
        >
          &#x25CE;
        </button>
      </div>
      {eventizePhoto && (
        <EventizePopup
          photo={eventizePhoto}
          onClose={() => setEventizePhoto(null)}
        />
      )}
      {eventCenterTarget && (
        <EventCenterPopup
          center={eventCenterTarget}
          onClose={() => setEventCenterTarget(null)}
        />
      )}
    </div>
  );
}
