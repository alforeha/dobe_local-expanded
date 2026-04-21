import { useState } from 'react';
import { WorldMapContainer } from './WorldMapContainer';
import { EventPinMarker } from './EventPinMarker';
import './WorldView.css';

interface WorldViewProps {
  onGoToDay: (dateIso: string) => void;
}

export function WorldView({ onGoToDay }: WorldViewProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="cdb-world-view">
      <WorldMapContainer>
        {(map) => <EventPinMarker map={map} onGoToDay={onGoToDay} />}
      </WorldMapContainer>

      <header className="cdb-world-header" aria-label="World View">
        <span>World View</span>
      </header>

      <aside className={`cdb-world-filter-panel ${filtersOpen ? 'is-open' : ''}`}>
        <button
          type="button"
          className="cdb-world-filter-toggle"
          aria-expanded={filtersOpen}
          aria-controls="world-view-filters"
          onClick={() => setFiltersOpen((current) => !current)}
        >
          <span aria-hidden="true">{filtersOpen ? '>' : '<'}</span>
          <span className="sr-only">Toggle filters</span>
        </button>
        <div id="world-view-filters" className="cdb-world-filter-body">
          <p className="cdb-world-filter-title">Filters</p>
          <label className="cdb-world-filter-row">
            <input type="checkbox" checked readOnly />
            <span>Events</span>
          </label>
          <label className="cdb-world-filter-row">
            <input type="checkbox" checked readOnly />
            <span>History</span>
          </label>
        </div>
      </aside>
    </div>
  );
}
