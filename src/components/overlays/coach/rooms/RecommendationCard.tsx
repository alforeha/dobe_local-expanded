interface RecommendationCardProps {
  name: string;
  owned: boolean;
  tab: string;
}

export function RecommendationCard({ name, owned, tab: _tab }: RecommendationCardProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <p className="text-sm text-gray-900 dark:text-gray-100">{name}</p>
        {owned && (
          <span className="text-xs text-green-600 dark:text-green-400">✓ Already owned</span>
        )}
      </div>
      <button
        type="button"
        className="text-xs text-red-400 hover:text-red-600"
      >
        Remove
      </button>
    </div>
  );
}
