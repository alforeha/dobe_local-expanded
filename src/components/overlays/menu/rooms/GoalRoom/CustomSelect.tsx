import { useEffect, useRef, useState } from 'react';

interface CustomSelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
}

export function CustomSelect({ value, onChange, options, placeholder }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        onClick={() => {
          setOpen((p) => !p);
          if (!open && triggerRef.current) {
            setTimeout(() => {
              triggerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 50);
          }
        }}
        className="w-full flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-white/25 text-left"
      >
        <span className={selected ? 'text-white/80' : 'text-white/30'}>
          {selected?.label ?? placeholder ?? 'Select...'}
        </span>
        <span className="text-white/30 text-xs ml-2">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-gray-900 border border-white/10 rounded-lg overflow-hidden z-20 max-h-48 overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full px-3 py-2.5 text-left text-sm hover:bg-white/5 transition-colors
                ${opt.value === value ? 'text-white' : 'text-white/60'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
