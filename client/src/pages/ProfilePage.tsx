import React from 'react';
import { ProfileForm } from '../components/ProfileForm';
import { Navigation } from '../components/Navigation';

export function ProfilePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="py-8 px-4 sm:px-6 lg:px-8">
        <ProfileForm />
      </div>
    </div>
  );
}