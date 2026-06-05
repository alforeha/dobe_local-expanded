import { useEffect, useState } from 'react';
import { useUserStore } from '../../../stores/useUserStore';
import { autoCompleteSystemTask } from '../../../engine/resourceEngine';
import { CoachOverlayHeader } from './CoachOverlayHeader';
import { CoachOverlayFooter } from './CoachOverlayFooter';
import { FeedRoom } from './rooms/FeedRoom';
import { ControlCenterRoom } from './rooms/ControlCenterRoom';
import { AboutPopup } from './AboutPopup';

export type CoachRoom = 'feed' | 'controlcenter' | 'track' | 'review';

interface CoachOverlayProps {
  onClose: () => void;
}

export function CoachOverlay({ onClose }: CoachOverlayProps) {
  const unreadCount = useUserStore(
    (s) => s.user?.feed.entries.filter((e) => !e.read).length ?? 0,
  );

  const [activeRoom, setActiveRoom] = useState<CoachRoom>('controlcenter');
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    autoCompleteSystemTask('task-sys-explore-coach');
  }, []);

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-900">
      <CoachOverlayHeader
        onAbout={() => setAboutOpen(true)}
        onFeedNav={() => setActiveRoom('feed')}
        unreadCount={unreadCount}
      />

      <div className="flex-1 overflow-hidden">
        {activeRoom === 'feed' && <FeedRoom />}
        {activeRoom === 'controlcenter' && <ControlCenterRoom />}
        {activeRoom === 'track' && (
          <div className="flex h-full items-center justify-center p-6 text-sm text-gray-500 dark:text-gray-400">
            Track placeholder
          </div>
        )}
        {activeRoom === 'review' && (
          <div className="flex h-full items-center justify-center p-6 text-sm text-gray-500 dark:text-gray-400">
            Review placeholder
          </div>
        )}
      </div>

      <CoachOverlayFooter activeRoom={activeRoom} onNav={setActiveRoom} onClose={onClose} />

      {aboutOpen && <AboutPopup onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
