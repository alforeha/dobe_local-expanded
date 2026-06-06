type PowerBayTabValue = 'exercises' | 'workoutplan';

interface PowerBayTabProps {
  activeTab: PowerBayTabValue;
}

export function PowerBayTab({ activeTab }: PowerBayTabProps) {
  if (activeTab === 'exercises') {
    return <div className="px-4 py-4 text-sm text-gray-700 dark:text-gray-200">Exercises</div>;
  }

  return <div className="px-4 py-4 text-sm text-gray-700 dark:text-gray-200">Workout Plan</div>;
}