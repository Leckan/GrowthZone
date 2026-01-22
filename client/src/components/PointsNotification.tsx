import React, { useState, useEffect } from 'react';
import { useSocket } from '../contexts/SocketContext';

interface PointsAward {
  points: number;
  reason: string;
  communityId: string;
  timestamp: string;
}

export function PointsNotification() {
  const [pointsAwards, setPointsAwards] = useState<(PointsAward & { id: string; show: boolean })[]>([]);
  const { on, off } = useSocket();

  useEffect(() => {
    const handlePointsAwarded = (data: PointsAward) => {
      const awardWithId = {
        ...data,
        id: `${Date.now()}-${Math.random()}`,
        show: true
      };

      setPointsAwards(prev => [...prev, awardWithId]);

      // Auto-hide after 4 seconds
      setTimeout(() => {
        setPointsAwards(prev => 
          prev.map(award => 
            award.id === awardWithId.id ? { ...award, show: false } : award
          )
        );
      }, 4000);

      // Remove from array after animation
      setTimeout(() => {
        setPointsAwards(prev => 
          prev.filter(award => award.id !== awardWithId.id)
        );
      }, 4500);
    };

    on('user:points_awarded', handlePointsAwarded);

    return () => {
      off('user:points_awarded', handlePointsAwarded);
    };
  }, [on, off]);

  const getPointsIcon = (reason: string) => {
    if (reason.includes('post')) return '📝';
    if (reason.includes('comment')) return '💬';
    if (reason.includes('like')) return '👍';
    if (reason.includes('lesson')) return '📚';
    if (reason.includes('community')) return '🏠';
    return '⭐';
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {pointsAwards.map((award) => (
        <div
          key={award.id}
          className={`
            transform transition-all duration-500 ease-in-out
            ${award.show 
              ? 'translate-y-0 opacity-100 scale-100' 
              : 'translate-y-2 opacity-0 scale-95'
            }
          `}
        >
          <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-lg shadow-lg p-4 max-w-sm">
            <div className="flex items-center space-x-3">
              <div className="text-2xl">
                {getPointsIcon(award.reason)}
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <span className="text-lg font-bold">+{award.points}</span>
                  <span className="text-sm opacity-90">points</span>
                </div>
                <p className="text-sm opacity-90 mt-1">
                  {award.reason}
                </p>
              </div>
              <div className="text-xl">
                🎉
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}