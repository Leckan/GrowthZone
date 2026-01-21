import request from 'supertest';
import app from '../index';
import prisma from '../lib/prisma';
import { generateAccessToken } from '../lib/auth';

describe('Course Routes', () => {
  let testUser: any;
  let testCommunity: any;
  let authToken: string;

  beforeAll(async () => {
    // Clean up any existing test data
    await prisma.lesson.deleteMany({});
    await prisma.course.deleteMany({});
    await prisma.communityMembership.deleteMany({});
    await prisma.community.deleteMany({});
    await prisma.user.deleteMany({});

    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: 'coursetest@example.com',
        passwordHash: 'hashedpassword',
        username: 'coursetest',
        displayName: 'Course Test User',
        emailVerified: true
      }
    });

    // Generate auth token
    authToken = generateAccessToken({
      userId: testUser.id,
      email: testUser.email,
      username: testUser.username
    });

    // Create test community
    testCommunity = await prisma.community.create({
      data: {
        name: 'Test Community',
        slug: 'test-community-courses',
        creatorId: testUser.id,
        isPublic: true
      }
    });

    // Add user as admin member
    await prisma.communityMembership.create({
      data: {
        userId: testUser.id,
        communityId: testCommunity.id,
        role: 'admin',
        status: 'active'
      }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.lesson.deleteMany({});
    await prisma.course.deleteMany({});
    await prisma.communityMembership.deleteMany({});
    await prisma.community.deleteMany({});
    await prisma.user.deleteMany({});
  });

  describe('POST /api/v1/courses/community/:communityId', () => {
    it('should create a new course', async () => {
      const courseData = {
        title: 'Test Course',
        description: 'A test course for learning'
      };

      const response = await request(app)
        .post(`/api/v1/courses/community/${testCommunity.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(courseData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(courseData.title);
      expect(response.body.data.description).toBe(courseData.description);
      expect(response.body.data.communityId).toBe(testCommunity.id);
      expect(response.body.data.isPublished).toBe(false);
    });

    it('should require authentication', async () => {
      const courseData = {
        title: 'Test Course',
        description: 'A test course for learning'
      };

      await request(app)
        .post(`/api/v1/courses/community/${testCommunity.id}`)
        .send(courseData)
        .expect(401);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post(`/api/v1/courses/community/${testCommunity.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details.title).toBeDefined();
    });
  });

  describe('GET /api/v1/courses/community/:communityId', () => {
    it('should get courses for a community', async () => {
      // First create a published course
      await prisma.course.create({
        data: {
          title: 'Published Course',
          description: 'A published course',
          communityId: testCommunity.id,
          isPublished: true,
          sortOrder: 1
        }
      });

      const response = await request(app)
        .get(`/api/v1/courses/community/${testCommunity.id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.courses.length).toBeGreaterThan(0);
    });
  });

  describe('Course and Lesson CRUD', () => {
    let testCourse: any;

    beforeAll(async () => {
      testCourse = await prisma.course.create({
        data: {
          title: 'CRUD Test Course',
          description: 'A course for testing CRUD operations',
          communityId: testCommunity.id,
          isPublished: false,
          sortOrder: 1
        }
      });
    });

    it('should create a lesson in a course', async () => {
      const lessonData = {
        title: 'Test Lesson',
        content: 'This is test lesson content',
        contentType: 'text',
        isFree: true
      };

      const response = await request(app)
        .post(`/api/v1/courses/${testCourse.id}/lessons`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(lessonData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(lessonData.title);
      expect(response.body.data.content).toBe(lessonData.content);
      expect(response.body.data.courseId).toBe(testCourse.id);
    });

    it('should get lessons for a course', async () => {
      const response = await request(app)
        .get(`/api/v1/courses/${testCourse.id}/lessons`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });
  });
});