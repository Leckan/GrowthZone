import React from 'react';
import { Link } from 'react-router-dom';
import { Course, Lesson } from '../types';

interface CourseWithLessons extends Course {
  lessons?: Lesson[];
  lessonsCount?: number;
}

interface CourseListProps {
  courses: CourseWithLessons[];
  isLoading?: boolean;
  showManageButtons?: boolean;
  onEditCourse?: (course: Course) => void;
  onDeleteCourse?: (courseId: string) => Promise<void>;
}

export function CourseList({
  courses,
  isLoading = false,
  showManageButtons = false,
  onEditCourse,
  onDeleteCourse,
}: CourseListProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white shadow rounded-lg p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-2/3 mb-4"></div>
            <div className="flex justify-between items-center">
              <div className="h-3 bg-gray-200 rounded w-1/6"></div>
              <div className="h-8 bg-gray-200 rounded w-20"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 text-lg mb-4">No courses found</div>
        <p className="text-gray-400">
          {showManageButtons
            ? 'Create your first course to get started.'
            : 'No courses are available in this community yet.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {courses.map((course) => (
        <CourseCard
          key={course.id}
          course={course}
          showManageButtons={showManageButtons}
          onEditCourse={onEditCourse}
          onDeleteCourse={onDeleteCourse}
        />
      ))}
    </div>
  );
}

interface CourseCardProps {
  course: CourseWithLessons;
  showManageButtons?: boolean;
  onEditCourse?: (course: Course) => void;
  onDeleteCourse?: (courseId: string) => Promise<void>;
}

function CourseCard({
  course,
  showManageButtons,
  onEditCourse,
  onDeleteCourse,
}: CourseCardProps) {
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handleDelete = async () => {
    if (!onDeleteCourse || !window.confirm('Are you sure you want to delete this course?')) return;
    
    setIsDeleting(true);
    try {
      await onDeleteCourse(course.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEdit = () => {
    if (onEditCourse) {
      onEditCourse(course);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <Link
              to={`/courses/${course.id}`}
              className="text-xl font-semibold text-gray-900 hover:text-indigo-600"
            >
              {course.title}
            </Link>
            {!course.isPublished && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                Draft
              </span>
            )}
          </div>
          
          {course.description && (
            <p className="text-gray-600 mb-3 line-clamp-2">{course.description}</p>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4 text-sm text-gray-500">
          <span>{course.lessonsCount || course.lessons?.length || 0} lessons</span>
          <span>•</span>
          <span>
            Created {new Date(course.createdAt).toLocaleDateString()}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <Link
            to={`/courses/${course.id}`}
            className="text-indigo-600 hover:text-indigo-500 text-sm font-medium"
          >
            View Course
          </Link>
          
          {showManageButtons && (
            <>
              <button
                onClick={handleEdit}
                className="text-gray-600 hover:text-gray-500 text-sm font-medium"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-red-600 hover:text-red-500 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}