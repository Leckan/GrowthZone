import { prisma, fc } from './setup';
import { DatabaseTestUtils, PropertyGenerators, TestAssertions } from './testUtils';
import { propertyTestConfig, assertProperty } from './propertyTestConfig';

describe('Testing Framework Configuration', () => {
  let dbUtils: DatabaseTestUtils;

  beforeAll(() => {
    dbUtils = new DatabaseTestUtils(prisma);
  });

  describe('Jest Configuration', () => {
    it('should have TypeScript support', () => {
      // This test passing means TypeScript compilation works
      const testValue: string = 'TypeScript is working';
      expect(testValue).toBe('TypeScript is working');
    });

    it('should have database connection', async () => {
      const result = await prisma.$queryRaw`SELECT 1 as test`;
      expect(result).toBeDefined();
    });

    it('should clean database between tests', async () => {
      // Create a test user
      const user = await dbUtils.createUser();
      expect(user.id).toBeDefined();
      
      // The afterEach hook should clean this up automatically
      // This test verifies the cleanup works by checking in the next test
    });

    it('should have clean database from previous test', async () => {
      const userCount = await prisma.user.count();
      expect(userCount).toBe(0);
    });
  });

  describe('Fast-check Configuration', () => {
    it('should be configured with correct settings', () => {
      expect(propertyTestConfig.numRuns).toBe(100);
      expect(propertyTestConfig.verbose).toBe(true);
      expect(propertyTestConfig.seed).toBe(42);
    });

    it('should generate valid test data', () => {
      const emailGen = fc.emailAddress();
      const sample = fc.sample(emailGen, 5);
      
      expect(sample).toHaveLength(5);
      sample.forEach(email => {
        expect(email).toMatch(/@/);
      });
    });

    it('should run property-based tests', () => {
      assertProperty(
        fc.property(fc.integer(), fc.integer(), (a, b) => {
          return a + b === b + a; // Commutative property
        })
      );
    });
  });

  describe('Test Utilities', () => {
    it('should create valid test users', async () => {
      const user = await dbUtils.createUser();
      
      TestAssertions.hasRequiredFields(user, ['id', 'email', 'username']);
      expect(user.email).toMatch(/@/);
      expect(user.username).toMatch(/^[a-zA-Z0-9_]+$/);
    });

    it('should create valid test communities', async () => {
      const user = await dbUtils.createUser();
      const community = await dbUtils.createCommunity(user.id);
      
      TestAssertions.hasRequiredFields(community, ['id', 'name', 'slug', 'creatorId']);
      expect(community.creatorId).toBe(user.id);
    });

    it('should create complete test hierarchy', async () => {
      const hierarchy = await dbUtils.createTestHierarchy();
      
      expect(hierarchy.user.id).toBeDefined();
      expect(hierarchy.community.creatorId).toBe(hierarchy.user.id);
      expect(hierarchy.course.communityId).toBe(hierarchy.community.id);
      expect(hierarchy.lesson.courseId).toBe(hierarchy.course.id);
    });
  });

  describe('Property Generators', () => {
    it('should generate valid user registration data', () => {
      const userGen = PropertyGenerators.userRegistration();
      const samples = fc.sample(userGen, 10);
      
      samples.forEach(user => {
        expect(user.email).toMatch(/@/);
        expect(user.username).toMatch(/^[a-zA-Z0-9_]{3,20}$/);
        expect(user.password.length).toBeGreaterThanOrEqual(8);
        expect(user.displayName.length).toBeGreaterThan(0);
      });
    });

    it('should generate invalid emails for error testing', () => {
      const invalidEmailGen = PropertyGenerators.invalidEmails();
      const samples = fc.sample(invalidEmailGen, 10);
      
      samples.forEach(email => {
        // These should all be invalid email formats using simple validation
        const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        expect(isValid).toBe(false);
      });
    });

    it('should generate whitespace strings', () => {
      const whitespaceGen = PropertyGenerators.whitespaceStrings();
      const samples = fc.sample(whitespaceGen, 5);
      
      samples.forEach(str => {
        expect(str.trim()).toBe('');
        expect(str.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Database Cleanup', () => {
    it('should handle cleanup of complex relationships', async () => {
      // Create a complex set of related data
      const user1 = await dbUtils.createUser();
      const user2 = await dbUtils.createUser();
      const community = await dbUtils.createCommunity(user1.id);
      
      // Create membership
      await prisma.communityMembership.create({
        data: {
          userId: user2.id,
          communityId: community.id,
          role: 'member',
          status: 'active'
        }
      });
      
      // Create course and lesson
      const course = await dbUtils.createCourse(community.id);
      const lesson = await dbUtils.createLesson(course.id);
      
      // Create post and comment
      const post = await prisma.post.create({
        data: {
          communityId: community.id,
          authorId: user1.id,
          content: 'Test post content'
        }
      });
      
      const comment = await prisma.comment.create({
        data: {
          postId: post.id,
          authorId: user2.id,
          content: 'Test comment content'
        }
      });
      
      // Verify data exists
      expect(await prisma.user.count()).toBe(2);
      expect(await prisma.community.count()).toBe(1);
      expect(await prisma.communityMembership.count()).toBe(1);
      expect(await prisma.course.count()).toBe(1);
      expect(await prisma.lesson.count()).toBe(1);
      expect(await prisma.post.count()).toBe(1);
      expect(await prisma.comment.count()).toBe(1);
      
      // Cleanup should handle all relationships correctly
      await dbUtils.cleanup();
      
      // Verify everything is cleaned up
      expect(await prisma.user.count()).toBe(0);
      expect(await prisma.community.count()).toBe(0);
      expect(await prisma.communityMembership.count()).toBe(0);
      expect(await prisma.course.count()).toBe(0);
      expect(await prisma.lesson.count()).toBe(0);
      expect(await prisma.post.count()).toBe(0);
      expect(await prisma.comment.count()).toBe(0);
    });
  });
});