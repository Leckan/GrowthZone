import * as fc from 'fast-check';
import request from 'supertest';
import app from '../index';
import { PrismaClient } from '@prisma/client';
import { createPropertyTest } from './propertyTestConfig';
import { DatabaseTestUtils } from './testUtils';
import { generateTokenPair } from '../lib/auth';

/**
 * Property-based tests for progress tracking consistency
 * Feature: community-learning-platform, Property 6: Progress Tracking Consistency
 * Validates: Requirements 3.6
 */

const prisma = new PrismaClient();
const dbUtils = new DatabaseTestUtils(prisma);

describe('Progress Tracking Consistency Property Tests', () => {
  let authToken: string;
  let testUser: any;
  let testCommunity: any;
  let testCourse: any;
  let testLessons: any[];

  beforeAll(async () => {
    await dbUtils.cleanup();
  });

  beforeEach(async () => {
    // Create test hierarchy
    const hierarchy = await dbUtils.createTestHierarchy();
    testUser = hierarchy.user;
    testCommunity = hierarchy.community;
    testCourse = hierarchy.course;
    
    // Create multiple lessons for comprehensive testing
    testLessons = [
      hierarchy.lesson,
      await dbUtils.createLesson(testCourse.id, { title: 'Lesson 2' }),
      await dbUtils.createLesson(testCourse.id, { title: 'Lesson 3' })
    ];

    // Create community membership
    await prisma.communityMembership.create({
      data: {
        userId: testUser.id,
        communityId: testCommunity.id,
        role: 'member',
        status: 'active'
      }
    });

    // Generate auth token
    const tokens = generateTokenPair(testUser.id);
    authToken = tokens.accessToken;
  });

  afterEach(async () => {
    await dbUtils.cleanup();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  createPropertyTest(
    6,
    'Progress Tracking Consistency',
    ['3.6'],
    async () => {
      // Property: For any member lesson interactions, the system should accurately track and persist progress across all course content
      
      const progressDataGenerator = fc.record({
        timeSpent: fc.integer({ min: 1, max: 3600 }), // 1 second to 1 hour
        completed: fc.boolean()
      });

      const lessonInteractionGenerator = fc.record({
        lessonIndex: fc.integer({ min: 0, max: 2 }), // Index into testLessons array
        progressData: progressDataGenerator
      });

      const multipleInteractionsGenerator = fc.array(lessonInteractionGenerator, { 
        minLength: 1, 
        maxLength: 10 
      });

      await fc.assert(
        fc.asyncProperty(multipleInteractionsGenerator, async (interactions) => {
          // Track expected state for verification
          const expectedProgress = new Map<string, { timeSpent: number; completed: boolean }>();
          
          // Apply all interactions sequentially
          for (const interaction of interactions) {
            const lesson = testLessons[interaction.lessonIndex];
            const lessonId = lesson.id;
            
            // Update expected state (cumulative time spent)
            const current = expectedProgress.get(lessonId) || { timeSpent: 0, completed: false };
            expectedProgress.set(lessonId, {
              timeSpent: current.timeSpent + interaction.progressData.timeSpent,
              completed: interaction.progressData.completed || current.completed
            });

            // Make API call to update progress
            const response = await request(app)
              .put(`/api/v1/progress/lessons/${lessonId}`)
              .set('Authorization', `Bearer ${authToken}`)
              .send(interaction.progressData);

            // Verify API response is successful
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
          }

          // Verify final state matches expected state
          for (const [lessonId, expected] of expectedProgress.entries()) {
            // Get current progress from API
            const progressResponse = await request(app)
              .get(`/api/v1/progress/lessons/${lessonId}`)
              .set('Authorization', `Bearer ${authToken}`);

            expect(progressResponse.status).toBe(200);
            const actualProgress = progressResponse.body.data;

            // Verify progress consistency
            expect(actualProgress.timeSpent).toBe(expected.timeSpent);
            expect(!!actualProgress.completedAt).toBe(expected.completed);
            expect(actualProgress.lessonId).toBe(lessonId);
            expect(actualProgress.userId).toBe(testUser.id);
          }

          // Verify course-level progress aggregation is consistent
          const courseProgressResponse = await request(app)
            .get(`/api/v1/progress/courses/${testCourse.id}`)
            .set('Authorization', `Bearer ${authToken}`);

          expect(courseProgressResponse.status).toBe(200);
          const courseProgress = courseProgressResponse.body.data;

          // Calculate expected course metrics
          const totalLessons = testLessons.length;
          const completedLessons = Array.from(expectedProgress.values())
            .filter(p => p.completed).length;
          const totalTimeSpent = Array.from(expectedProgress.values())
            .reduce((sum, p) => sum + p.timeSpent, 0);
          const expectedCompletionPercentage = Math.round((completedLessons / totalLessons) * 100);

          // Verify course-level aggregation
          expect(courseProgress.totalLessons).toBe(totalLessons);
          expect(courseProgress.completedLessons).toBe(completedLessons);
          expect(courseProgress.totalTimeSpent).toBe(totalTimeSpent);
          expect(courseProgress.completionPercentage).toBe(expectedCompletionPercentage);

          // Verify community-level progress aggregation is consistent
          const communityProgressResponse = await request(app)
            .get(`/api/v1/progress/communities/${testCommunity.id}`)
            .set('Authorization', `Bearer ${authToken}`);

          expect(communityProgressResponse.status).toBe(200);
          const communityProgress = communityProgressResponse.body.data;

          // Verify community-level aggregation includes this course
          expect(communityProgress.totalCourses).toBeGreaterThanOrEqual(1);
          expect(communityProgress.totalLessons).toBeGreaterThanOrEqual(totalLessons);
          expect(communityProgress.completedLessons).toBeGreaterThanOrEqual(completedLessons);
          expect(communityProgress.totalTimeSpent).toBeGreaterThanOrEqual(totalTimeSpent);

          // Verify progress persistence across API calls
          // Make another call to ensure data is persisted
          const persistenceCheckResponse = await request(app)
            .get(`/api/v1/progress/courses/${testCourse.id}`)
            .set('Authorization', `Bearer ${authToken}`);

          expect(persistenceCheckResponse.status).toBe(200);
          const persistedProgress = persistenceCheckResponse.body.data;

          // Verify persistence consistency
          expect(persistedProgress.totalTimeSpent).toBe(totalTimeSpent);
          expect(persistedProgress.completedLessons).toBe(completedLessons);
          expect(persistedProgress.completionPercentage).toBe(expectedCompletionPercentage);

          return true;
        }),
        { numRuns: 100, timeout: 30000 }
      );
    }
  );

  // Additional property test for progress tracking edge cases
  createPropertyTest(
    6,
    'Progress Tracking Edge Cases',
    ['3.6'],
    async () => {
      // Property: Progress tracking should handle edge cases correctly (zero time, multiple completions, etc.)
      
      const edgeCaseGenerator = fc.oneof(
        // Zero time spent
        fc.constant({ timeSpent: 0, completed: false }),
        // Multiple completion attempts
        fc.constant({ timeSpent: 100, completed: true }),
        // Large time values
        fc.record({
          timeSpent: fc.integer({ min: 86400, max: 604800 }), // 1 day to 1 week
          completed: fc.boolean()
        })
      );

      await fc.assert(
        fc.asyncProperty(edgeCaseGenerator, async (progressData) => {
          const lesson = testLessons[0];

          // Apply progress update
          const response = await request(app)
            .put(`/api/v1/progress/lessons/${lesson.id}`)
            .set('Authorization', `Bearer ${authToken}`)
            .send(progressData);

          expect(response.status).toBe(200);

          // Verify the update was handled correctly
          const checkResponse = await request(app)
            .get(`/api/v1/progress/lessons/${lesson.id}`)
            .set('Authorization', `Bearer ${authToken}`);

          expect(checkResponse.status).toBe(200);
          const actualProgress = checkResponse.body.data;

          // Verify edge case handling
          expect(actualProgress.timeSpent).toBeGreaterThanOrEqual(0);
          expect(typeof actualProgress.timeSpent).toBe('number');
          expect(typeof !!actualProgress.completedAt).toBe('boolean');

          // If marked as completed, should have completion timestamp
          if (progressData.completed) {
            expect(actualProgress.completedAt).toBeTruthy();
          }

          return true;
        }),
        { numRuns: 50, timeout: 15000 }
      );
    }
  );

  // Property test for concurrent progress updates
  createPropertyTest(
    6,
    'Progress Tracking Concurrency',
    ['3.6'],
    async () => {
      // Property: Concurrent progress updates should maintain consistency
      
      const concurrentUpdatesGenerator = fc.array(
        fc.record({
          timeSpent: fc.integer({ min: 1, max: 100 }),
          completed: fc.boolean()
        }),
        { minLength: 2, maxLength: 5 }
      );

      await fc.assert(
        fc.asyncProperty(concurrentUpdatesGenerator, async (updates) => {
          const lesson = testLessons[0];

          // Execute concurrent updates
          const promises = updates.map(update => 
            request(app)
              .put(`/api/v1/progress/lessons/${lesson.id}`)
              .set('Authorization', `Bearer ${authToken}`)
              .send(update)
          );

          const responses = await Promise.all(promises);

          // All requests should succeed
          responses.forEach(response => {
            expect(response.status).toBe(200);
          });

          // Verify final state is consistent
          const finalResponse = await request(app)
            .get(`/api/v1/progress/lessons/${lesson.id}`)
            .set('Authorization', `Bearer ${authToken}`);

          expect(finalResponse.status).toBe(200);
          const finalProgress = finalResponse.body.data;

          // Verify consistency constraints
          expect(finalProgress.timeSpent).toBeGreaterThanOrEqual(0);
          expect(typeof finalProgress.timeSpent).toBe('number');
          expect(finalProgress.lessonId).toBe(lesson.id);
          expect(finalProgress.userId).toBe(testUser.id);

          // If any update marked as completed, final state should be completed
          const anyCompleted = updates.some(u => u.completed);
          if (anyCompleted) {
            expect(finalProgress.completedAt).toBeTruthy();
          }

          return true;
        }),
        { numRuns: 30, timeout: 20000 }
      );
    }
  );
});