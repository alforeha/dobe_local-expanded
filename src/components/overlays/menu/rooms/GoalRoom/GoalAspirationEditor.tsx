import { useState } from 'react';
import type { Aspiration } from '../../../../../types';
import { IconPicker } from '../../../../shared/IconPicker';

interface GoalAspirationEditorProps {
  aspiration: Aspiration;
  onSave: (updated: Aspiration) => void;
  onCancel: () => void;
  onLiveUpdate: (updated: Aspiration) => void;
}

export function GoalAspirationEditor({ aspiration, onSave, onCancel, onLiveUpdate }: GoalAspirationEditorProps) {
  const [name, setName] = useState(aspiration.name);
  const [description, setDescription] = useState(aspiration.description);
  const [icon, setIcon] = useState(aspiration.icon);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-white/30 text-xs uppercase tracking-wider">Name</label>
          <input
            value={name}
            onChange={(e) => {
              const updated = { ...aspiration, name: e.target.value };
              setName(e.target.value);
              onLiveUpdate(updated);
            }}
            placeholder="What are you reaching for?"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-white/30 text-xs uppercase tracking-wider">Icon</label>
          <IconPicker
            value={icon}
            onChange={(key) => {
              const updated = { ...aspiration, icon: key };
              setIcon(key);
              onLiveUpdate(updated);
            }}
            align="left"
            forceUpward
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-white/30 text-xs uppercase tracking-wider">Description</label>
        <textarea
          value={description}
          onChange={(e) => {
            const updated = { ...aspiration, description: e.target.value };
            setDescription(e.target.value);
            onLiveUpdate(updated);
          }}
          placeholder="Why does this matter?"
          rows={3}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-white/25 resize-none"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2 rounded-lg border border-white/10 text-white/40 text-sm hover:text-white/60"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave({ ...aspiration, name, description, icon })}
          disabled={!name.trim()}
          className="flex-1 py-2 rounded-lg bg-indigo-600/60 text-white/90 text-sm hover:bg-indigo-600/80 disabled:opacity-30"
        >
          Save
        </button>
      </div>
    </div>
  );
}
