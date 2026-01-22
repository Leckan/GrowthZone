import React, { useState } from 'react';
import { LessonFormData } from '../types';

interface LessonFormProps {
  initialData?: Partial<LessonFormData>;
  onSubmit: (data: LessonFormData) => Promise<boolean>;
  onCancel?: () => void;
  isLoading?: boolean;
  submitLabel?: string;
}

export function LessonForm({
  initialData = {},
  onSubmit,
  onCancel,
  isLoading = false,
  submitLabel = 'Create Lesson',
}: LessonFormProps) {
  const [formData, setFormData] = useState<LessonFormData>({
    title: initialData.title || '',
    content: initialData.content || '',
    contentType: initialData.contentType || 'text',
    videoUrl: initialData.videoUrl || '',
    fileUrl: initialData.fileUrl || '',
    isFree: initialData.isFree ?? true,
  });
  const [error, setError] = useState('');

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.title.trim()) {
      setError('Lesson title is required');
      return;
    }

    if (formData.title.length < 3) {
      setError('Lesson title must be at least 3 characters long');
      return;
    }

    if (formData.contentType === 'video' && !formData.videoUrl?.trim()) {
      setError('Video URL is required for video lessons');
      return;
    }

    if (formData.contentType === 'file' && !formData.fileUrl?.trim()) {
      setError('File URL is required for file lessons');
      return;
    }

    try {
      const success = await onSubmit(formData);
      if (!success) {
        setError('Failed to save lesson. Please try again.');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700">
          Lesson Title *
        </label>
        <input
          type="text"
          id="title"
          name="title"
          required
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          value={formData.title}
          onChange={handleChange}
          placeholder="Enter lesson title"
        />
      </div>

      <div>
        <label htmlFor="contentType" className="block text-sm font-medium text-gray-700">
          Content Type *
        </label>
        <select
          id="contentType"
          name="contentType"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          value={formData.contentType}
          onChange={handleChange}
        >
          <option value="text">Text Content</option>
          <option value="video">Video</option>
          <option value="file">File/Document</option>
        </select>
      </div>

      {formData.contentType === 'text' && (
        <div>
          <label htmlFor="content" className="block text-sm font-medium text-gray-700">
            Content
          </label>
          <textarea
            id="content"
            name="content"
            rows={8}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            value={formData.content}
            onChange={handleChange}
            placeholder="Enter your lesson content..."
          />
        </div>
      )}

      {formData.contentType === 'video' && (
        <div>
          <label htmlFor="videoUrl" className="block text-sm font-medium text-gray-700">
            Video URL *
          </label>
          <input
            type="url"
            id="videoUrl"
            name="videoUrl"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            value={formData.videoUrl}
            onChange={handleChange}
            placeholder="https://example.com/video.mp4"
          />
          <p className="mt-1 text-sm text-gray-500">
            Enter a direct video URL or embed URL (YouTube, Vimeo, etc.)
          </p>
        </div>
      )}

      {formData.contentType === 'file' && (
        <div>
          <label htmlFor="fileUrl" className="block text-sm font-medium text-gray-700">
            File URL *
          </label>
          <input
            type="url"
            id="fileUrl"
            name="fileUrl"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            value={formData.fileUrl}
            onChange={handleChange}
            placeholder="https://example.com/document.pdf"
          />
          <p className="mt-1 text-sm text-gray-500">
            Enter a URL to a downloadable file (PDF, document, etc.)
          </p>
        </div>
      )}

      <div className="flex items-center">
        <input
          id="isFree"
          name="isFree"
          type="checkbox"
          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
          checked={formData.isFree}
          onChange={handleChange}
        />
        <label htmlFor="isFree" className="ml-2 block text-sm text-gray-900">
          Free lesson (accessible to all members)
        </label>
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