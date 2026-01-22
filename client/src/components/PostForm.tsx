import React, { useState } from 'react';
import { PostFormData } from '../types';

interface PostFormProps {
  initialData?: Partial<PostFormData>;
  onSubmit: (data: PostFormData) => Promise<boolean>;
  onCancel?: () => void;
  isLoading?: boolean;
  submitLabel?: string;
  showTypeSelector?: boolean;
}

export function PostForm({
  initialData = {},
  onSubmit,
  onCancel,
  isLoading = false,
  submitLabel = 'Create Post',
  showTypeSelector = true,
}: PostFormProps) {
  const [formData, setFormData] = useState<PostFormData>({
    title: initialData.title || '',
    content: initialData.content || '',
    postType: initialData.postType || 'discussion',
  });
  const [error, setError] = useState('');

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.content.trim()) {
      setError('Post content is required');
      return;
    }

    if (formData.content.length < 10) {
      setError('Post content must be at least 10 characters long');
      return;
    }

    if (formData.postType === 'announcement' && !formData.title?.trim()) {
      setError('Title is required for announcements');
      return;
    }

    try {
      const success = await onSubmit(formData);
      if (!success) {
        setError('Failed to create post. Please try again.');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {showTypeSelector && (
        <div>
          <label htmlFor="postType" className="block text-sm font-medium text-gray-700 mb-1">
            Post Type
          </label>
          <select
            id="postType"
            name="postType"
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            value={formData.postType}
            onChange={handleChange}
          >
            <option value="discussion">Discussion</option>
            <option value="announcement">Announcement</option>
          </select>
        </div>
      )}

      {(formData.postType === 'announcement' || formData.title) && (
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Title {formData.postType === 'announcement' && '*'}
          </label>
          <input
            type="text"
            id="title"
            name="title"
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            value={formData.title}
            onChange={handleChange}
            placeholder="Enter post title..."
          />
        </div>
      )}

      <div>
        <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-1">
          Content *
        </label>
        <textarea
          id="content"
          name="content"
          rows={6}
          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          value={formData.content}
          onChange={handleChange}
          placeholder="What's on your mind?"
        />
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
          {isLoading ? 'Posting...' : submitLabel}
        </button>
      </div>
    </form>
  );
}