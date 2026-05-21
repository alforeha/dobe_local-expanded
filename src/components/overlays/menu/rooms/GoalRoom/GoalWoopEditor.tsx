import { useEffect, useState } from 'react';
import type { Woop } from '../../../../../types';
import { IconPicker } from '../../../../shared/IconPicker';

interface GoalWoopEditorProps {
  woop: Woop;
  onSave: (updated: Woop) => void;
  onCancel: () => void;
  onDraftChange: (draft: Woop) => void;
  onDraftClear: () => void;
}

export function GoalWoopEditor({ woop, onSave, onCancel, onDraftChange, onDraftClear }: GoalWoopEditorProps) {
  const [name, setName] = useState(woop.name);
  const [wish, setWish] = useState(woop.wish);
  const [outcome, setOutcome] = useState<string[]>(woop.outcome);
  const [obstacle, setObstacle] = useState<string[]>(woop.obstacle);
  const [icon, setIcon] = useState(woop.icon);

  useEffect(() => {
    return () => onDraftClear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onDraftChange({ ...woop, name, wish, outcome, obstacle, icon });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-white/30 text-xs uppercase tracking-wider">Name</label>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              onDraftChange({ ...woop, name: e.target.value, wish, outcome, obstacle, icon });
            }}
            placeholder="Name this WOOP"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-white/30 text-xs uppercase tracking-wider">Icon</label>
          <IconPicker
            value={icon}
            onChange={(key) => {
              setIcon(key);
              onDraftChange({ ...woop, name, wish, outcome, obstacle, icon: key });
            }}
            align="left"
            forceUpward
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-white/30 text-xs uppercase tracking-wider">Wish</label>
        <input
          value={wish}
          onChange={(e) => {
            setWish(e.target.value);
            onDraftChange({ ...woop, name, wish: e.target.value, outcome, obstacle, icon });
          }}
          placeholder="What do you wish for?"
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-white/30 text-xs uppercase tracking-wider">Outcome</label>
        {outcome.map((o, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={o}
              onChange={(e) => {
                const next = [...outcome];
                next[i] = e.target.value;
                setOutcome(next);
                onDraftChange({ ...woop, name, wish, outcome: next, obstacle, icon });
              }}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
              placeholder={`Outcome ${i + 1}`}
            />
            <button
              onClick={() => {
                const next = outcome.filter((_, j) => j !== i);
                setOutcome(next);
                onDraftChange({ ...woop, name, wish, outcome: next, obstacle, icon });
              }}
              className="text-white/20 hover:text-red-400/60 text-xs px-2"
            >
              x
            </button>
          </div>
        ))}
        <button
          onClick={() => {
            const next = [...outcome, ''];
            setOutcome(next);
            onDraftChange({ ...woop, name, wish, outcome: next, obstacle, icon });
          }}
          className="text-white/30 text-xs hover:text-white/50 text-left mt-1"
        >
          + Add outcome
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-white/30 text-xs uppercase tracking-wider">Obstacle</label>
        {obstacle.map((o, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={o}
              onChange={(e) => {
                const next = [...obstacle];
                next[i] = e.target.value;
                setObstacle(next);
                onDraftChange({ ...woop, name, wish, outcome, obstacle: next, icon });
              }}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
              placeholder={`Obstacle ${i + 1}`}
            />
            <button
              onClick={() => {
                const next = obstacle.filter((_, j) => j !== i);
                setObstacle(next);
                onDraftChange({ ...woop, name, wish, outcome, obstacle: next, icon });
              }}
              className="text-white/20 hover:text-red-400/60 text-xs px-2"
            >
              x
            </button>
          </div>
        ))}
        <button
          onClick={() => {
            const next = [...obstacle, ''];
            setObstacle(next);
            onDraftChange({ ...woop, name, wish, outcome, obstacle: next, icon });
          }}
          className="text-white/30 text-xs hover:text-white/50 text-left mt-1"
        >
          + Add obstacle
        </button>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={() => {
            onDraftClear();
            onCancel();
          }}
          className="flex-1 py-2 rounded-lg border border-white/10 text-white/40 text-sm hover:text-white/60"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave({ ...woop, name, wish, outcome, obstacle, icon })}
          disabled={!wish.trim()}
          className="flex-1 py-2 rounded-lg bg-indigo-600/60 text-white/90 text-sm hover:bg-indigo-600/80 disabled:opacity-30"
        >
          Save
        </button>
      </div>
    </div>
  );
}
