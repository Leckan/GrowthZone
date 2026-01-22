import { PrismaClient } from '@prisma/client';
import * as fc from 'fast-check';
import bcrypt from 'bcryptjs';

/**
 * Test utilities for the community learning platform
 * Provides common patterns and helpers for both unit and property-based testing
 */

export interface TestUser {
  id: string;
  email: string;
  username: string;
  displayName?: string;
  passwordHash: string;
}

export interface TestCommunity {
  id: string;
  name: string;
  slug: string;
  creatorId: string;
  isPublic: boolean;
}

export interface TestCourse {
  id: string;
  communityId: string;
  title: string;
  isPublished: boolean;
}

export interface TestLesson {
  id: string;
  courseId: string;
  title: string;
  content: string;
  isFree: boolean;
}

/**
 * Database test utilities
 */
export class DatabaseTestUtils {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a test user with valid data
   */
  async createUser(overrides: Partial<TestUser> = {}): Promise<TestUser> {
    const defaultPassword = 'testpassword123';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);
    
    const userData = {
      email: `test-${Date.now()}@example.com`,
      username: `testuser${Date.now()}`,
      displayName: 'Test User',
      passwordHash,
      emailVerified: true,
      ...overrides
    };

    const user = await this.prisma.user.create({ data: userData });
    return user as TestUser;
  }

  /**
   * Create a test community with valid data
   */
  async createCommunity(creatorId: string, overrides: Partial<TestCommunity> = {}): Promise<TestCommunity> {
    const communityData = {
      name: `Test Community ${Date.now()}`,
      slug: `test-community-${Date.now()}`,
      description: 'A test community for testing purposes',
      creatorId,
      isPublic: true,
      ...overrides
    };

    const community = await this.prisma.community.create({ data: communityData });
    return community as TestCommunity;
  }

  /**
   * Create a test course with valid data
   */
  async createCourse(communityId: string, overrides: Partial<TestCourse> = {}): Promise<TestCourse> {
    const courseData = {
      communityId,
      title: `Test Course ${Date.now()}`,
      description: 'A test course for testing purposes',
      isPublished: true,
      sortOrder: 0,
      ...overrides
    };

    const course = await this.prisma.course.create({ data: courseData });
    return course as TestCourse;
  }

  /**
   * Create a test lesson with valid data
   */
  async createLesson(courseId: string, overrides: Partial<TestLesson> = {}): Promise<TestLesson> {
    const lessonData = {
      courseId,
      title: `Test Lesson ${Date.now()}`,
      content: 'Test lesson content for testing purposes',
      contentType: 'text',
      isFree: true,
      sortOrder: 0,
      ...overrides
    };

    const lesson = await this.prisma.lesson.create({ data: lessonData });
    return lesson as TestLesson;
  }

  /**
   * Create a complete test hierarchy: user -> community -> course -> lesson
   */
  async createTestHierarchy() {
    const user = await this.createUser();
    const community = await this.createCommunity(user.id);
    const course = await this.createCourse(community.id);
    const lesson = await this.createLesson(course.id);

    return { user, community, course, lesson };
  }

  /**
   * Clean up all test data
   */
  async cleanup() {
    // Delete in reverse dependency order
    await this.prisma.commentLike.deleteMany();
    await this.prisma.postLike.deleteMany();
    await this.prisma.contentReport.deleteMany();
    await this.prisma.subscription.deleteMany();
    await this.prisma.pointsTransaction.deleteMany();
    await this.prisma.userProgress.deleteMany();
    await this.prisma.comment.deleteMany();
    await this.prisma.post.deleteMany();
    await this.prisma.lesson.deleteMany();
    await this.prisma.course.deleteMany();
    await this.prisma.communityMembership.deleteMany();
    await this.prisma.community.deleteMany();
    await this.prisma.notification.deleteMany();
    await this.prisma.notificationPreference.deleteMany();
    await this.prisma.userBookmark.deleteMany();
    await this.prisma.userInterest.deleteMany();
    await this.prisma.auditLog.deleteMany();
    await this.prisma.user.deleteMany();
  }
}

/**
 * Property-based testing generators
 */
export class PropertyGenerators {
  /**
   * Generate valid user registration data
   */
  static userRegistration() {
    return fc.record({
      email: fc.emailAddress(),
      username: fc.stringOf(
        fc.char().filter(c => /[a-zA-Z0-9_]/.test(c)), 
        { minLength: 3, maxLength: 20 }
      ),
      password: fc.string({ minLength: 8, maxLength: 50 }),
      displayName: fc.string({ minLength: 1, maxLength: 50 })
    });
  }

