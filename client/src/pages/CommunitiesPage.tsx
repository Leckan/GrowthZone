import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Navigation } from '../components/Navigation';
import { CommunityList } from '../components/CommunityList';
import { useAuth } from '../contexts/AuthContext';
import { Community } from '../types';
import apiService from '../services/api';

export function CommunitiesPage() {
  const { isAuthenticated } = useAuth();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadCommunities();
  }, []);

  const loadCommunities = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const response = await apiService.getCommunities();
      if (response.data) {
        setCommunities(response.data);
      } else {
        setError(response.error || 'Failed to load communities');
      }
    } catch (err) {
      setError('An error occurred while loading communities');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinCommunity = async (communityId: string) => {
    try {
      const response = await apiService.joinCommunity(communityId);
      if (response.data) {
        // Refresh communities list to update member count
        await loadCommunities();
      } else {
        alert(response.error || 'Failed to join community');
      }
    } catch (err) {
      alert('An error occurred while joining the community');
    }
  };

  const filteredCommunities = communities.filter((community) =>
    community.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    community.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Communities</h1>
              <p className="mt-2 text-gray-600">
                Discover and join learning communities that match your interests
              </p>
            </div>
            
            {isAuthenticated && (
              <Link
                to="/communities/create"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Create Community
              </Link>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="max-w-md">
            <label htmlFor="search" className="sr-only">
              Search communities
            </label>
            <input
              type="text"
              id="search"
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="Search communities..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}

        {/* Communities List */}
        <CommunityList
          communities={filteredCommunities}
          isLoading={isLoading}
          onJoinCommunity={isAuthenticated ? handleJoinCommunity : undefined}
          showJoinButton={isAuthenticated}
        />

        {/* Empty State for Non-Authenticated Users */}
        {!isAuthenticated && !isLoading && (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Join the Community
            </h3>
            <p className="text-gray-600 mb-6">
              Sign up to join communities and start learning with others.
            </p>
            <div className="space-x-4">
              <Link
                to="/register"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
              >
                Sign Up
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Log In
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}