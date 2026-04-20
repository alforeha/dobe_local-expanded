import type { Act } from '../../../../../types';
import { ActBlock } from './ActBlock';

interface GoalRoomBodyProps {
  acts: Act[];
  onEdit: (act: Act) => void;
}

export function GoalRoomBody({ acts, onEdit }: GoalRoomBodyProps) {
  if (acts.length === 0) {
    return (
      <p className="text-center text-gray-400 text-sm py-10">No goals here yet.</p>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      {acts.map((act) => (
        <ActBlock key={act.id} act={act} onEdit={onEdit} />
      ))}
    </div>
  );
}
