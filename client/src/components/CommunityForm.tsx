import React, { useState } from 'react';
import { CommunityFormData } from '../types';

interface CommunityFormProps {
  initialData?: Partial<CommunityFormData>;
  onSubmit: (data: CommunityFormData) => Promise<boolean>;
  onCancel?: () => void;
  isLoading?: boolean;
  submitLabel?: string;
}

export function CommunityForm({
  initialData = {},
  onSubmit,
  onCancel,
  isLoading = false,
  submitLabel = 'Create Community',
}: CommunityFormProps) {
  const [formData, setFormData] = useState<CommunityFormData>({
    name: initialData.name || '',
    description: initialData.description || '',
    isPublic: initialData.isPublic ?? true,
    requiresApproval: initialData.requiresApproval ?? false,
    priceMonthly: initialData.priceMonthly || undefined,
    priceYearly: initialData.priceYearly || undefined,
  });
  const [error, setError] = useState('');

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else if (type === 'number') {
      const numValue = value === '' ? undefined : parseFloat(value);
      setFormData(prev => ({ ...prev, [name]: numValue }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.name.trim()) {
      setError('Community name is required');
      return;
    }

    if (formData.name.length < 3) {
      setError('Community name must be at least 3 characters long');
      return;
    }

    try {
      const success = await onSubmit(formData);
      if (!success) {
        setError('Failed to save community. Please try again.');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Community Name *
        </label>
        <input
          type="text"
          id="name"
          name="name"
          required
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          value={formData.name}
          onChange={handleChange}
          placeholder="Enter community name"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          value={formData.description}
          onChange={handleChange}
          placeholder="Describe your community..."
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center">
          <input
            id="isPublic"
            name="isPublic"
            type="checkbox"
            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            checked={formData.isPublic}
            onChange={handleChange}
          />
          <label htmlFor="isPublic" className="ml-2 block text-sm text-gray-900">
            Public community (visible to everyone)
          </label>
        </div>

        <div className="flex items-center">
          <input
            id="requiresApproval"
            name="requiresApproval"
            type="checkbox"
            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            checked={formData.requiresApproval}
            onChange={handleChange}
          />
          <label htmlFor="requiresApproval" className="ml-2 block text-sm text-gray-900">
            Require approval for new members
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="priceMonthly" className="block text-sm font-medium text-gray-700">
            Monthly Price ($)
          </label>
          <input
            type="number"
            id="priceMonthly"
            name="priceMonthly"
            min="0"
            step="0.01"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            value={formData.priceMonthly || ''}
            onChange={handleChange}
            placeholder="0.00"
          />
        </div>

        <div>
          <label htmlFor="priceYearly" className="block text-sm font-medium text-gray-700">
            Yearly Price ($)
          </label>
          <input
            type="number"
            id="priceYearly"
            name="priceYearly"
            min="0"
            step="0.01"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            value={formData.priceYearly || ''}
            onChange={handleChange}
            placeholder="0.00"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      <div className="flex justify-end space-x-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}