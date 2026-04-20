import { useState } from 'react';
import { QuickActionRoomHeader } from './QuickActionRoomHeader';
import { ActionTab } from './ActionTab/ActionTab';
import { ShoppingTab } from './ShoppingTab/ShoppingTab';

type QATab = 'action' | 'shopping';

export function QuickActionRoom() {
  const [tab, setTab] = useState<QATab>('action');

  return (
    <div className="flex flex-col h-full">
      <QuickActionRoomHeader activeTab={tab} onTabChange={setTab} />
      {tab === 'action' ? <ActionTab /> : <ShoppingTab />}
    </div>
  );
}
