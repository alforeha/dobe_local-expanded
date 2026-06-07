type GastroHubTabValue = 'foodcore' | 'cookbook' | 'mealplan';

interface GastroHubTabProps {
  activeTab: GastroHubTabValue;
  onExpandedChange?: (isExpanded: boolean) => void;
}

export function GastroHubTab({ activeTab }: GastroHubTabProps) {
  if (activeTab === 'foodcore') {
    return <div className="px-4 py-4 text-sm text-gray-700 dark:text-gray-200">Food Core</div>;
  }

  if (activeTab === 'cookbook') {
    return <div className="px-4 py-4 text-sm text-gray-700 dark:text-gray-200">Cook Book</div>;
  }

  return <div className="px-4 py-4 text-sm text-gray-700 dark:text-gray-200">Meal Plan</div>;
}