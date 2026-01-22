import React from 'react';
import { Link } from 'react-router-dom';
import { Community } from '../types';

interface CommunityListProps {
  communities: Community[];
  isLoading?: boolean;
  onJoinCommunity?: (communityId: string) => Promise<void>;
  showJoinButton?: boolean;
}

export function CommunityList({
  communities,
  isLoading = false,
  onJoinCommunity,
  showJoinButton = false,
}: CommunityListProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white shadow rounded-lg p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-3/4 mb-4"></div>
            <div className="flex justify-between items-center">
              <div className="h-3 bg-gray-200 rounded w-1/6"></div>
              <div className="h-8 bg-gray-200 rounded w-20"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (communities.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 text-lg mb-4">No communities found</div>
        <p className="text-gray-400">
          {showJoinButton
            ? 'Try adjusting your search criteria or browse different categories.'
            : 'Create your first community to get started.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {communities.map((community) => (
        <CommunityCard
          key={community.id}
          community={community}
          onJoinCommunity={onJoinCommunity}
          showJoinButton={showJoinButton}
        />
      ))}
    </div>
  );
}

interface CommunityCardProps {
  community: Community;
  onJoinCommunity?: (communityId: string) => Promise<void>;
  showJoinButton?: boolean;
}

function CommunityCard({ community, onJoinCommunity, showJoinButton }: CommunityCardProps) {
  const [isJoining, setIsJoining] = React.useState(false);

  const handleJoin = async () => {
    if (!onJoinCommunity) return;
    
    setIsJoining(true);
    try {
      await onJoinCommunity(community.id);
    } finally {
      setIsJoining(false);
    }
  };

  const formatPrice = (price?: number) => {
    if (!price) return 'Free';
    return `$${price.toFixed(2)}`;
  };

  return (
    <div className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <Link
            to={`/communities/${community.id}`}
            className="text-xl font-semibold text-gray-900 hover:text-indigo-600"
          >
            {community.name}
          </Link>
          {community.description && (
            <p className="text-gray-600 mt-2 line-clamp-2">{community.description}</p>
          )}
        </div>
        
        <div className="flex items-center space-x-2 ml-4">
          {!community.isPublic && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
              Private
            </span>
          )}
          {community.requiresApproval && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              Approval Required
            </span>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4 text-sm text-gray-500">
          <span>{community.memberCount} members</span>
          <span>•</span>
          <span>
            {community.priceMonthly
              ? `${formatPrice(community.priceMonthly)}/month`
              : community.priceYearly
              ? `${formatPrice(community.priceYearly)}/year`
              : 'Free'}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <Link
            to={`/communities/${community.id}`}
            className="text-indigo-600 hover:text-indigo-500 text-sm font-medium"
          >
            View Details
          </Link>
          
          {showJoinButton && onJoinCommunity && (
            <button
              onClick={handleJoin}
              disabled={isJoining}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isJoining ? 'Joining...' : 'Join'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}