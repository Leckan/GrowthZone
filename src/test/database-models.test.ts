import { PrismaClient } from '@prisma/client';
import { DatabaseTestUtils, TestAssertions } from './testUtils';
import { hashPassword } from '../lib/auth';

/**
 * Unit tests for database models
 * Testing model validation, relationships, and constraints
 * Requirements: 1.1, 2.1, 3.1
 */

describe('Database Models', () => {
  let prisma: PrismaClient;
  let dbUtils: DatabaseTestUtils;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    dbUtils = new DatabaseTestUtils(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await dbUtils.cleanup();
  });

  afterEach(async () => {
    await dbUtils.cleanup();
  });

  describe('User Model', () => {
    it('should create user with valid data', async () => {
      const passwordHash = await hashPassword('testpassword123');
      const userData = {
        email: 'test@example.com',
        username: 'testuser',
        displayName: 'Test User',
        passwordHash,
        emailVerified: true
      };

      const user = await prisma.user.create({ data: userData });

      TestAssertions.hasRequiredFields(user, ['id', 'email', 'username', 'passwordHash', 'createdAt', 'updatedAt']);
      expect(user.email).toBe(userData.email);
      expect(user.username).toBe(userData.username);
      expect(user.displayName).toBe(userData.displayName);
      expect(user.totalPoints).toBe(0);
      expect(user.emailVerified).toBe(true);
    });

    it('should enforce unique email constraint', async () => {
      const passwordHash = await hashPassword('testpassword123');
      const userData = {
        email: 'duplicate@example.com',
        username: 'user1',
        passwordHash
      };

      await prisma.user.create({ data: userData });

      await expect(
        prisma.user.create({
          data: {
            ...userData,
            username: 'user2'
          }
        })
      ).rejects.toThrow();
    });

    it('should enforce unique username constraint', async () => {
      const passwordHash = await hashPassword('testpassword123');
      const userData = {
        email: 'user1@example.com',
        username: 'duplicateuser',
        passwordHash
      };

      await prisma.user.create({ data: userData });

      await expect(
        prisma.user.create({
          data: {
            ...userData,
            email: 'user2@example.com'
          }
        })
      ).rejects.toThrow();
    });

    it('should set default values correctly', async () => {
      const passwordHash = await hashPassword('testpassword123');
      const user = await prisma.user.create({
        data: {
          email: 'defaults@example.com',
          username: 'defaultuser',
          passwordHash
        }
      });

      expect(user.totalPoints).toBe(0);
      expect(user.emailVerified).toBe(false);
      expect(user.displayName).toBeNull();
      expect(user.bio).toBeNull();
      expect(user.avatarUrl).toBeNull();
    });
  });

  describe('Community Model', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await dbUtils.createUser();
    });

    it('should create community with valid data', async () => {
      const communityData = {
        name: 'Test Community',
        slug: 'test-community',
        description: 'A test community',
        creatorId: testUser.id,
        isPublic: true,
        requiresApproval: false
      };

      const community = await prisma.community.create({ data: communityData });

      TestAssertions.hasRequiredFields(community, ['id', 'name', 'slug', 'creatorId', 'createdAt', 'updatedAt']);
      expect(community.name).toBe(communityData.name);
      expect(community.slug).toBe(communityData.slug);
      expect(community.creatorId).toBe(testUser.id);
      expect(community.memberCount).toBe(0);
    });

    it('should enforce unique slug constraint', async () => {
      const communityData = {
        name: 'Community 1',
        slug: 'duplicate-slug',
        creatorId: testUser.id
      };

      await prisma.community.create({ data: communityData });

      await expect(
        prisma.community.create({
          data: {
            ...communityData,
            name: 'Community 2'
          }
        })
      ).rejects.toThrow();
    });

    it('should cascade delete when creator is deleted', async () => {
      const community = await dbUtils.createCommunity(testUser.id);

      await prisma.user.delete({ where: { id: testUser.id } });

      await TestAssertions.recordNotExists(prisma, 'community', community.id);
    });

    it('should handle pricing fields correctly', async () => {
      const community = await prisma.community.create({
        data: {
          name: 'Paid Community',
          slug: 'paid-community',
          creatorId: testUser.id,
          priceMonthly: 29.99,
          priceYearly: 299.99
        }
      });

      expect(community.priceMonthly?.toNumber()).toBe(29.99);
      expect(community.priceYearly?.toNumber()).toBe(299.99);
    });
  });

  describe('Community Membership Model', () => {
    let testUser: any;
    let testCommunity: any;

    beforeEach(async () => {
      testUser = await dbUtils.createUser();
      testCommunity = await dbUtils.createCommunity(testUser.id);
    });

    it('should create membership with valid data', async () => {
      const membershipData = {
        userId: testUser.id,
        communityId: testCommunity.id,
        role: 'member',
        status: 'active'
      };

      const membership = await prisma.communityMembership.create({ data: membershipData });

      TestAssertions.hasRequiredFields(membership, ['id', 'userId', 'communityId', 'role', 'status', 'joinedAt']);
      expect(membership.userId).toBe(testUser.id);
      expect(membership.communityId).toBe(testCommunity.id);
      expect(membership.role).toBe('member');
      expect(membership.status).toBe('active');
    });

    it('should enforce unique user-community constraint', async () => {
      const membershipData = {
        userId: testUser.id,
        communityId: testCommunity.id,
        role: 'member'
      };

      await prisma.communityMembership.create({ data: membershipData });

      await expect(
        prisma.communityMembership.create({ data: membershipData })
      ).rejects.toThrow();
    });

    it('should cascade delete when user is deleted', async () => {
      const membership = await prisma.communityMembership.create({
        data: {
          userId: testUser.id,
          communityId: testCommunity.id
        }
      });

      await prisma.user.delete({ where: { id: testUser.id } });

      await TestAssertions.recordNotExists(prisma, 'communityMembership', membership.id);
    });

    it('should cascade delete when community is deleted', async () => {
      const membership = await prisma.communityMembership.create({
        data: {
          userId: testUser.id,
          communityId: testCommunity.id
        }
      });

      await prisma.community.delete({ where: { id: testCommunity.id } });

      await TestAssertions.recordNotExists(prisma, 'communityMembership', membership.id);
    });
  });

  describe('Course Model', () => {
    let testUser: any;
    let testCommunity: any;

    beforeEach(async () => {
      testUser = await dbUtils.createUser();
      testCommunity = await dbUtils.createCommunity(testUser.id);
    });

    it('should create course with valid data', async () => {
      const courseData = {
        communityId: testCommunity.id,
        title: 'Test Course',
        description: 'A test course',
        isPublished: true,
        sortOrder: 1
      };

      const course = await prisma.course.create({ data: courseData });

      TestAssertions.hasRequiredFields(course, ['id', 'communityId', 'title', 'createdAt', 'updatedAt']);
      expect(course.title).toBe(courseData.title);
      expect(course.description).toBe(courseData.description);
      expect(course.isPublished).toBe(true);
      expect(course.sortOrder).toBe(1);
    });

    it('should set default values correctly', async () => {
      const course = await prisma.course.create({
        data: {
          communityId: testCommunity.id,
          title: 'Default Course'
        }
      });

      expect(course.isPublished).toBe(false);
      expect(course.sortOrder).toBe(0);
      expect(course.description).toBeNull();
    });

    it('should cascade delete when community is deleted', async () => {
      const course = await dbUtils.createCourse(testCommunity.id);

      await prisma.community.delete({ where: { id: testCommunity.id } });

      await TestAssertions.recordNotExists(prisma, 'course', course.id);
    });
  });

  describe('Lesson Model', () => {
    let testHierarchy: any;

    beforeEach(async () => {
      testHierarchy = await dbUtils.createTestHierarchy();
    });

    it('should create lesson with valid data', async () => {
      const lessonData = {
        courseId: testHierarchy.course.id,
        title: 'Test Lesson',
        content: 'Test lesson content',
        contentType: 'text',
        isFree: true,
        sortOrder: 1
      };

      const lesson = await prisma.lesson.create({ data: lessonData });

      TestAssertions.hasRequiredFields(lesson, ['id', 'courseId', 'title', 'createdAt', 'updatedAt']);
      expect(lesson.title).toBe(lessonData.title);
      expect(lesson.content).toBe(lessonData.content);
      expect(lesson.contentType).toBe('text');
      expect(lesson.isFree).toBe(true);
      expect(lesson.sortOrder).toBe(1);
    });

    it('should handle different content types', async () => {
      const videoLesson = await prisma.lesson.create({
        data: {
          courseId: testHierarchy.course.id,
          title: 'Video Lesson',
          contentType: 'video',
          videoUrl: 'https://example.com/video.mp4'
        }
      });

      const fileLesson = await prisma.lesson.create({
        data: {
          courseId: testHierarchy.course.id,
          title: 'File Lesson',
          contentType: 'file',
          fileUrl: 'https://example.com/document.pdf'
        }
      });

      expect(videoLesson.contentType).toBe('video');
      expect(videoLesson.videoUrl).toBe('https://example.com/video.mp4');
      expect(fileLesson.contentType).toBe('file');
      expect(fileLesson.fileUrl).toBe('https://example.com/document.pdf');
    });

    it('should cascade delete when course is deleted', async () => {
      const lesson = testHierarchy.lesson;

      await prisma.course.delete({ where: { id: testHierarchy.course.id } });

      await TestAssertions.recordNotExists(prisma, 'lesson', lesson.id);
    });
  });

  describe('Post Model', () => {
    let testUser: any;
    let testCommunity: any;

    beforeEach(async () => {
      testUser = await dbUtils.createUser();
      testCommunity = await dbUtils.createCommunity(testUser.id);
    });

    it('should create post with valid data', async () => {
      const postData = {
        communityId: testCommunity.id,
        authorId: testUser.id,
        title: 'Test Post',
        content: 'This is a test post content',
        postType: 'discussion'
      };

      const post = await prisma.post.create({ data: postData });

      TestAssertions.hasRequiredFields(post, ['id', 'communityId', 'authorId', 'content', 'createdAt', 'updatedAt']);
      expect(post.title).toBe(postData.title);
      expect(post.content).toBe(postData.content);
      expect(post.postType).toBe('discussion');
      expect(post.likeCount).toBe(0);
      expect(post.commentCount).toBe(0);
    });

    it('should handle different post types', async () => {
      const announcement = await prisma.post.create({
        data: {
          communityId: testCommunity.id,
          authorId: testUser.id,
          content: 'Important announcement',
          postType: 'announcement'
        }
      });

      expect(announcement.postType).toBe('announcement');
    });

    it('should cascade delete when author is deleted', async () => {
      const post = await prisma.post.create({
        data: {
          communityId: testCommunity.id,
          authorId: testUser.id,
          content: 'Test post'
        }
      });

      await prisma.user.delete({ where: { id: testUser.id } });

      await TestAssertions.recordNotExists(prisma, 'post', post.id);
    });
  });

  describe('Comment Model', () => {
    let testUser: any;
    let testCommunity: any;
    let testPost: any;

    beforeEach(async () => {
      testUser = await dbUtils.createUser();
      testCommunity = await dbUtils.createCommunity(testUser.id);
      testPost = await prisma.post.create({
        data: {
          communityId: testCommunity.id,
          authorId: testUser.id,
          content: 'Test post for comments'
        }
      });
    });

    it('should create comment with valid data', async () => {
      const commentData = {
        postId: testPost.id,
        authorId: testUser.id,
        content: 'This is a test comment'
      };

      const comment = await prisma.comment.create({ data: commentData });

      TestAssertions.hasRequiredFields(comment, ['id', 'postId', 'authorId', 'content', 'createdAt', 'updatedAt']);
      expect(comment.content).toBe(commentData.content);
      expect(comment.likeCount).toBe(0);
      expect(comment.parentId).toBeNull();
    });

    it('should support nested comments', async () => {
      const parentComment = await prisma.comment.create({
        data: {
          postId: testPost.id,
          authorId: testUser.id,
          content: 'Parent comment'
        }
      });

      const childComment = await prisma.comment.create({
        data: {
          postId: testPost.id,
          authorId: testUser.id,
          content: 'Child comment',
          parentId: parentComment.id
        }
      });

      expect(childComment.parentId).toBe(parentComment.id);

      // Test relationship
      const commentWithReplies = await prisma.comment.findUnique({
        where: { id: parentComment.id },
        include: { replies: true }
      });

      expect(commentWithReplies?.replies).toHaveLength(1);
      expect(commentWithReplies?.replies[0].id).toBe(childComment.id);
    });

    it('should cascade delete when post is deleted', async () => {
      const comment = await prisma.comment.create({
        data: {
          postId: testPost.id,
          authorId: testUser.id,
          content: 'Test comment'
        }
      });

      await prisma.post.delete({ where: { id: testPost.id } });

      await TestAssertions.recordNotExists(prisma, 'comment', comment.id);
    });
  });

  describe('User Progress Model', () => {
    let testHierarchy: any;

    beforeEach(async () => {
      testHierarchy = await dbUtils.createTestHierarchy();
    });

    it('should create progress record with valid data', async () => {
      const progressData = {
        userId: testHierarchy.user.id,
        lessonId: testHierarchy.lesson.id,
        completedAt: new Date(),
        timeSpent: 300 // 5 minutes
      };

      const progress = await prisma.userProgress.create({ data: progressData });

      TestAssertions.hasRequiredFields(progress, ['id', 'userId', 'lessonId', 'timeSpent']);
      expect(progress.userId).toBe(testHierarchy.user.id);
      expect(progress.lessonId).toBe(testHierarchy.lesson.id);
      expect(progress.timeSpent).toBe(300);
      expect(progress.completedAt).toBeDefined();
    });

    it('should enforce unique user-lesson constraint', async () => {
      const progressData = {
        userId: testHierarchy.user.id,
        lessonId: testHierarchy.lesson.id,
        timeSpent: 100
      };

      await prisma.userProgress.create({ data: progressData });

      await expect(
        prisma.userProgress.create({ data: progressData })
      ).rejects.toThrow();
    });

    it('should set default values correctly', async () => {
      const progress = await prisma.userProgress.create({
        data: {
          userId: testHierarchy.user.id,
          lessonId: testHierarchy.lesson.id
        }
      });

      expect(progress.timeSpent).toBe(0);
      expect(progress.completedAt).toBeNull();
    });
  });

  describe('Points Transaction Model', () => {
    let testUser: any;
    let testCommunity: any;

    beforeEach(async () => {
      testUser = await dbUtils.createUser();
      testCommunity = await dbUtils.createCommunity(testUser.id);
    });

    it('should create points transaction with valid data', async () => {
      const transactionData = {
        userId: testUser.id,
        communityId: testCommunity.id,
        points: 10,
        reason: 'Post creation',
        referenceId: 'post-123'
      };

      const transaction = await prisma.pointsTransaction.create({ data: transactionData });

      TestAssertions.hasRequiredFields(transaction, ['id', 'userId', 'communityId', 'points', 'reason', 'createdAt']);
      expect(transaction.points).toBe(10);
      expect(transaction.reason).toBe('Post creation');
      expect(transaction.referenceId).toBe('post-123');
    });

    it('should handle negative points for penalties', async () => {
      const transaction = await prisma.pointsTransaction.create({
        data: {
          userId: testUser.id,
          communityId: testCommunity.id,
          points: -5,
          reason: 'Content violation penalty'
        }
      });

      expect(transaction.points).toBe(-5);
    });

    it('should cascade delete when user is deleted', async () => {
      const transaction = await prisma.pointsTransaction.create({
        data: {
          userId: testUser.id,
          communityId: testCommunity.id,
          points: 10,
          reason: 'Test transaction'
        }
      });

      await prisma.user.delete({ where: { id: testUser.id } });

      await TestAssertions.recordNotExists(prisma, 'pointsTransaction', transaction.id);
    });
  });
});