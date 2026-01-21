import { PrismaClient } from '@prisma/client';

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