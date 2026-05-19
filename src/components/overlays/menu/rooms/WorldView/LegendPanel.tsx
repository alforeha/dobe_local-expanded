import { useState } from 'react';

interface LegendPanelProps {
  onClose: () => void;
}

const MAP_FEATURES = [
  {
    label: 'Event Pin',
    description: 'A scheduled or planned event with a location',
    color: '#2563eb',
  },
  {
    label: 'Location Point',
    description: 'A captured location point from a task',
    color: '#7c3aed',
  },
  {
    label: 'Location Trail',
    description: 'A tracked route with a flag at the start',
    color: '#7c3aed',
  },
  {
    label: 'Album Pin',
    description: 'A photo entry with a saved location',
    color: '#0f172a',
  },
];

export function LegendPanel({ onClose }: LegendPanelProps) {
  const [tab, setTab] = useState<'key' | 'credits'>('key');

  return (
    <aside className="cdb-world-legend-panel">
      <div className="cdb-world-filter-body">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab('key')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                tab === 'key'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              Map Key
            </button>
            <button
              type="button"
              onClick={() => setTab('credits')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                tab === 'credits'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              Credits
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close legend"
            className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            &#x00D7;
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          {tab === 'key' && (
            <div className="space-y-3">
              {MAP_FEATURES.map((feature) => (
                <div key={feature.label} className="flex items-start gap-3">
                  <div
                    className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-white shadow"
                    style={{ background: feature.color }}
                  />
                  <div>
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                      {feature.label}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
              <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700">
                <p className="mb-1 text-xs font-semibold text-gray-700 dark:text-gray-200">Map Symbols</p>
                <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                  Symbols and colors vary by zoom level.
                </p>
                <a
                  href="https://wiki.openstreetmap.org/wiki/OpenStreetMap_Carto/Key"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-500 underline"
                >
                  View full map key &rarr;
                </a>
              </div>
            </div>
          )}

          {tab === 'credits' && (
            <div className="space-y-3 text-xs text-gray-600 dark:text-gray-300">
              <p className="font-semibold text-gray-800 dark:text-gray-100">Map Data</p>
              <p>
                Map data &copy;{' '}
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 underline"
                >
                  OpenStreetMap contributors
                </a>
              </p>
              <p className="font-semibold text-gray-800 dark:text-gray-100">Tiles</p>
              <p>
                Tiles &copy;{' '}
                <a
                  href="https://www.openstreetmap.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 underline"
                >
                  OpenStreetMap
                </a>{' '}
                via Leaflet
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
