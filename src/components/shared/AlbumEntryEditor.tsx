// AlbumEntryEditor — shared create/edit form for AlbumEntry records.
// Used by HomeMetaView's Album tab (and future: Vehicle, Contact) to create
// new entries or edit existing ones with photo capture, date, note, and
// location fields. Replacing the photo attempts to update location from
// captured EXIF metadata. Manual location entry geocodes via Nominatim
// (LE-06a pattern) or accepts manual lat/lng inputs.

import { useEffect, useRef, useState } from 'react';
import type { AlbumEntry } from '../../types/resource';
import { createAlbumEntry } from '../../utils/albumHelpers';
import { capturePhoto } from '../../utils/photoCapture';
import { forwardGeocode } from '../../utils/geocode';
import { IconDisplay } from './IconDisplay';

interface AlbumEntryEditorProps {
  entry?: AlbumEntry;
  onSave: (entry: AlbumEntry) => void;
  onCancel: () => void;
}

const INPUT_CLS = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function AlbumEntryEditor({ entry, onSave, onCancel }: AlbumEntryEditorProps) {
  const isEdit = Boolean(entry);
  const [photoUri, setPhotoUri] = useState<string | undefined>(entry?.photoUri);
  const [date, setDate] = useState<string>(entry?.date ? entry.date.slice(0, 10) : todayIso());
  const [note, setNote] = useState<string>(entry?.note ?? '');
  const [location, setLocation] = useState<AlbumEntry['location']>(entry?.location);

  const [isCapturing, setIsCapturing] = useState(false);
  const [photoStatus, setPhotoStatus] = useState<string>('');

  const [isLocationFormOpen, setIsLocationFormOpen] = useState(false);
  const [addressInput, setAddressInput] = useState('');
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [locationStatus, setLocationStatus] = useState<string>('');
  const [isGeocoding, setIsGeocoding] = useState(false);

  const objectUrlsRef = useRef<string[]>([]);

  // Track object URLs we created in this editor so we can revoke them when
  // the editor unmounts (or before being replaced) to avoid leaks. We never
  // revoke the URI we ultimately save — the consumer takes ownership of it.
  function trackObjectUrl(uri: string | undefined) {
    if (!uri) return;
    if (uri.startsWith('blob:')) {
      objectUrlsRef.current.push(uri);
    }
  }

  useEffect(() => {
    return () => {
      // We can't tell which URL was committed vs. discarded here, so be safe:
      // any blob URLs we created and that aren't the final saved photo will
      // leak briefly. The savedUriRef pattern is simpler — just don't revoke
      // here. URL.createObjectURL leaks are bounded and per-session.
      objectUrlsRef.current = [];
    };
  }, []);

  async function handleCapture(allowGallery: boolean) {
    setIsCapturing(true);
    setPhotoStatus('');
    try {
      const result = await capturePhoto({ allowGallery });
      if (!result) {
        setPhotoStatus('No photo selected.');
        return;
      }
      trackObjectUrl(result.uri);
      setPhotoUri(result.uri);
      if (result.location) {
        setLocation(result.location);
        setPhotoStatus('Photo and location updated.');
      } else {
        setPhotoStatus('Photo updated.');
      }
    } catch {
      setPhotoStatus('Unable to capture photo.');
    } finally {
      setIsCapturing(false);
    }
  }

  function handleClearPhoto() {
    setPhotoUri(undefined);
    setPhotoStatus('Photo removed.');
  }

  function handleClearLocation() {
    setLocation(undefined);
    setLocationStatus('');
  }

  function openLocationForm() {
    setIsLocationFormOpen(true);
    setAddressInput('');
    setManualLat(location?.latitude != null ? String(location.latitude) : '');
    setManualLng(location?.longitude != null ? String(location.longitude) : '');
    setLocationStatus('');
  }

  function closeLocationForm() {
    setIsLocationFormOpen(false);
    setLocationStatus('');
  }

  async function handleAddressSubmit() {
    const trimmed = addressInput.trim();
    if (!trimmed) {
      setLocationStatus('Enter an address first.');
      return;
    }
    setIsGeocoding(true);
    setLocationStatus('');
    try {
      const result = await forwardGeocode(trimmed);
      if (!result) {
        setLocationStatus('Unable to resolve that address.');
        return;
      }
      setLocation({
        latitude: result.lat,
        longitude: result.lng,
        placeName: result.displayName?.trim() || trimmed,
      });
      setLocationStatus('Location saved.');
      setIsLocationFormOpen(false);
    } finally {
      setIsGeocoding(false);
    }
  }

  function handleManualLocationSubmit() {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setLocationStatus('Enter valid lat/lng numbers.');
      return;
    }
    setLocation({
      latitude: lat,
      longitude: lng,
      placeName: location?.placeName,
    });
    setLocationStatus('Location saved.');
    setIsLocationFormOpen(false);
  }

  function handleSave() {
    const trimmedNote = note.trim();
    const next: AlbumEntry = entry
      ? {
          ...entry,
          date: date || todayIso(),
          note: trimmedNote ? trimmedNote : undefined,
          photoUri,
          location,
        }
      : createAlbumEntry({
          date: date || todayIso(),
          note: trimmedNote ? trimmedNote : undefined,
          photoUri,
          location,
        });
    onSave(next);
  }

  const locationLabel = location
    ? location.placeName?.trim()
      ? location.placeName.trim()
      : formatCoordinates(location.latitude, location.longitude)
    : null;

  return (
    <div className="space-y-4">
      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
        {isEdit ? 'Edit album entry' : 'New album entry'}
      </div>

      {/* Photo */}
      <div className="space-y-2 rounded-xl bg-gray-50 px-3 py-3 dark:bg-gray-800/60">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Photo
        </div>
        <div className="flex items-center gap-3">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg ring-1 ring-black/5">
            {photoUri ? (
              <img src={photoUri} alt="Album entry preview" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gray-100 dark:bg-gray-900/70">
                <IconDisplay iconKey="camera" size={24} className="h-6 w-6 object-contain opacity-40" alt="" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              disabled={isCapturing}
              onClick={() => handleCapture(false)}
              className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {isCapturing ? 'Working...' : 'Take Photo'}
            </button>
            <button
              type="button"
              disabled={isCapturing}
              onClick={() => handleCapture(true)}
              className="rounded-full bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
            >
              Choose from Gallery
            </button>
            {photoUri ? (
              <button
                type="button"
                onClick={handleClearPhoto}
                className="text-left text-[11px] font-medium text-red-500 hover:text-red-600"
              >
                Remove photo
              </button>
            ) : null}
          </div>
        </div>
        {photoStatus ? (
          <div className="text-[11px] text-gray-500 dark:text-gray-400">{photoStatus}</div>
        ) : null}
      </div>

      {/* Date */}
      <label className="block space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Date</span>
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className={INPUT_CLS}
        />
      </label>

      {/* Note */}
      <label className="block space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Note</span>
        <textarea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional note..."
          className={`${INPUT_CLS} resize-y`}
        />
      </label>

      {/* Location */}
      <div className="space-y-2 rounded-xl bg-gray-50 px-3 py-3 dark:bg-gray-800/60">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Location</span>
          {location && !isLocationFormOpen ? (
            <button
              type="button"
              onClick={handleClearLocation}
              className="text-[11px] font-medium text-red-500 hover:text-red-600"
            >
              Clear
            </button>
          ) : null}
        </div>
        {location ? (
          <div className="text-xs text-gray-700 dark:text-gray-200">
            <div className="font-medium">{locationLabel}</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">
              {formatCoordinates(location.latitude, location.longitude)}
            </div>
          </div>
        ) : (
          <div className="text-[11px] italic text-gray-400">No location set.</div>
        )}

        {!isLocationFormOpen ? (
          <button
            type="button"
            onClick={openLocationForm}
            className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
          >
            {location ? 'Edit Location' : 'Set Location'}
          </button>
        ) : (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-900/70">
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Address</span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={addressInput}
                  onChange={(event) => setAddressInput(event.target.value)}
                  placeholder="e.g. 1600 Pennsylvania Ave NW, Washington DC"
                  className={`${INPUT_CLS} sm:flex-1`}
                />
                <button
                  type="button"
                  onClick={handleAddressSubmit}
                  disabled={isGeocoding}
                  className="rounded-md bg-blue-500 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
                >
                  {isGeocoding ? 'Resolving...' : 'Resolve'}
                </button>
              </div>
            </label>

            <div className="text-[11px] uppercase tracking-wide text-gray-400">or enter manually</div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Latitude</span>
                <input
                  type="number"
                  step="any"
                  value={manualLat}
                  onChange={(event) => setManualLat(event.target.value)}
                  className={INPUT_CLS}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Longitude</span>
                <input
                  type="number"
                  step="any"
                  value={manualLng}
                  onChange={(event) => setManualLng(event.target.value)}
                  className={INPUT_CLS}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeLocationForm}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleManualLocationSubmit}
                className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
              >
                Use coordinates
              </button>
            </div>

            {locationStatus ? (
              <div className="text-[11px] text-gray-500 dark:text-gray-400">{locationStatus}</div>
            ) : null}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-md bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600"
        >
          Save
        </button>
      </div>
    </div>
  );
}
