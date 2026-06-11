// ─────────────────────────────────────────
// Gastro Hub tab — Food Core · Cook Book · Meal Plan (A4).
// Each section renders inside the shared Habitat shell.
// ─────────────────────────────────────────

import { FoodCoreView } from './GastroHub/FoodCoreView';
import { CookBookView } from './GastroHub/CookBookView';
import { MealPlanView } from './GastroHub/MealPlanView';

type GastroHubTabValue = 'foodcore' | 'cookbook' | 'mealplan';

interface GastroHubTabProps {
  activeTab: GastroHubTabValue;
  onExpandedChange?: (isExpanded: boolean) => void;
}

export function GastroHubTab({ activeTab, onExpandedChange }: GastroHubTabProps) {
  if (activeTab === 'foodcore') {
    return <FoodCoreView onExpandedChange={onExpandedChange} />;
  }

  if (activeTab === 'cookbook') {
    return <CookBookView onExpandedChange={onExpandedChange} />;
  }

  return <MealPlanView />;
}
