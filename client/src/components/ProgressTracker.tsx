import React from 'react';
import { Course, Lesson, UserProgress } from '../types';

interface CourseWithLessons extends Course {
  lessons: Lesson[];
}

interface ProgressTrackerProps {
  course: CourseWithLessons;
  progress: UserProgress[];
  className?: string;
}

export function ProgressTracker({ course, progress, className = '' }: ProgressTrackerProps) {
  const totalLessons = course.lessons.length;
  const completedLessons = progress.filter(p => p.completedAt).length;
  const progressPercentage = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;

  const totalTimeSpent = progress.reduce((total, p) => total + (p.timeSpent || 0), 0);
  const totalTimeMinutes = Math.floor(totalTimeSpent / 60);
  const totalTimeHours = Math.floor(totalTimeMinutes / 60);
  const remainingMinutes = totalTimeMinutes % 60;

  return (
    <div className={`bg-white shadow rounded-lg p-6 ${className}`}>
      <h3 className="text-lg font-medium text-gray-900 mb-4">Your Progress</h3>
      
      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">
            {completedLessons} of {totalLessons} lessons completed
          </span>
          <span className="text-sm text-gray-500">
            {Math.round(progressPercentage)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <div className="text-2xl font-bold text-gray-900">
            {totalTimeHours > 0 ? `${totalTimeHours}h ${remainingMinutes}m` : `${totalTimeMinutes}m`}
          </div>
          <div className="text-sm text-gray-600">Time Spent</div>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <div className="text-2xl font-bold text-gray-900">
            {totalLessons - completedLessons}
          </div>
          <div className="text-sm text-gray-600">Lessons Remaining</div>
        </div>
      </div>

      {/* Lesson List */}
      <div>
        <h4 className="text-sm font-medium text-gray-900 mb-3">Lessons</h4>
        <div className="space-y-2">
          {course.lessons.map((lesson, index) => {
            const lessonProgress = progress.find(p => p.lessonId === lesson.id);
            const isCompleted = !!lessonProgress?.completedAt;
            
            return (
              <div
                key={lesson.id}
                className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50"
              >
                <div className="flex-shrink-0">
                  {isCompleted ? (
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  ) : (
                    <div className="w-6 h-6 border-2 border-gray-300 rounded-full flex items-center justify-center">
                      <span className="text-xs text-gray-500">{index + 1}</span>
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${
                    isCompleted ? 'text-gray-900' : 'text-gray-700'
                  }`}>
                    {lesson.title}
                  </p>
                  <div className="flex items-center space-x-2 text-xs text-gray-500">
                    <span className="capitalize">{lesson.contentType}</span>
                    {lesson.isFree && (
                      <>
                        <span>•</span>
                        <span className="text-green-600">Free</span>
                      </>
                    )}
                    {lessonProgress?.timeSpent && (
                      <>
                        <span>•</span>
                        <span>{Math.floor(lessonProgress.timeSpent / 60)}m spent</span>
                      </>
                    )}
                  </div>
                </div>

                {isCompleted && (
                  <div className="flex-shrink-0 text-xs text-gray-500">
                    {new Date(lessonProgress!.completedAt!).toLocaleDateString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Completion Message */}
      {progressPercentage === 100 && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">
                Congratulations! 🎉
              </h3>
              <div className="mt-1 text-sm text-green-700">
                You've completed all lessons in this course.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}