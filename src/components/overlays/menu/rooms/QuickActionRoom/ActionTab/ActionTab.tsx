import { GTDSection } from './GTDSection';
import { FavouritesSection } from './FavouritesSection';

export function ActionTab() {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      <GTDSection />
      <FavouritesSection />
    </div>
  );
}
