import { useState } from 'react';
import type { Act } from '../../../../../types';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { ChainPopup } from './ChainPopup';

interface ActBlockExpandedProps {
  act: Act;
}

export function ActBlockExpanded({ act }: ActBlockExpandedProps) {
  const [openChainIdx, setOpenChainIdx] = useState<number | null>(null);

  if (act.chains.length === 0) {
    return <p className="text-xs text-gray-400 px-3 pb-3">No chains yet.</p>;
  }

  return (
    <div className="px-3 pb-3 space-y-1">
      {act.chains.map((chain, i) => (
        <button
          key={i}
          type="button"
          onClick={() => setOpenChainIdx(i)}
          className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600"
        >
          <IconDisplay iconKey={chain.icon} size={16} className="h-4 w-4 shrink-0 object-contain" alt="" />
          <span className="flex-1 text-sm text-gray-700 dark:text-gray-100 truncate">
            {chain.name}
          </span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
              chain.completionState === 'complete'
                ? 'bg-green-100 text-green-600'
                : chain.completionState === 'failed'
                  ? 'bg-red-100 text-red-600'
                : 'bg-blue-100 text-blue-600'
            }`}
          >
            {chain.completionState === 'failed' ? 'skipped' : chain.completionState}
          </span>
        </button>
      ))}
      {openChainIdx !== null && act.chains[openChainIdx] !== undefined && (
        <ChainPopup
          chain={act.chains[openChainIdx]}
          chainIndex={openChainIdx}
          act={act}
          onClose={() => setOpenChainIdx(null)}
        />
      )}
    </div>
  );
}
