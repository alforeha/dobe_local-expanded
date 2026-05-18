import { useEffect, useMemo, useState } from 'react';
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

export function WorldView({ onGoToDay, onWorldNavHiddenChange }: WorldViewProps) {
  const [navHidden, setNavHidden] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<WorldViewFilters>(DEFAULT_FILTERS);
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

  return (
    <div className="cdb-world-view">
      <WorldMapContainer>
        {(map) => (
          <>
            <EventPinMarker
              map={map}
              events={locatedEvents}
              show={filters.showEventPins}
              onGoToDay={onGoToDay}
            />
            <AlbumPinLayer map={map} show />
            <LocationPointMarker map={map} events={filteredEvents} filters={filters} />
            <LocationTrailLayer map={map} events={filteredEvents} filters={filters} />
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
            className="cdb-world-header"
            aria-expanded={filtersOpen}
            aria-controls="world-view-filters"
            onClick={() => setFiltersOpen((current) => !current)}
          >
            <span>World View</span>
            <span className="cdb-world-header-chevron" aria-hidden="true">
              {filtersOpen ? '^' : 'v'}
            </span>
            <span className="sr-only">Toggle filters</span>
          </button>
        </div>

        <aside className="cdb-world-filter-panel">
          <FilterPanel filters={filters} onChange={setFilters} />
        </aside>
      </div>
    </div>
  );
}
