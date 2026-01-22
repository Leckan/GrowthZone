import prisma from './prisma';
import { notificationService, NotificationType } from './notificationService';

export interface CourseCreateData {
  title: string;
  description?: string;
  sortOrder?: number;
}

export interface CourseUpdateData {
  title?: string;
  description?: string;
  isPublished?: boolean;
  sortOrder?: number;
}

export interface LessonCreateData {
  title: string;
  content?: string;
  contentType?: 'text' | 'video' | 'file';
  videoUrl?: string;
  fileUrl?: string;
  isFree?: boolean;
  sortOrder?: number;
}

export interface LessonUpdateData {
  title?: string;
  content?: string;
  contentType?: 'text' | 'video' | 'file';
  videoUrl?: string;
  fileUrl?: string;
  isFree?: boolean;
  sortOrder?: number;
}

export interface CourseQueryOptions {
  limit?: string | number;
  offset?: string | number;
  includeUnpublished?: string | boolean;
}

export class CourseService {
  /**
   * Create a new course in a community
   */
  static async createCourse(communityId: string, userId: string, data: CourseCreateData) {
    // Check if user has permission to create courses (admin, moderator, or creator)
    const membership = await prisma.communityMembership.findFirst({
      where: {
        communityId,
        userId,
        status: 'active',
        OR: [
          { role: 'admin' },
          { role: 'moderator' },
          { community: { creatorId: userId } }
        ]
      },
      include: {
        community: true
      }
    });

    if (!membership) {
      throw new Error('Insufficient permissions to create courses in this community');
    }

    // Get the next sort order if not provided
    let sortOrder = data.sortOrder;
    if (sortOrder === undefined) {
      const lastCourse = await prisma.course.findFirst({
        where: { communityId },
        orderBy: { sortOrder: 'desc' }
      });
      sortOrder = (lastCourse?.sortOrder || 0) + 1;
    }

    const course = await prisma.course.create({
      data: {
        ...data,
        communityId,
        sortOrder
      },
      include: {
        community: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        _count: {
          select: {
            lessons: true
          }
        }
      }
    });

    return course;
  }

