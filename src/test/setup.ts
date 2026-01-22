import { PrismaClient } from '@prisma/client';
import * as fc from 'fast-check';

// Set test environment
process.env.NODE_ENV = 'test';

// Test database setup
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/community_learning_platform_test'
    }
  }
});

// Configure fast-check for property-based testing
fc.configureGlobal({
  numRuns: 100, // Minimum 100 iterations as specified in design
  verbose: true, // Show detailed output for failures
  seed: 42, // Fixed seed for reproducible tests
  endOnFailure: true, // Stop on first failure for faster debugging
});

// Global test setup
beforeAll(async () => {
  // Connect to test database
  await prisma.$connect();
});

afterAll(async () => {
  // Cleanup and disconnect
  await prisma.$disconnect();
});

// Clean database between tests
afterEach(async () => {
  // Delete all data in reverse order of dependencies
  await cleanupTestData();
});

export { prisma, fc };

// Test helper functions
export async function createTestUser(overrides: any = {}) {
  return await prisma.user.create({
    data: {
      email: overrides.email || 'test@example.com',
      passwordHash: overrides.passwordHash || '$2a$10$test.hash.here',
      username: overrides.username || 'testuser',
      displayName: overrides.displayName || 'Test User',
      emailVerified: true,
      ...overrides
    }
  });
}

export async function createTestCommunity(creatorId: string, overrides: any = {}) {
  return await prisma.community.create({
    data: {
      name: overrides.name || 'Test Community',
      description: overrides.description || 'A test community',
      slug: overrides.slug || 'test-community',
      creatorId,
      isPublic: overrides.isPublic !== undefined ? overrides.isPublic : true,
      ...overrides
    }
  });
}

export async function createTestCourse(communityId: string, overrides: any = {}) {
  return await prisma.course.create({
    data: {
      communityId,
      title: overrides.title || 'Test Course',
      description: overrides.description || 'A test course',
      isPublished: overrides.isPublished !== undefined ? overrides.isPublished : true,
      sortOrder: overrides.sortOrder || 0,
      ...overrides
    }
  });
}

export async function createTestLesson(courseId: string, overrides: any = {}) {
  return await prisma.lesson.create({
    data: {
      courseId,
      title: overrides.title || 'Test Lesson',
      content: overrides.content || 'Test lesson content',
      contentType: overrides.contentType || 'text',
      isFree: overrides.isFree !== undefined ? overrides.isFree : true,
      sortOrder: overrides.sortOrder || 0,
      ...overrides
    }
  });
}

export async function createTestPost(communityId: string, authorId: string, overrides: any = {}) {
  return await prisma.post.create({
    data: {
      communityId,
      authorId,
      title: overrides.title || 'Test Post',
      content: overrides.content || 'Test post content',
      postType: overrides.postType || 'discussion',
      ...overrides
    }
  });
}

export async function createTestComment(postId: string, authorId: string, overrides: any = {}) {
  return await prisma.comment.create({
    data: {
      postId,
      authorId,
      content: overrides.content || 'Test comment content',
      parentId: overrides.parentId || null,
      ...overrides
    }
  });
}

export async function createTestMembership(userId: string, communityId: string, overrides: any = {}) {
  return await prisma.communityMembership.create({
    data: {
      userId,
      communityId,
      role: overrides.role || 'member',
      status: overrides.status || 'active',
      ...overrides
    }
  });
}

export async function cleanupTestData() {
  // This is already handled by afterEach, but can be called manually if needed
  await prisma.commentLike.deleteMany();
  await prisma.postLike.deleteMany();
  await prisma.contentReport.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.pointsTransaction.deleteMany();
  await prisma.userProgress.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.post.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.course.deleteMany();
  await prisma.communityMembership.deleteMany();
  await prisma.community.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.userBookmark.deleteMany();
  await prisma.userInterest.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
}

// Property-based testing generators for common data types
export const generators = {
  // User data generators
  email: () => fc.emailAddress(),
  username: () => fc.stringOf(fc.char().filter(c => /[a-zA-Z0-9_]/.test(c)), { minLength: 3, maxLength: 20 }),
  displayName: () => fc.string({ minLength: 1, maxLength: 50 }),
  bio: () => fc.string({ maxLength: 500 }),
  
  // Community data generators
  communityName: () => fc.string({ minLength: 1, maxLength: 100 }),
  communitySlug: () => fc.stringOf(fc.char().filter(c => /[a-z0-9-]/.test(c)), { minLength: 3, maxLength: 50 }),
  communityDescription: () => fc.string({ maxLength: 1000 }),
  
  // Course data generators
  courseTitle: () => fc.string({ minLength: 1, maxLength: 200 }),
  lessonTitle: () => fc.string({ minLength: 1, maxLength: 200 }),
  content: () => fc.string({ minLength: 1, maxLength: 5000 }),
  
  // Post data generators
  postTitle: () => fc.string({ minLength: 1, maxLength: 200 }),
  postContent: () => fc.string({ minLength: 1, maxLength: 10000 }),
  
  // Common generators
  positiveInteger: () => fc.integer({ min: 1, max: 1000000 }),
  nonNegativeInteger: () => fc.integer({ min: 0, max: 1000000 }),
  boolean: () => fc.boolean(),
  price: () => fc.float({ min: 0, max: 9999.99, noNaN: true }).map(n => Math.round(n * 100) / 100),
  
  // Role generators
  memberRole: () => fc.constantFrom('member', 'moderator', 'admin'),
  memberStatus: () => fc.constantFrom('pending', 'active', 'suspended'),
  contentType: () => fc.constantFrom('text', 'video', 'file'),
  postType: () => fc.constantFrom('discussion', 'announcement'),
};