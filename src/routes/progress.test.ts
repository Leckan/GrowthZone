import request from 'supertest';
import app from '../index';
import { createTestUser, createTestCommunity, createTestCourse, createTestLesson, cleanupTestData } from '../test/setup';

describe('Progress Tracking API', () => {
  let testUser: any;
  let testCommunity: any;
  let testCourse: any;
  let testLesson: any;
  let authToken: string;

  beforeAll(async () => {
    // Create test data
    testUser = await createTestUser();
    testCommunity = await createTestCommunity(testUser.id);
    testCourse = await createTestCourse(testCommunity.id);
    testLesson = await createTestLesson(testCourse.id);

    // Get auth token
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testUser.email,
        password: 'password123'
      });

    authToken = loginResponse.body.data.token;
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('PUT /api/v1/progress/lessons/:lessonId', () => {
    it('should update lesson progress with time spent', async () => {
      const response = await request(app)
        .put(`/api/v1/progress/lessons/${testLesson.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          timeSpent: 300, // 5 minutes
          completed: false
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.timeSpent).toBe(300);
      expect(response.body.data.completedAt).toBeNull();
    });

    it('should mark lesson as completed', async () => {
      const response = await request(app)
        .put(`/api/v1/progress/lessons/${testLesson.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          completed: true
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.completedAt).toBeTruthy();
    });

    it('should increment time spent on subsequent updates', async () => {
      // First update
      await request(app)
        .put(`/api/v1/progress/lessons/${testLesson.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          timeSpent: 100
        });

      // Second update
      const response = await request(app)
        .put(`/api/v1/progress/lessons/${testLesson.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          timeSpent: 200
        });

      expect(response.status).toBe(200);
      expect(response.body.data.timeSpent).toBeGreaterThanOrEqual(300); // Should be cumulative
    });

    it('should return 404 for non-existent lesson', async () => {
      const response = await request(app)
        .put('/api/v1/progress/lessons/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          timeSpent: 100
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Not found');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .put(`/api/v1/progress/lessons/${testLesson.id}`)
        .send({
          timeSpent: 100
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/progress/courses/:courseId', () => {
    it('should get course progress for user', async () => {
      const response = await request(app)
        .get(`/api/v1/progress/courses/${testCourse.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('courseId', testCourse.id);
      expect(response.body.data).toHaveProperty('totalLessons');
      expect(response.body.data).toHaveProperty('completedLessons');
      expect(response.body.data).toHaveProperty('completionPercentage');
      expect(response.body.data).toHaveProperty('totalTimeSpent');
      expect(response.body.data).toHaveProperty('lessons');
      expect(Array.isArray(response.body.data.lessons)).toBe(true);
    });

    it('should return 404 for non-existent course', async () => {
      const response = await request(app)
        .get('/api/v1/progress/courses/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Not found');
    });
  });

  describe('GET /api/v1/progress/communities/:communityId', () => {
    it('should get community progress for user', async () => {
      const response = await request(app)
        .get(`/api/v1/progress/communities/${testCommunity.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('communityId', testCommunity.id);
      expect(response.body.data).toHaveProperty('totalCourses');
      expect(response.body.data).toHaveProperty('totalLessons');
      expect(response.body.data).toHaveProperty('completedLessons');
      expect(response.body.data).toHaveProperty('completionPercentage');
      expect(response.body.data).toHaveProperty('courses');
      expect(Array.isArray(response.body.data.courses)).toBe(true);
    });
  });

  describe('GET /api/v1/progress/analytics', () => {
    it('should get user progress analytics', async () => {
      const response = await request(app)
        .get('/api/v1/progress/analytics')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalProgress');
      expect(response.body.data).toHaveProperty('completedLessons');
      expect(response.body.data).toHaveProperty('totalTimeSpent');
      expect(response.body.data).toHaveProperty('averageTimePerLesson');
      expect(response.body.data).toHaveProperty('recentActivity');
      expect(Array.isArray(response.body.data.recentActivity)).toBe(true);
    });

    it('should support filtering by course', async () => {
      const response = await request(app)
        .get(`/api/v1/progress/analytics?courseId=${testCourse.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should support filtering by community', async () => {
      const response = await request(app)
        .get(`/api/v1/progress/analytics?communityId=${testCommunity.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/v1/progress/analytics?limit=5&offset=0')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/progress/communities/:communityId/leaderboard', () => {
    it('should get community leaderboard', async () => {
      const response = await request(app)
        .get(`/api/v1/progress/communities/${testCommunity.id}/leaderboard`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should support custom limit', async () => {
      const response = await request(app)
        .get(`/api/v1/progress/communities/${testCommunity.id}/leaderboard?limit=5`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Progress Analytics', () => {
    it('should calculate completion percentage correctly', async () => {
      // Create additional lessons
      const lesson2 = await createTestLesson(testCourse.id);
      const lesson3 = await createTestLesson(testCourse.id);

      // Complete first lesson
      await request(app)
        .put(`/api/v1/progress/lessons/${testLesson.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ completed: true });

      // Get course progress
      const response = await request(app)
        .get(`/api/v1/progress/courses/${testCourse.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.totalLessons).toBe(3);
      expect(response.body.data.completedLessons).toBe(1);
      expect(response.body.data.completionPercentage).toBe(33); // 1/3 = 33%
    });

    it('should track time spent accurately', async () => {
      // Add time to lesson
      await request(app)
        .put(`/api/v1/progress/lessons/${testLesson.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ timeSpent: 600 }); // 10 minutes

      // Get course progress
      const response = await request(app)
        .get(`/api/v1/progress/courses/${testCourse.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.totalTimeSpent).toBeGreaterThanOrEqual(600);
    });
  });
});