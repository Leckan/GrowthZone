import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Navigation } from '../components/Navigation';
import { CommunityForm } from '../components/CommunityForm';
import { CommunityFormData } from '../types';
import apiService from '../services/api';
import { slugify } from '../utils/slugify';

export function CreateCommunityPage() {
  const navigate = useNavigate();

  const handleSubmit = async (data: CommunityFormData): Promise<boolean> => {
    try {
      // Generate slug from community name
      const slug = slugify(data.name);

      const communityData = {
        ...data,
        slug
      };

      const response = await apiService.createCommunity(communityData);
      if (response.data) {
        navigate(`/communities/${response.data.id}`);
        return true;
      } else {
        console.error('Failed to create community:', response.error);
        return false;
      }
    } catch (error) {
      console.error('Error creating community:', error);
      return false;
    }
  };

  const handleCancel = () => {
    navigate('/communities');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Create New Community</h1>
          <p className="mt-2 text-gray-600">
            Set up your learning community and start building your audience.
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <CommunityForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            submitLabel="Create Community"
          />
        </div>
      </div>
    </div>
  );
}