  /**
   * Get courses for a community
   */
  static async getCourses(communityId: string, userId?: string, options: CourseQueryOptions = {}) {
    const {
      limit = 20,
      offset = 0,
      includeUnpublished = false
    } = options;

    // Convert string values to appropriate types
    const numLimit = typeof limit === 'string' ? parseInt(limit) : limit;
    const numOffset = typeof offset === 'string' ? parseInt(offset) : offset;
    const boolIncludeUnpublished = typeof includeUnpublished === 'string' ? includeUnpublished === 'true' : includeUnpublished;

    // Check if user has access to the community
    let hasAccess = false;
    let userRole = null;

    if (userId) {
      const membership = await prisma.communityMembership.findFirst({
        where: {
          communityId,
          userId,
          status: 'active'
        },
        include: {
          community: true
        }
      });

      if (membership) {
        hasAccess = true;
        userRole = membership.role;
      } else {
        // Check if community is public
        const community = await prisma.community.findUnique({
          where: { id: communityId }
        });
        hasAccess = community?.isPublic || false;
      }
    } else {
      // Check if community is public for non-authenticated users
      const community = await prisma.community.findUnique({
        where: { id: communityId }
      });
      hasAccess = community?.isPublic || false;
    }

    if (!hasAccess) {
      throw new Error('Access denied to community courses');
    }

    const where: any = {
      communityId
    };

    // Only show published courses unless user has admin/moderator permissions
    if (!boolIncludeUnpublished || (userRole !== 'admin' && userRole !== 'moderator')) {
      where.isPublished = true;
    }

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        include: {
          _count: {
            select: {
              lessons: true
            }
          }
        },
        orderBy: { sortOrder: 'asc' },
        take: numLimit,
        skip: numOffset
      }),
      prisma.course.count({ where })
    ]);

    return {
      courses,
      total,
      hasMore: numOffset + numLimit < total
    };
  }

  /**
   * Get a single course with lessons (with access control)
   */
  static async getCourse(courseId: string, userId?: string) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        community: {
          select: {
            id: true,
            name: true,
            slug: true,
            isPublic: true,
            creatorId: true,
            priceMonthly: true,
            priceYearly: true
          }
        },
        lessons: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    if (!course) {
      throw new Error('Course not found');
    }

    // Check access permissions
    let hasAccess = false;
    let userRole = null;
    let hasPaidAccess = false;

    if (userId) {
      const membership = await prisma.communityMembership.findFirst({
        where: {
          communityId: course.community.id,
          userId,
          status: 'active'
        }
      });

      if (membership) {
        hasAccess = true;
        userRole = membership.role;
        
        // Check if user has paid access (subscription or free community)
        if (!course.community.priceMonthly && !course.community.priceYearly) {
          hasPaidAccess = true; // Free community
        } else {
          // Check for active subscription
          const subscription = await prisma.subscription.findFirst({
            where: {
              userId,
              communityId: course.community.id,
              status: 'active'
            }
          });
          hasPaidAccess = !!subscription;
        }
      } else {
        hasAccess = course.community.isPublic;
      }
    } else {
      hasAccess = course.community.isPublic;
    }

    if (!hasAccess) {
      throw new Error('Access denied to course');
    }

    // Filter unpublished courses for non-admin users
    if (!course.isPublished && userRole !== 'admin' && userRole !== 'moderator' && course.community.creatorId !== userId) {
      throw new Error('Course not found');
    }

    // Filter lessons based on access level
    const filteredLessons = course.lessons.filter((lesson: any) => {
      // Admins, moderators, and creators can see all lessons
      if (userRole === 'admin' || userRole === 'moderator' || course.community.creatorId === userId) {
        return true;
      }
      
      // Free lessons are visible to all community members
      if (lesson.isFree) {
        return true;
      }
      
      // Premium lessons require paid access
      return hasPaidAccess;
    });

    return {
      ...course,
      lessons: filteredLessons,
      userAccess: {
        hasAccess,
        hasPaidAccess,
        role: userRole
      }
    };
  }

  /**
   * Update a course
   */
  static async updateCourse(courseId: string, userId: string, data: CourseUpdateData) {
    // Check if user has permission to update courses
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        community: true
      }
    });

    if (!course) {
      throw new Error('Course not found');
    }

    const membership = await prisma.communityMembership.findFirst({
      where: {
        communityId: course.communityId,
        userId,
        status: 'active',
        OR: [
          { role: 'admin' },
          { role: 'moderator' },
          { community: { creatorId: userId } }
        ]
      }
    });

    if (!membership) {
      throw new Error('Insufficient permissions to update course');
    }

    const updatedCourse = await prisma.course.update({
      where: { id: courseId },
      data,
      include: {
        community: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        _count: {
          select: {
            lessons: true
          }
        }
      }
    });

    // Send notifications if course was just published
    if (data.isPublished === true && !course.isPublished) {
      try {
        // Get all active community members
        const memberships = await prisma.communityMembership.findMany({
          where: {
            communityId: course.communityId,
            status: 'active',
            userId: { not: userId } // Don't notify the course creator
          },
          select: { userId: true }
        });

        // Create notifications for all members
        const notifications = memberships.map(membership => ({
          userId: membership.userId,
          type: NotificationType.COURSE_UPDATE,
          title: 'New Course Available!',
          message: `A new course "${updatedCourse.title}" has been published in ${course.community.name}`,
          data: {
            courseId,
            communityId: course.communityId,
            courseName: updatedCourse.title,
            communityName: course.community.name
          }
        }));

        await notificationService.createBulkNotifications(notifications);
      } catch (error) {
        console.error('Failed to send course publication notifications:', error);
      }
    }

    return updatedCourse;
  }

  /**
   * Delete a course
   */
  static async deleteCourse(courseId: string, userId: string) {
    // Check if user has permission to delete courses
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        community: true
      }
    });

    if (!course) {
      throw new Error('Course not found');
    }

    const membership = await prisma.communityMembership.findFirst({
      where: {
        communityId: course.communityId,
        userId,
        status: 'active',
        OR: [
          { role: 'admin' },
          { community: { creatorId: userId } }
        ]
      }
    });

    if (!membership) {
      throw new Error('Insufficient permissions to delete course');
    }

    await prisma.course.delete({
      where: { id: courseId }
    });

    return { message: 'Course deleted successfully' };
  }

  /**
   * Create a new lesson in a course
   */
  static async createLesson(courseId: string, userId: string, data: LessonCreateData) {
    // Check if user has permission to create lessons
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        community: true
      }
    });

    if (!course) {
      throw new Error('Course not found');
    }

    const membership = await prisma.communityMembership.findFirst({
      where: {
        communityId: course.communityId,
        userId,
        status: 'active',
        OR: [
          { role: 'admin' },
          { role: 'moderator' },
          { community: { creatorId: userId } }
        ]
      }
    });

    if (!membership) {
      throw new Error('Insufficient permissions to create lessons in this course');
    }

    // Get the next sort order if not provided
    let sortOrder = data.sortOrder;
    if (sortOrder === undefined) {
      const lastLesson = await prisma.lesson.findFirst({
        where: { courseId },
        orderBy: { sortOrder: 'desc' }
      });
      sortOrder = (lastLesson?.sortOrder || 0) + 1;
    }

    const lesson = await prisma.lesson.create({
      data: {
        ...data,
        courseId,
        sortOrder
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            community: {
              select: {
                id: true,
                name: true,
                slug: true
              }
            }
          }
        }
      }
    });

    return lesson;
  }

  /**
   * Get lessons for a course
   */
  static async getLessons(courseId: string, userId?: string) {
    // First check if course exists and user has access
    const course = await this.getCourse(courseId, userId);

    const lessons = await prisma.lesson.findMany({
      where: { courseId },
      orderBy: { sortOrder: 'asc' }
    });

    return lessons;
  }

  /**
   * Get a single lesson (with access control)
   */
  static async getLesson(lessonId: string, userId?: string) {
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        course: {
          include: {
            community: {
              select: {
                id: true,
                name: true,
                slug: true,
                isPublic: true,
                creatorId: true,
                priceMonthly: true,
                priceYearly: true
              }
            }
          }
        }
      }
    });

    if (!lesson) {
      throw new Error('Lesson not found');
    }

    // Check access permissions through course
    const courseAccess = await this.getCourse(lesson.courseId, userId);
    
    // Check if user has access to this specific lesson
    let hasLessonAccess = false;
    let userRole = courseAccess.userAccess?.role;
    let hasPaidAccess = courseAccess.userAccess?.hasPaidAccess;

    // Admins, moderators, and creators can access all lessons
    if (userRole === 'admin' || userRole === 'moderator' || lesson.course.community.creatorId === userId) {
      hasLessonAccess = true;
    }
    // Free lessons are accessible to all community members
    else if (lesson.isFree) {
      hasLessonAccess = true;
    }
    // Premium lessons require paid access
    else if (hasPaidAccess) {
      hasLessonAccess = true;
    }

    if (!hasLessonAccess) {
      throw new Error('Access denied to lesson - premium content requires subscription');
    }

    return {
      ...lesson,
      userAccess: {
        hasAccess: hasLessonAccess,
        hasPaidAccess,
        role: userRole,
        isPremium: !lesson.isFree
      }
    };
  }

  /**
   * Update a lesson
   */
  static async updateLesson(lessonId: string, userId: string, data: LessonUpdateData) {
    // Check if user has permission to update lessons
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        course: {
          include: {
            community: true
          }
        }
      }
    });

    if (!lesson) {
      throw new Error('Lesson not found');
    }

    const membership = await prisma.communityMembership.findFirst({
      where: {
        communityId: lesson.course.communityId,
        userId,
        status: 'active',
        OR: [
          { role: 'admin' },
          { role: 'moderator' },
          { community: { creatorId: userId } }
        ]
      }
    });

    if (!membership) {
      throw new Error('Insufficient permissions to update lesson');
    }

    const updatedLesson = await prisma.lesson.update({
      where: { id: lessonId },
      data,
      include: {
        course: {
          select: {
            id: true,
            title: true,
            community: {
              select: {
                id: true,
                name: true,
                slug: true
              }
            }
          }
        }
      }
    });

    return updatedLesson;
  }

  /**
   * Delete a lesson
   */
  static async deleteLesson(lessonId: string, userId: string) {
    // Check if user has permission to delete lessons
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        course: {
          include: {
            community: true
          }
        }
      }
    });

    if (!lesson) {
      throw new Error('Lesson not found');
    }

    const membership = await prisma.communityMembership.findFirst({
      where: {
        communityId: lesson.course.communityId,
        userId,
        status: 'active',
        OR: [
          { role: 'admin' },
          { community: { creatorId: userId } }
        ]
      }
    });

    if (!membership) {
      throw new Error('Insufficient permissions to delete lesson');
    }

    await prisma.lesson.delete({
      where: { id: lessonId }
    });

    return { message: 'Lesson deleted successfully' };
  }

  /**
   * Publish or unpublish a course
   */
  static async publishCourse(courseId: string, userId: string, isPublished: boolean) {
    // Check if user has permission to publish courses
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        community: true,
        lessons: true
      }
    });

    if (!course) {
      throw new Error('Course not found');
    }

    const membership = await prisma.communityMembership.findFirst({
      where: {
        communityId: course.communityId,
        userId,
        status: 'active',
        OR: [
          { role: 'admin' },
          { community: { creatorId: userId } }
        ]
      }
    });

    if (!membership) {
      throw new Error('Insufficient permissions to publish course');
    }

    // Validate course has content before publishing
    if (isPublished && course.lessons.length === 0) {
      throw new Error('Cannot publish course without lessons');
    }

    const updatedCourse = await prisma.course.update({
      where: { id: courseId },
      data: { isPublished },
      include: {
        community: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        _count: {
          select: {
            lessons: true
          }
        }
      }
    });

    return updatedCourse;
  }

  /**
   * Bulk publish/unpublish courses
   */
  static async bulkPublishCourses(communityId: string, userId: string, courseIds: string[], isPublished: boolean) {
    // Check if user has permission to publish courses
    const membership = await prisma.communityMembership.findFirst({
      where: {
        communityId,
        userId,
        status: 'active',
        OR: [
          { role: 'admin' },
          { community: { creatorId: userId } }
        ]
      }
    });

    if (!membership) {
      throw new Error('Insufficient permissions to publish courses');
    }

    // Update courses in a transaction
    const updatedCourses = await prisma.$transaction(async (tx: any) => {
      const courses = [];
      
      for (const courseId of courseIds) {
        // Verify course belongs to this community
        const course = await tx.course.findFirst({
          where: { 
            id: courseId,
            communityId 
          },
          include: {
            lessons: true
          }
        });

        if (!course) {
          throw new Error(`Course ${courseId} not found in this community`);
        }

        // Validate course has content before publishing
        if (isPublished && course.lessons.length === 0) {
          throw new Error(`Cannot publish course "${course.title}" without lessons`);
        }

        const updatedCourse = await tx.course.update({
          where: { id: courseId },
          data: { isPublished }
        });

        courses.push(updatedCourse);
      }

      return courses;
    });

    return {
      message: `Successfully ${isPublished ? 'published' : 'unpublished'} ${updatedCourses.length} courses`,
      courses: updatedCourses
    };
  }

  /**
   * Get course publishing status and validation
   */
  static async getCoursePublishingInfo(courseId: string, userId: string) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        community: true,
        lessons: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    if (!course) {
      throw new Error('Course not found');
    }

    // Check if user has permission to view publishing info
    const membership = await prisma.communityMembership.findFirst({
      where: {
        communityId: course.communityId,
        userId,
        status: 'active',
        OR: [
          { role: 'admin' },
          { role: 'moderator' },
          { community: { creatorId: userId } }
        ]
      }
    });

    if (!membership) {
      throw new Error('Insufficient permissions to view course publishing info');
    }

    const canPublish = course.lessons.length > 0;
    const publishingIssues = [];

    if (course.lessons.length === 0) {
      publishingIssues.push('Course must have at least one lesson');
    }

    if (!course.title.trim()) {
      publishingIssues.push('Course must have a title');
    }

    const lessonIssues = course.lessons
      .filter((lesson: any) => !lesson.title.trim())
      .map((lesson: any) => `Lesson at position ${lesson.sortOrder} is missing a title`);

    publishingIssues.push(...lessonIssues);

    return {
      courseId: course.id,
      title: course.title,
      isPublished: course.isPublished,
      canPublish,
      publishingIssues,
      lessonCount: course.lessons.length,
      lessons: course.lessons.map((lesson: any) => ({
        id: lesson.id,
        title: lesson.title,
        contentType: lesson.contentType,
        isFree: lesson.isFree,
        sortOrder: lesson.sortOrder,
        hasContent: !!(lesson.content || lesson.videoUrl || lesson.fileUrl)
      }))
    };
  }
  static async reorderCourses(communityId: string, userId: string, courseIds: string[]) {
    // Check if user has permission to reorder courses
    const membership = await prisma.communityMembership.findFirst({
      where: {
        communityId,
        userId,
        status: 'active',
        OR: [
          { role: 'admin' },
          { role: 'moderator' },
          { community: { creatorId: userId } }
        ]
      }
    });

    if (!membership) {
      throw new Error('Insufficient permissions to reorder courses');
    }

    // Update sort orders in a transaction
    await prisma.$transaction(async (tx: any) => {
      for (let i = 0; i < courseIds.length; i++) {
        await tx.course.update({
          where: { 
            id: courseIds[i],
            communityId // Ensure course belongs to this community
          },
          data: { sortOrder: i + 1 }
        });
      }
    });

    return { message: 'Courses reordered successfully' };
  }

  /**
   * Reorder lessons in a course
   */
  static async reorderLessons(courseId: string, userId: string, lessonIds: string[]) {
    // Check if user has permission to reorder lessons
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        community: true
      }
    });

    if (!course) {
      throw new Error('Course not found');
    }

    const membership = await prisma.communityMembership.findFirst({
      where: {
        communityId: course.communityId,
        userId,
        status: 'active',
        OR: [
          { role: 'admin' },
          { role: 'moderator' },
          { community: { creatorId: userId } }
        ]
      }
    });

    if (!membership) {
      throw new Error('Insufficient permissions to reorder lessons');
    }

    // Update sort orders in a transaction
    await prisma.$transaction(async (tx: any) => {
      for (let i = 0; i < lessonIds.length; i++) {
        await tx.lesson.update({
          where: { 
            id: lessonIds[i],
            courseId // Ensure lesson belongs to this course
          },
          data: { sortOrder: i + 1 }
        });
      }
    });

    return { message: 'Lessons reordered successfully' };
  }
}