import { ProgressService } from '../lib/progressService';
import { createTestUser, createTestCommunity, createTestCourse, createTestLesson, prisma } from './setup';

describe('Progress Tracking Service', () => {
  let testUser: any;
  let testCommunity: any;
  let testCourse: any;
  let testLesson: any;

  beforeEach(async () => {
    // Create test data
    testUser = await createTestUser();
    testCommunity = await createTestCommunity(testUser.id);
    testCourse = await createTestCourse(testCommunity.id);
    testLesson = await createTestLesson(testCourse.id);

    // Create membership for user
    await prisma.communityMembership.create({
      data: {
        userId: testUser.id,
        communityId: testCommunity.id,
        role: 'member',
        status: 'active'
      }
    });
  });

  describe('updateLessonProgress', () => {
    it('should create new progress record', async () => {
      const result = await ProgressService.updateLessonProgress(
        testLesson.id,
        testUser.id,
        { timeSpent: 300, completed: false }
      );

      expect(result.timeSpent).toBe(300);
      expect(result.completedAt).toBeNull();
      expect(result.lessonId).toBe(testLesson.id);
      expect(result.userId).toBe(testUser.id);
    });

    it('should mark lesson as completed', async () => {
      const result = await ProgressService.updateLessonProgress(
        testLesson.id,
        testUser.id,
        { completed: true }
      );

      expect(result.completedAt).toBeTruthy();
      expect(result.lessonId).toBe(testLesson.id);
    });

    it('should increment time spent on subsequent updates', async () => {
      // First update
      await ProgressService.updateLessonProgress(
        testLesson.id,
        testUser.id,
        { timeSpent: 100 }
      );

      // Second update
      const result = await ProgressService.updateLessonProgress(
        testLesson.id,
        testUser.id,
        { timeSpent: 200 }
      );

      expect(result.timeSpent).toBe(300); // Should be cumulative
    });

    it('should throw error for non-existent lesson', async () => {
      await expect(
        ProgressService.updateLessonProgress(
          'non-existent-id',
          testUser.id,
          { timeSpent: 100 }
        )
      ).rejects.toThrow('Lesson not found');
    });
  });

  describe('getCourseProgress', () => {
    it('should return course progress with analytics', async () => {
      // Add some progress
      await ProgressService.updateLessonProgress(
        testLesson.id,
        testUser.id,
        { timeSpent: 600, completed: true }
      );

      const result = await ProgressService.getCourseProgress(testCourse.id, testUser.id);

      expect(result.courseId).toBe(testCourse.id);
      expect(result.totalLessons).toBe(1);
      expect(result.completedLessons).toBe(1);
      expect(result.completionPercentage).toBe(100);
      expect(result.totalTimeSpent).toBe(600);
      expect(result.lessons).toHaveLength(1);
      expect(result.lessons[0].isCompleted).toBe(true);
      expect(result.lessons[0].timeSpent).toBe(600);
    });

    it('should calculate completion percentage correctly with multiple lessons', async () => {
      // Create additional lessons
      const lesson2 = await createTestLesson(testCourse.id);
      const lesson3 = await createTestLesson(testCourse.id);

      // Complete first lesson only
      await ProgressService.updateLessonProgress(
        testLesson.id,
        testUser.id,
        { completed: true }
      );

      const result = await ProgressService.getCourseProgress(testCourse.id, testUser.id);

      expect(result.totalLessons).toBe(3);
      expect(result.completedLessons).toBe(1);
      expect(result.completionPercentage).toBe(33); // 1/3 = 33%
    });

    it('should throw error for non-existent course', async () => {
      await expect(
        ProgressService.getCourseProgress('non-existent-id', testUser.id)
      ).rejects.toThrow('Course not found');
    });
  });

  describe('getCommunityProgress', () => {
    it('should return community progress across all courses', async () => {
      // Create another course with lessons
      const course2 = await createTestCourse(testCommunity.id);
      const lesson2 = await createTestLesson(course2.id);

      // Add progress to both courses
      await ProgressService.updateLessonProgress(
        testLesson.id,
        testUser.id,
        { timeSpent: 300, completed: true }
      );
      
      await ProgressService.updateLessonProgress(
        lesson2.id,
        testUser.id,
        { timeSpent: 400, completed: false }
      );

      const result = await ProgressService.getCommunityProgress(testCommunity.id, testUser.id);

      expect(result.communityId).toBe(testCommunity.id);
      expect(result.totalCourses).toBe(2);
      expect(result.totalLessons).toBe(2);
      expect(result.completedLessons).toBe(1);
      expect(result.completionPercentage).toBe(50); // 1/2 = 50%
      expect(result.totalTimeSpent).toBe(700);
      expect(result.courses).toHaveLength(2);
    });
  });

  describe('getUserProgressAnalytics', () => {
    it('should return user progress analytics', async () => {
      // Add some progress
      await ProgressService.updateLessonProgress(
        testLesson.id,
        testUser.id,
        { timeSpent: 600, completed: true }
      );

      const result = await ProgressService.getUserProgressAnalytics(testUser.id);

      expect(result.totalProgress).toBe(1);
      expect(result.completedLessons).toBe(1);
      expect(result.totalTimeSpent).toBe(600);
      expect(result.averageTimePerLesson).toBe(600);
      expect(result.recentActivity).toHaveLength(1);
      expect(result.recentActivity[0].lessonTitle).toBe(testLesson.title);
    });

    it('should support filtering by course', async () => {
      await ProgressService.updateLessonProgress(
        testLesson.id,
        testUser.id,
        { timeSpent: 300, completed: true }
      );

      const result = await ProgressService.getUserProgressAnalytics(testUser.id, {
        courseId: testCourse.id
      });

      expect(result.totalProgress).toBe(1);
      expect(result.completedLessons).toBe(1);
    });

    it('should support pagination', async () => {
      await ProgressService.updateLessonProgress(
        testLesson.id,
        testUser.id,
        { timeSpent: 300, completed: true }
      );

      const result = await ProgressService.getUserProgressAnalytics(testUser.id, {
        limit: 5,
        offset: 0
      });

      expect(result.totalProgress).toBe(1);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('getCommunityLeaderboard', () => {
    it('should return community leaderboard', async () => {
      // Create another user and add them to community
      const user2 = await createTestUser({ 
        email: 'user2@example.com', 
        username: 'user2' 
      });
      
      await prisma.communityMembership.create({
        data: {
          userId: user2.id,
          communityId: testCommunity.id,
          role: 'member',
          status: 'active'
        }
      });

      // Add progress for both users
      await ProgressService.updateLessonProgress(
        testLesson.id,
        testUser.id,
        { completed: true }
      );

      const result = await ProgressService.getCommunityLeaderboard(
        testCommunity.id,
        testUser.id,
        10
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('rank');
      expect(result[0]).toHaveProperty('userId');
      expect(result[0]).toHaveProperty('completedLessons');
      expect(result[0]).toHaveProperty('totalTimeSpent');
    });
  });

  describe('Access Control', () => {
    it('should deny access to private community lessons for non-members', async () => {
      // Make community private
      await prisma.community.update({
        where: { id: testCommunity.id },
        data: { isPublic: false }
      });

      // Remove membership
      await prisma.communityMembership.deleteMany({
        where: {
          userId: testUser.id,
          communityId: testCommunity.id
        }
      });

      await expect(
        ProgressService.updateLessonProgress(
          testLesson.id,
          testUser.id,
          { timeSpent: 100 }
        )
      ).rejects.toThrow('Access denied to lesson');
    });

    it('should require subscription for premium lessons', async () => {
      // Make lesson premium and community paid
      await prisma.lesson.update({
        where: { id: testLesson.id },
        data: { isFree: false }
      });

      await prisma.community.update({
        where: { id: testCommunity.id },
        data: { priceMonthly: 9.99 }
      });

      await expect(
        ProgressService.updateLessonProgress(
          testLesson.id,
          testUser.id,
          { timeSpent: 100 }
        )
      ).rejects.toThrow('Premium lesson requires active subscription');
    });
  });
});