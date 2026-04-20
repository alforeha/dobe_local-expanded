import { useState } from 'react';
import type { Act } from '../../../../../types';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { ActBlockExpanded } from './ActBlockExpanded';

interface ActBlockProps {
  act: Act;
  onEdit: (act: Act) => void;
}

export function ActBlock({ act, onEdit }: ActBlockProps) {
  const [expanded, setExpanded] = useState(act.completionState === 'active');

  const isAdventure = act.habitat === 'adventures';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex-1 flex items-center gap-3 min-w-0 text-left hover:opacity-80 transition-opacity"
        >
          <IconDisplay iconKey={act.icon} size={20} className="h-5 w-5 shrink-0 object-contain" alt="" />
          <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
            {act.name}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
              act.completionState === 'complete'
                ? 'bg-green-100 text-green-600'
                : 'bg-blue-100 text-blue-600'
            }`}
          >
            {act.completionState}
          </span>
          <span className="text-gray-400 text-xs shrink-0">{expanded ? '▲' : '▼'}</span>
        </button>
        {!isAdventure && (
          <button
            type="button"
            aria-label="Edit Act"
            onClick={() => onEdit(act)}
            className="shrink-0 text-xs text-gray-400 hover:text-blue-500 transition-colors px-1"
          >
            <IconDisplay iconKey="edit" size={14} className="h-3.5 w-3.5 object-contain" alt="" />
          </button>
        )}
      </div>
      {expanded && <ActBlockExpanded act={act} />}
    </div>
  );
}
