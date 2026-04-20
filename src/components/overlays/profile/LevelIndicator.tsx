interface LevelIndicatorProps {
  level: number;
}

export function LevelIndicator({ level }: LevelIndicatorProps) {
  return (
    <div className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white ring-2 ring-white">
      {level}
    </div>
  );
}
