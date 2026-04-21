import { useMemo, useState } from 'react';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import type { Event, QuickActionsEvent } from '../../../../../types';
import { WorldMapContainer } from './WorldMapContainer';
import { EventPinMarker } from './EventPinMarker';
import { LocationPointMarker } from './LocationPointMarker';
import { LocationTrailLayer } from './LocationTrailLayer';
import { FilterPanel, type WorldViewFilters } from './FilterPanel';
import './WorldView.css';

interface WorldViewProps {
  onGoToDay: (dateIso: string) => void;
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

export function WorldView({ onGoToDay }: WorldViewProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<WorldViewFilters>(DEFAULT_FILTERS);
  const activeEvents = useScheduleStore((state) => state.activeEvents);
  const historyEvents = useScheduleStore((state) => state.historyEvents);

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
            <LocationPointMarker map={map} events={filteredEvents} filters={filters} />
            <LocationTrailLayer map={map} events={filteredEvents} filters={filters} />
          </>
        )}
      </WorldMapContainer>

      <div className={`cdb-world-controls ${filtersOpen ? 'is-open' : ''}`}>
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

        <aside className="cdb-world-filter-panel">
          <FilterPanel filters={filters} onChange={setFilters} />
        </aside>
      </div>
    </div>
  );
}
