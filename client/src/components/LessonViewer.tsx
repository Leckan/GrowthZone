import React, { useState, useEffect } from 'react';
import { Lesson, UserProgress } from '../types';

interface LessonViewerProps {
  lesson: Lesson;
  progress?: UserProgress;
  onMarkComplete?: (lessonId: string) => Promise<void>;
  onUpdateProgress?: (lessonId: string, timeSpent: number) => Promise<void>;
  canAccess?: boolean;
}

export function LessonViewer({
  lesson,
  progress,
  onMarkComplete,
  onUpdateProgress,
  canAccess = true,
}: LessonViewerProps) {
  const [startTime] = useState(Date.now());
  const [isCompleting, setIsCompleting] = useState(false);

  useEffect(() => {
    // Track time spent when component unmounts
    return () => {
      if (onUpdateProgress && canAccess) {
        const timeSpent = Math.floor((Date.now() - startTime) / 1000);
        onUpdateProgress(lesson.id, timeSpent);
      }
    };
  }, [lesson.id, onUpdateProgress, startTime, canAccess]);

  const handleMarkComplete = async () => {
    if (!onMarkComplete) return;
    
    setIsCompleting(true);
    try {
      await onMarkComplete(lesson.id);
    } finally {
      setIsCompleting(false);
    }
  };

  const isCompleted = !!progress?.completedAt;

  if (!canAccess) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center py-12">
          <div className="text-gray-400 text-lg mb-4">🔒</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Premium Content
          </h3>
          <p className="text-gray-600 mb-6">
            This lesson is only available to premium members.
          </p>
          <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">
            Upgrade to Access
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{lesson.title}</h1>
            <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
              <span className="capitalize">{lesson.contentType} lesson</span>
              {lesson.isFree && (
                <>
                  <span>•</span>
                  <span className="text-green-600">Free</span>
                </>
              )}
              {isCompleted && (
                <>
                  <span>•</span>
                  <span className="text-green-600">✓ Completed</span>
                </>
              )}
            </div>
          </div>

          {onMarkComplete && !isCompleted && (
            <button
              onClick={handleMarkComplete}
              disabled={isCompleting}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCompleting ? 'Marking...' : 'Mark Complete'}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        {lesson.contentType === 'text' && lesson.content && (
          <div className="prose max-w-none">
            <div className="whitespace-pre-wrap">{lesson.content}</div>
          </div>
        )}

        {lesson.contentType === 'video' && lesson.videoUrl && (
          <div className="aspect-w-16 aspect-h-9">
            {lesson.videoUrl.includes('youtube.com') || lesson.videoUrl.includes('youtu.be') ? (
              <iframe
                src={getYouTubeEmbedUrl(lesson.videoUrl)}
                title={lesson.title}
                className="w-full h-96 rounded-lg"
                allowFullScreen
              />
            ) : lesson.videoUrl.includes('vimeo.com') ? (
              <iframe
                src={getVimeoEmbedUrl(lesson.videoUrl)}
                title={lesson.title}
                className="w-full h-96 rounded-lg"
                allowFullScreen
              />
            ) : (
              <video
                src={lesson.videoUrl}
                controls
                className="w-full h-96 rounded-lg"
              >
                Your browser does not support the video tag.
              </video>
            )}
          </div>
        )}

        {lesson.contentType === 'file' && lesson.fileUrl && (
          <div className="text-center py-8">
            <div className="text-gray-400 text-4xl mb-4">📄</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Downloadable Resource
            </h3>
            <p className="text-gray-600 mb-6">
              Click the button below to download or view the file.
            </p>
            <a
              href={lesson.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
            >
              Download File
            </a>
          </div>
        )}
      </div>

      {/* Progress Info */}
      {progress && (
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="flex justify-between items-center text-sm text-gray-600">
            <span>
              Time spent: {Math.floor((progress.timeSpent || 0) / 60)} minutes
            </span>
            {progress.completedAt && (
              <span>
                Completed on {new Date(progress.completedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper functions for video embeds
function getYouTubeEmbedUrl(url: string): string {
  const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
  return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
}

function getVimeoEmbedUrl(url: string): string {
  const videoId = url.match(/vimeo\.com\/(\d+)/)?.[1];
  return videoId ? `https://player.vimeo.com/video/${videoId}` : url;
}