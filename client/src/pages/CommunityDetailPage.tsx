import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Navigation } from '../components/Navigation';
import { MemberManagement } from '../components/MemberManagement';
import { useAuth } from '../contexts/AuthContext';
import { Community } from '../types';
import apiService from '../services/api';

export function CommunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [community, setCommunity] = useState<Community | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'feed' | 'members' | 'courses'>('overview');

  useEffect(() => {
    if (id) {
      loadCommunity();
      loadMembers();
    }
  }, [id]);

  const loadCommunity = async () => {
    if (!id) return;
    
    try {
      const response = await apiService.getCommunity(id);
      if (response.data) {
        setCommunity(response.data);
      } else {
        setError(response.error || 'Failed to load community');
      }
    } catch (err) {
      setError('An error occurred while loading the community');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMembers = async () => {
    // This would be a separate API call to get community members
    // For now, we'll use mock data
    setMembers([]);
  };

  const handleJoinCommunity = async () => {
    if (!id) return;
    
    try {
      const response = await apiService.joinCommunity(id);
      if (response.data) {
        await loadCommunity(); // Refresh community data
      } else {
        alert(response.error || 'Failed to join community');
      }
    } catch (err) {
      alert('An error occurred while joining the community');
    }
  };

  const handleLeaveCommunity = async () => {
    if (!id || !window.confirm('Are you sure you want to leave this community?')) return;
    
    try {
      const response = await apiService.leaveCommunity(id);
      if (response.data) {
        await loadCommunity(); // Refresh community data
      } else {
        alert(response.error || 'Failed to leave community');
      }
    } catch (err) {
      alert('An error occurred while leaving the community');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3 mb-8"></div>
            <div className="bg-white shadow rounded-lg p-6">
              <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !community) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              {error || 'Community not found'}
            </h1>
            <Link
              to="/communities"
              className="text-indigo-600 hover:text-indigo-500"
            >
              Back to Communities
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const formatPrice = (price?: number) => {
    if (!price) return 'Free';
    return `$${price.toFixed(2)}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900">{community.name}</h1>
              {community.description && (
                <p className="mt-2 text-gray-600">{community.description}</p>
              )}
              
              <div className="flex items-center space-x-4 mt-4 text-sm text-gray-500">
                <span>{community.memberCount} members</span>
                <span>•</span>
                <span>
                  {community.priceMonthly
                    ? `${formatPrice(community.priceMonthly)}/month`
                    : community.priceYearly
                    ? `${formatPrice(community.priceYearly)}/year`
                    : 'Free'}
                </span>
                <span>•</span>
                <span>{community.isPublic ? 'Public' : 'Private'}</span>
                {community.requiresApproval && (
                  <>
                    <span>•</span>
                    <span>Approval Required</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-3 ml-6">
              {user && (
                <>
                  <button
                    onClick={handleJoinCommunity}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Join Community
                  </button>
                  <button
                    onClick={handleLeaveCommunity}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Leave
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-8">
          <nav className="flex space-x-8">
            {['overview', 'feed', 'members', 'courses'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'overview' && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">About this Community</h2>
              <div className="prose max-w-none">
                {community.description ? (
                  <p>{community.description}</p>
                ) : (
                  <p className="text-gray-500 italic">No description available.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'feed' && (
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-gray-900">Community Feed</h2>
                <Link
                  to={`/communities/${community.id}/feed`}
                  className="text-indigo-600 hover:text-indigo-500 text-sm font-medium"
                >
                  View Full Feed →
                </Link>
              </div>
              <div className="text-center py-8 text-gray-500">
                <p className="mb-4">Join the conversation with your community members.</p>
                <Link
                  to={`/communities/${community.id}/feed`}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  Go to Feed
                </Link>
              </div>
            </div>
          )}

          {activeTab === 'members' && (
            <MemberManagement
              members={members}
              isLoading={false}
              currentUserRole="member" // This would come from the membership data
            />
          )}

          {activeTab === 'courses' && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Courses</h2>
              <div className="text-center py-8 text-gray-500">
                No courses available yet.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}