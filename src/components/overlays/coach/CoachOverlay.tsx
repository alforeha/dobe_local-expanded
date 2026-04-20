import { useEffect, useState } from 'react';
import { useUserStore } from '../../../stores/useUserStore';
import { autoCompleteSystemTask } from '../../../engine/resourceEngine';
import { CoachOverlayHeader } from './CoachOverlayHeader';
import { CoachOverlayFooter } from './CoachOverlayFooter';
import { FeedRoom } from './rooms/FeedRoom';
import { RecommendationsRoom } from './rooms/RecommendationsRoom';
import { ReviewingRoom } from './rooms/ReviewingRoom';
import { TrackingRoom } from './rooms/TrackingRoom';
import { LeaderboardRoom } from './rooms/LeaderboardRoom';
import { AboutPopup } from './AboutPopup';

export type CoachRoom = 'feed' | 'recommendations' | 'reviewing' | 'tracking' | 'leaderboard';

interface CoachOverlayProps {
  onClose: () => void;
  onOpenEvent?: (eventId: string) => void;
  onNavigateToDayView?: (date: string) => void;
}

export function CoachOverlay({ onClose, onOpenEvent, onNavigateToDayView }: CoachOverlayProps) {
  const unreadCount = useUserStore(
    (s) => s.user?.feed.entries.filter((e) => !e.read).length ?? 0,
  );
  const userLevel = useUserStore((s) => s.user?.progression.stats.level ?? 0);

  const [activeRoom, setActiveRoom] = useState<CoachRoom>('recommendations');
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    autoCompleteSystemTask('task-sys-explore-coach');
  }, []);

  const handleOpenEvent = (eventId: string) => {
    onClose();
    onOpenEvent?.(eventId);
  };

  const handleNavigateToDayView = (date: string) => {
    onClose();
    onNavigateToDayView?.(date);
  };

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-900">
      <CoachOverlayHeader
        onAbout={() => setAboutOpen(true)}
        onFeedNav={() => setActiveRoom('feed')}
        unreadCount={unreadCount}
      />

      <div className="flex-1 overflow-hidden">
        {activeRoom === 'feed' && <FeedRoom />}
        {activeRoom === 'recommendations' && <RecommendationsRoom />}
        {activeRoom === 'reviewing' && (
          <ReviewingRoom
            onNavigateToDayView={handleNavigateToDayView}
            onOpenEvent={handleOpenEvent}
          />
        )}
        {activeRoom === 'tracking' && <TrackingRoom onOpenEvent={handleOpenEvent} />}
        {activeRoom === 'leaderboard' && <LeaderboardRoom />}
      </div>

      <CoachOverlayFooter
        activeRoom={activeRoom}
        onNav={setActiveRoom}
        userLevel={userLevel}
        onClose={onClose}
      />

      {aboutOpen && <AboutPopup onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
