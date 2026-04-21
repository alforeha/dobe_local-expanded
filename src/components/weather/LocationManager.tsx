import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useSystemStore } from '../../stores/useSystemStore';
import { useResourceStore } from '../../stores/useResourceStore';
import { reverseGeocode, forwardGeocode } from '../../utils/geocode';
import { isHome } from '../../types';
import type { NamedLocation } from '../../types';

interface LocationManagerProps {
  onClose: () => void;
}

export function LocationManager({ onClose }: LocationManagerProps) {
  const locationPreferences = useSystemStore((s) => s.settings?.locationPreferences);
  const addNamedLocation = useSystemStore((s) => s.addNamedLocation);
  const removeNamedLocation = useSystemStore((s) => s.removeNamedLocation);
  const setActiveLocation = useSystemStore((s) => s.setActiveLocation);
  const updateNamedLocation = useSystemStore((s) => s.updateNamedLocation);
  const resources = useResourceStore((s) => s.resources);

  const locations = locationPreferences?.locations ?? [];
  const activeLocationId = locationPreferences?.activeLocationId ?? null;

  // Home resources that have an address
  const homesWithAddress = Object.values(resources)
    .filter(isHome)
    .filter((h) => h.address && h.address.trim() !== '');

  // ── GPS add ───────────────────────────────────────────────────────────────
  const [gpsState, setGpsState] = useState<'idle' | 'locating' | 'labelling'>('idle');
  const [gpsPending, setGpsPending] = useState<{ lat: number; lng: number; cityName: string } | null>(null);
  const [gpsLabel, setGpsLabel] = useState('');
  const [gpsError, setGpsError] = useState<string | null>(null);

  function handleUseGps() {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by this browser.');
      return;
    }
    setGpsState('locating');
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        reverseGeocode(lat, lng)
          .then((cityName) => {
            setGpsPending({ lat, lng, cityName });
            setGpsLabel(cityName || '');
            setGpsState('labelling');
          })
          .catch(() => {
            setGpsPending({ lat, lng, cityName: '' });
            setGpsLabel('');
            setGpsState('labelling');
          });
      },
      (err) => {
        setGpsState('idle');
        setGpsError(`Location unavailable: ${err.message}`);
      },
      { enableHighAccuracy: false, maximumAge: 60 * 60 * 1000, timeout: 10000 },
    );
  }

  function confirmGpsAdd() {
    if (!gpsPending) return;
    addNamedLocation({ id: uuidv4(), label: gpsLabel.trim() || 'My Location', ...gpsPending });
    setGpsPending(null);
    setGpsLabel('');
    setGpsState('idle');
  }

  // ── Address add ───────────────────────────────────────────────────────────
  const [addressInput, setAddressInput] = useState('');
  const [addressState, setAddressState] = useState<'idle' | 'searching' | 'labelling'>('idle');
  const [addressPending, setAddressPending] = useState<{ lat: number; lng: number; cityName: string } | null>(null);
  const [addressLabel, setAddressLabel] = useState('');
  const [addressError, setAddressError] = useState<string | null>(null);

  async function handleAddressSearch() {
    const q = addressInput.trim();
    if (!q) return;
    setAddressState('searching');
    setAddressError(null);
    const coords = await forwardGeocode(q);
    if (!coords) {
      setAddressState('idle');
      setAddressError('No location found for that address.');
      return;
    }
    const cityName = await reverseGeocode(coords.lat, coords.lng);
    setAddressPending({ ...coords, cityName });
    setAddressLabel(cityName || q);
    setAddressState('labelling');
  }

  function confirmAddressAdd() {
    if (!addressPending) return;
    addNamedLocation({ id: uuidv4(), label: addressLabel.trim() || addressInput.trim(), ...addressPending });
    setAddressPending(null);
    setAddressLabel('');
    setAddressInput('');
    setAddressState('idle');
  }

  // ── Edit label ────────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  function startEdit(loc: NamedLocation) {
    setEditingId(loc.id);
    setEditLabel(loc.label);
  }

  function confirmEdit() {
    if (!editingId) return;
    updateNamedLocation(editingId, { label: editLabel.trim() || editLabel });
    setEditingId(null);
    setEditLabel('');
  }

  // ── Home resource add ─────────────────────────────────────────────────────
  const [homeAddingId, setHomeAddingId] = useState<string | null>(null);
  const [homeAddState, setHomeAddState] = useState<'idle' | 'searching'>('idle');
  const [homeAddError, setHomeAddError] = useState<string | null>(null);
  const [homePending, setHomePending] = useState<{ lat: number; lng: number; cityName: string; defaultLabel: string } | null>(null);
  const [homeLabel, setHomeLabel] = useState('');
  const [homeLabelling, setHomeLabelling] = useState(false);

  async function handleHomeSelect(homeId: string, address: string, defaultLabel: string) {
    setHomeAddingId(homeId);
    setHomeAddState('searching');
    setHomeAddError(null);
    const coords = await forwardGeocode(address);
    if (!coords) {
      setHomeAddState('idle');
      setHomeAddError('Could not geocode that address.');
      setHomeAddingId(null);
      return;
    }
    const cityName = await reverseGeocode(coords.lat, coords.lng);
    setHomePending({ ...coords, cityName, defaultLabel });
    setHomeLabel(defaultLabel);
    setHomeLabelling(true);
    setHomeAddState('idle');
  }

  function confirmHomeAdd() {
    if (!homePending) return;
    addNamedLocation({ id: uuidv4(), label: homeLabel.trim() || homePending.defaultLabel, lat: homePending.lat, lng: homePending.lng, cityName: homePending.cityName });
    setHomePending(null);
    setHomeLabel('');
    setHomeLabelling(false);
    setHomeAddingId(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">Manage Locations</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          aria-label="Close location manager"
        >
          ✕
        </button>
      </div>

      {/* Saved locations list */}
      {locations.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No saved locations yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {locations.map((loc) => {
            const isActive = loc.id === activeLocationId;
            return (
              <li
                key={loc.id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${isActive ? 'border-purple-400 bg-purple-50 dark:border-purple-600 dark:bg-purple-900/20' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/40'}`}
              >
                <div className="min-w-0 flex-1">
                  {editingId === loc.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') setEditingId(null); }}
                        autoFocus
                      />
                      <button type="button" onClick={confirmEdit} className="text-xs font-medium text-purple-600 dark:text-purple-400">Save</button>
                      <button type="button" onClick={() => setEditingId(null)} className="text-xs text-gray-500">Cancel</button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{loc.label}</span>
                        {isActive && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-800/40 dark:text-purple-300">Active</span>}
                      </div>
                      {loc.cityName && <div className="text-xs text-gray-500 dark:text-gray-400">{loc.cityName}</div>}
                    </>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!isActive && editingId !== loc.id && (
                    <button
                      type="button"
                      onClick={() => setActiveLocation(loc.id)}
                      className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      Set active
                    </button>
                  )}
                  {editingId !== loc.id && (
                    <button
                      type="button"
                      onClick={() => startEdit(loc)}
                      className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeNamedLocation(loc.id)}
                    className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-500 transition-colors hover:bg-red-50 dark:border-red-800/40 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add section */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Add a location</div>

        {/* Method 1 — GPS */}
        {gpsState === 'idle' && !gpsPending && (
          <div className="mb-3">
            <button
              type="button"
              onClick={handleUseGps}
              className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
            >
              Use my location
            </button>
            {gpsError && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{gpsError}</p>}
          </div>
        )}
        {gpsState === 'locating' && (
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">Locating…</p>
        )}
        {gpsState === 'labelling' && gpsPending && (
          <div className="mb-3 flex items-center gap-2">
            <input
              className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              placeholder="Label (e.g. Home)"
              value={gpsLabel}
              onChange={(e) => setGpsLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmGpsAdd(); }}
              autoFocus
            />
            <button type="button" onClick={confirmGpsAdd} className="rounded-lg bg-purple-600 px-3 py-1 text-sm font-medium text-white hover:bg-purple-700">Add</button>
            <button type="button" onClick={() => { setGpsState('idle'); setGpsPending(null); }} className="text-sm text-gray-500">Cancel</button>
          </div>
        )}

        {/* Method 2 — Address */}
        {addressState !== 'labelling' && (
          <div className="mb-3 flex items-center gap-2">
            <input
              className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              placeholder="Type an address…"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAddressSearch(); }}
            />
            <button
              type="button"
              onClick={() => void handleAddressSearch()}
              disabled={addressState === 'searching' || !addressInput.trim()}
              className="rounded-lg border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {addressState === 'searching' ? 'Searching…' : 'Search'}
            </button>
          </div>
        )}
        {addressError && <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">{addressError}</p>}
        {addressState === 'labelling' && addressPending && (
          <div className="mb-3 flex items-center gap-2">
            <input
              className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              placeholder="Label"
              value={addressLabel}
              onChange={(e) => setAddressLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmAddressAdd(); }}
              autoFocus
            />
            <button type="button" onClick={confirmAddressAdd} className="rounded-lg bg-purple-600 px-3 py-1 text-sm font-medium text-white hover:bg-purple-700">Add</button>
            <button type="button" onClick={() => { setAddressState('idle'); setAddressPending(null); }} className="text-sm text-gray-500">Cancel</button>
          </div>
        )}

        {/* Method 3 — Home resources */}
        {homesWithAddress.length > 0 && (
          <div>
            <div className="mb-1 text-xs text-gray-500 dark:text-gray-400">From your homes:</div>
            {homeLabelling && homePending ? (
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="Label"
                  value={homeLabel}
                  onChange={(e) => setHomeLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmHomeAdd(); }}
                  autoFocus
                />
                <button type="button" onClick={confirmHomeAdd} className="rounded-lg bg-purple-600 px-3 py-1 text-sm font-medium text-white hover:bg-purple-700">Add</button>
                <button type="button" onClick={() => { setHomeLabelling(false); setHomePending(null); setHomeAddingId(null); }} className="text-sm text-gray-500">Cancel</button>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {homesWithAddress.map((home) => (
                  <div key={home.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-200">
                      {home.name} — {home.address}
                    </span>
                    <button
                      type="button"
                      disabled={homeAddingId === home.id && homeAddState === 'searching'}
                      onClick={() => void handleHomeSelect(home.id, home.address!, home.name)}
                      className="shrink-0 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      {homeAddingId === home.id && homeAddState === 'searching' ? 'Searching…' : 'Use'}
                    </button>
                  </div>
                ))}
                {homeAddError && <p className="text-xs text-amber-600 dark:text-amber-400">{homeAddError}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
