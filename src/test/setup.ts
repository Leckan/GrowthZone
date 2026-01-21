import { PrismaClient } from '@prisma/client';

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
  await prisma.commentLike.deleteMany();
  await prisma.postLike.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.pointsTransaction.deleteMany();
  await prisma.userProgress.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.post.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.course.deleteMany();
  await prisma.communityMembership.deleteMany();
  await prisma.community.deleteMany();
  await prisma.user.deleteMany();
});

export { prisma };

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

export async function cleanupTestData() {
  // This is already handled by afterEach, but can be called manually if needed
  await prisma.commentLike.deleteMany();
  await prisma.postLike.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.pointsTransaction.deleteMany();
  await prisma.userProgress.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.post.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.course.deleteMany();
  await prisma.communityMembership.deleteMany();
  await prisma.community.deleteMany();
  await prisma.user.deleteMany();
}