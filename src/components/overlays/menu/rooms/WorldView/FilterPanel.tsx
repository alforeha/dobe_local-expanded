import { useMemo } from 'react';
import { useResourceStore } from '../../../../../stores/useResourceStore';
import { isContact } from '../../../../../types';

export interface WorldViewFilters {
  showEventPins: boolean;
  showLocationPoints: boolean;
  showLocationTrails: boolean;
  startDate: string;
  endDate: string;
  selectedContactIds: string[];
}

interface FilterPanelProps {
  filters: WorldViewFilters;
  onChange: (filters: WorldViewFilters) => void;
}

function updateContactSelection(current: string[], contactId: string, selected: boolean): string[] {
  if (selected) {
    return current.includes(contactId) ? current : [...current, contactId];
  }

  return current.filter((id) => id !== contactId);
}

export function FilterPanel({ filters, onChange }: FilterPanelProps) {
  const resources = useResourceStore((state) => state.resources);
  const contacts = useMemo(
    () => Object.values(resources)
      .filter(isContact)
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [resources],
  );

  return (
    <div id="world-view-filters" className="cdb-world-filter-body">
      <p className="cdb-world-filter-title">Layers</p>

      <label className="cdb-world-filter-row">
        <input
          type="checkbox"
          checked={filters.showEventPins}
          onChange={(event) => onChange({ ...filters, showEventPins: event.target.checked })}
        />
        <span>Event pins</span>
      </label>

      <label className="cdb-world-filter-row">
        <input
          type="checkbox"
          checked={filters.showLocationPoints}
          onChange={(event) => onChange({ ...filters, showLocationPoints: event.target.checked })}
        />
        <span>Location points</span>
      </label>

      <label className="cdb-world-filter-row">
        <input
          type="checkbox"
          checked={filters.showLocationTrails}
          onChange={(event) => onChange({ ...filters, showLocationTrails: event.target.checked })}
        />
        <span>Location trails</span>
      </label>

      <div className="cdb-world-filter-section">
        <p className="cdb-world-filter-subtitle">Date range</p>
        <label className="cdb-world-date-field">
          <span>Start</span>
          <input
            type="date"
            value={filters.startDate}
            onChange={(event) => onChange({ ...filters, startDate: event.target.value })}
          />
        </label>
        <label className="cdb-world-date-field">
          <span>End</span>
          <input
            type="date"
            value={filters.endDate}
            onChange={(event) => onChange({ ...filters, endDate: event.target.value })}
          />
        </label>
      </div>

      <div className="cdb-world-filter-section">
        <p className="cdb-world-filter-subtitle">Contacts</p>
        {contacts.length === 0 ? (
          <p className="cdb-world-filter-empty">No contacts yet.</p>
        ) : (
          <div className="cdb-world-contact-list">
            {contacts.map((contact) => (
              <label key={contact.id} className="cdb-world-filter-row">
                <input
                  type="checkbox"
                  checked={filters.selectedContactIds.includes(contact.id)}
                  onChange={(event) =>
                    onChange({
                      ...filters,
                      selectedContactIds: updateContactSelection(
                        filters.selectedContactIds,
                        contact.id,
                        event.target.checked,
                      ),
                    })
                  }
                />
                <span>{contact.displayName || contact.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