  /**
   * Generate valid community data
   */
  static communityData() {
    return fc.record({
      name: fc.string({ minLength: 1, maxLength: 100 }),
      description: fc.string({ maxLength: 1000 }),
      isPublic: fc.boolean(),
      requiresApproval: fc.boolean(),
      priceMonthly: fc.option(fc.float({ min: 0, max: 999.99 })),
      priceYearly: fc.option(fc.float({ min: 0, max: 9999.99 }))
    });
  }

  /**
   * Generate valid course data
   */
  static courseData() {
    return fc.record({
      title: fc.string({ minLength: 1, maxLength: 200 }),
      description: fc.string({ maxLength: 1000 }),
      isPublished: fc.boolean(),
      sortOrder: fc.integer({ min: 0, max: 1000 })
    });
  }

  /**
   * Generate valid lesson data
   */
  static lessonData() {
    return fc.record({
      title: fc.string({ minLength: 1, maxLength: 200 }),
      content: fc.string({ minLength: 1, maxLength: 5000 }),
      contentType: fc.constantFrom('text', 'video', 'file'),
      isFree: fc.boolean(),
      sortOrder: fc.integer({ min: 0, max: 1000 })
    });
  }

  /**
   * Generate invalid email addresses for error testing
   */
  static invalidEmails() {
    return fc.oneof(
      fc.constant(''),
      fc.constant('invalid'),
      fc.constant('@example.com'),
      fc.constant('test@'),
      fc.constant('test@com'),
      fc.constant('test.com'),
      fc.constant('@'),
      fc.constant('test@@example.com'),
      fc.string({ minLength: 1, maxLength: 10 }).filter(s => !s.includes('@'))
    );
  }

  /**
   * Generate invalid usernames for error testing
   */
  static invalidUsernames() {
    return fc.oneof(
      fc.constant(''),
      fc.constant('a'), // too short
      fc.string({ minLength: 21 }), // too long
      fc.string().filter(s => /[^a-zA-Z0-9_]/.test(s)) // invalid characters
    );
  }

  /**
   * Generate whitespace-only strings for validation testing
   */
  static whitespaceStrings() {
    return fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1 });
  }
}

/**
 * Common test assertions
 */
export class TestAssertions {
  /**
   * Assert that an object has all required fields
   */
  static hasRequiredFields(obj: any, fields: string[]) {
    for (const field of fields) {
      expect(obj).toHaveProperty(field);
      expect(obj[field]).toBeDefined();
    }
  }

  /**
   * Assert that a database record exists
   */
  static async recordExists(prisma: PrismaClient, model: string, id: string) {
    const record = await (prisma as any)[model].findUnique({ where: { id } });
    expect(record).toBeTruthy();
    return record;
  }

  /**
   * Assert that a database record does not exist
   */
  static async recordNotExists(prisma: PrismaClient, model: string, id: string) {
    const record = await (prisma as any)[model].findUnique({ where: { id } });
    expect(record).toBeNull();
  }

  /**
   * Assert that an error has expected properties
   */
  static isValidationError(error: any, expectedField?: string) {
    expect(error).toBeDefined();
    expect(error.message).toBeDefined();
    if (expectedField) {
      expect(error.message.toLowerCase()).toContain(expectedField.toLowerCase());
    }
  }

  /**
   * Assert that a response follows API format
   */
  static isValidApiResponse(response: any, expectedStatus: number = 200) {
    expect(response.status).toBe(expectedStatus);
    if (expectedStatus >= 200 && expectedStatus < 300) {
      expect(response.body).toBeDefined();
    }
  }
}

/**
 * Performance testing utilities
 */
export class PerformanceTestUtils {
  /**
   * Measure execution time of an async function
   */
  static async measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; timeMs: number }> {
    const start = Date.now();
    const result = await fn();
    const timeMs = Date.now() - start;
    return { result, timeMs };
  }

  /**
   * Assert that an operation completes within expected time
   */
  static async assertPerformance<T>(
    fn: () => Promise<T>, 
    maxTimeMs: number, 
    description: string = 'Operation'
  ): Promise<T> {
    const { result, timeMs } = await this.measureTime(fn);
    expect(timeMs).toBeLessThan(maxTimeMs);
    console.log(`${description} completed in ${timeMs}ms (limit: ${maxTimeMs}ms)`);
    return result;
  }
}