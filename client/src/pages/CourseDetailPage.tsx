import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Navigation } from '../components/Navigation';
import { LessonViewer } from '../components/LessonViewer';
import { ProgressTracker } from '../components/ProgressTracker';
import { useAuth } from '../contexts/AuthContext';
import { Course, Lesson, UserProgress } from '../types';

interface CourseWithLessons extends Course {
  lessons: Lesson[];
}

export function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [course, setCourse] = useState<CourseWithLessons | null>(null);
  const [progress, setProgress] = useState<UserProgress[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (id) {
      loadCourse();
      loadProgress();
    }
  }, [id]);

  const loadCourse = async () => {
    // Mock data for now - in real app this would be an API call
    try {
      const mockCourse: CourseWithLessons = {
        id: id!,
        communityId: 'community-1',
        title: 'Introduction to React',
        description: 'Learn the fundamentals of React development',
        isPublished: true,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lessons: [
          {
            id: 'lesson-1',
            courseId: id!,
            title: 'Getting Started with React',
            content: 'React is a JavaScript library for building user interfaces. In this lesson, we\'ll cover the basics of React components and JSX.',
            contentType: 'text',
            isFree: true,
            sortOrder: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'lesson-2',
            courseId: id!,
            title: 'React Components Deep Dive',
            content: 'Learn about functional and class components, props, and state management.',
            contentType: 'text',
            isFree: false,
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'lesson-3',
            courseId: id!,
            title: 'React Hooks Tutorial',
            videoUrl: 'https://www.youtube.com/watch?v=dGcsHMXbSOA',
            contentType: 'video',
            isFree: false,
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };
      
      setCourse(mockCourse);
      if (mockCourse.lessons.length > 0) {
        setSelectedLesson(mockCourse.lessons[0]);
      }
    } catch (err) {
      setError('Failed to load course');
    } finally {
      setIsLoading(false);
    }
  };

  const loadProgress = async () => {
    // Mock progress data
    const mockProgress: UserProgress[] = [
      {
        id: 'progress-1',
        userId: user?.id || 'user-1',
        lessonId: 'lesson-1',
        completedAt: new Date().toISOString(),
        timeSpent: 300, // 5 minutes
      },
    ];
    setProgress(mockProgress);
  };

  const handleMarkComplete = async (lessonId: string) => {
    // Mock implementation
    const newProgress: UserProgress = {
      id: `progress-${Date.now()}`,
      userId: user?.id || 'user-1',
      lessonId,
      completedAt: new Date().toISOString(),
      timeSpent: 0,
    };
    
    setProgress(prev => [...prev.filter(p => p.lessonId !== lessonId), newProgress]);
  };

  const handleUpdateProgress = async (lessonId: string, timeSpent: number) => {
    // Mock implementation
    setProgress(prev => 
      prev.map(p => 
        p.lessonId === lessonId 
          ? { ...p, timeSpent: (p.timeSpent || 0) + timeSpent }
          : p
      )
    );
  };

  const canAccessLesson = (lesson: Lesson): boolean => {
    // For demo purposes, assume user can access free lessons
    return lesson.isFree || !!user; // In real app, check subscription status
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3 mb-8"></div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white shadow rounded-lg p-6">
                <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
              <div className="bg-white shadow rounded-lg p-6">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
                <div className="h-2 bg-gray-200 rounded w-full"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              {error || 'Course not found'}
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <nav className="flex mb-4" aria-label="Breadcrumb">
            <ol className="flex items-center space-x-4">
              <li>
                <Link to="/communities" className="text-gray-400 hover:text-gray-500">
                  Communities
                </Link>
              </li>
              <li>
                <div className="flex items-center">
                  <svg className="flex-shrink-0 h-5 w-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="ml-4 text-gray-500">{course.title}</span>
                </div>
              </li>
            </ol>
          </nav>
          
          <h1 className="text-3xl font-bold text-gray-900">{course.title}</h1>
          {course.description && (
            <p className="mt-2 text-gray-600">{course.description}</p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {selectedLesson ? (
              <LessonViewer
                lesson={selectedLesson}
                progress={progress.find(p => p.lessonId === selectedLesson.id)}
                onMarkComplete={handleMarkComplete}
                onUpdateProgress={handleUpdateProgress}
                canAccess={canAccessLesson(selectedLesson)}
              />
            ) : (
              <div className="bg-white shadow rounded-lg p-6">
                <div className="text-center py-12">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Welcome to the Course
                  </h3>
                  <p className="text-gray-600">
                    Select a lesson from the sidebar to get started.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Progress Tracker */}
            <ProgressTracker course={course} progress={progress} />

            {/* Lesson Navigation */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Lessons</h3>
              <div className="space-y-2">
                {course.lessons.map((lesson, index) => {
                  const lessonProgress = progress.find(p => p.lessonId === lesson.id);
                  const isCompleted = !!lessonProgress?.completedAt;
                  const isSelected = selectedLesson?.id === lesson.id;
                  const canAccess = canAccessLesson(lesson);
                  
                  return (
                    <button
                      key={lesson.id}
                      onClick={() => setSelectedLesson(lesson)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        isSelected
                          ? 'bg-indigo-50 border-indigo-200 border'
                          : 'hover:bg-gray-50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0">
                          {isCompleted ? (
                            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          ) : canAccess ? (
                            <div className="w-6 h-6 border-2 border-gray-300 rounded-full flex items-center justify-center">
                              <span className="text-xs text-gray-500">{index + 1}</span>
                            </div>
                          ) : (
                            <div className="w-6 h-6 text-gray-400">🔒</div>
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${
                            isSelected ? 'text-indigo-900' : 'text-gray-900'
                          }`}>
                            {lesson.title}
                          </p>
                          <div className="flex items-center space-x-2 text-xs text-gray-500">
                            <span className="capitalize">{lesson.contentType}</span>
                            {lesson.isFree ? (
                              <>
                                <span>•</span>
                                <span className="text-green-600">Free</span>
                              </>
                            ) : (
                              <>
                                <span>•</span>
                                <span className="text-orange-600">Premium</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}