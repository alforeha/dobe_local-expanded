interface NumberInputProps {
  value: number | '';
  onChange: (value: number | '') => void;
  placeholder?: string;
  label?: string;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
}

export function NumberInput({
  value,
  onChange,
  placeholder,
  label,
  className = '',
  min,
  max,
  step,
}: NumberInputProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
      />
    </div>
  );
}
