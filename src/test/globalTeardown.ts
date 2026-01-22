import { PrismaClient } from '@prisma/client';

export default async function globalTeardown() {
  console.log('Cleaning up test database...');
  
  try {
    const prisma = new PrismaClient();
    await prisma.$connect();
    
    // Clean up all test data
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
    
    await prisma.$disconnect();
    console.log('Test database cleanup complete');
  } catch (error) {
    console.error('Failed to cleanup test database:', error);
    // Don't throw here as it might prevent other cleanup
  }
}