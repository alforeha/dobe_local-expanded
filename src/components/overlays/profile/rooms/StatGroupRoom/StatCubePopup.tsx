/** BUILD-TIME STUB: StatCubePopup — shows tasks completed on a given day */
interface StatCubePopupProps {
  date: string;
  stat: string;
  onClose: () => void;
}

export function StatCubePopup({ date, stat, onClose }: StatCubePopupProps) {
  return (
    <div className="absolute z-10 rounded-lg bg-white dark:bg-gray-800 p-3 shadow-lg text-xs min-w-[140px]">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-gray-700">{stat} · {date}</span>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
      </div>
      <p className="text-gray-400">Task history — BUILD-time</p>
    </div>
  );
}
