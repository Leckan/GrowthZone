import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Database Connection', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should connect to database successfully', async () => {
    // Test basic database connection
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    expect(result).toBeDefined();
  });

  it('should have all required tables', async () => {
    // Test that all tables exist by querying their counts
    const userCount = await prisma.user.count();
    const communityCount = await prisma.community.count();
    const courseCount = await prisma.course.count();
    const lessonCount = await prisma.lesson.count();
    const postCount = await prisma.post.count();
    const commentCount = await prisma.comment.count();

    expect(userCount).toBeGreaterThanOrEqual(0);
    expect(communityCount).toBeGreaterThanOrEqual(0);
    expect(courseCount).toBeGreaterThanOrEqual(0);
    expect(lessonCount).toBeGreaterThanOrEqual(0);
    expect(postCount).toBeGreaterThanOrEqual(0);
    expect(commentCount).toBeGreaterThanOrEqual(0);
  });

  it('should enforce unique constraints', async () => {
    // Test unique email constraint
    const testUser = {
      email: 'test-unique@example.com',
      passwordHash: 'hashedpassword',
      username: 'testuser123',
    };

    // Create first user
    const user1 = await prisma.user.create({ data: testUser });
    expect(user1.id).toBeDefined();

    // Try to create duplicate email - should fail
    await expect(
      prisma.user.create({
        data: {
          ...testUser,
          username: 'differentusername',
        },
      })
    ).rejects.toThrow();

    // Try to create duplicate username - should fail
    await expect(
      prisma.user.create({
        data: {
          ...testUser,
          email: 'different@example.com',
        },
      })
    ).rejects.toThrow();

    // Cleanup
    await prisma.user.delete({ where: { id: user1.id } });
  });

  it('should handle relationships correctly', async () => {
    // Create a test user
    const user = await prisma.user.create({
      data: {
        email: 'relationship-test@example.com',
        passwordHash: 'hashedpassword',
        username: 'relationshiptest',
      },
    });

    // Create a community
    const community = await prisma.community.create({
      data: {
        name: 'Test Community',
        slug: 'test-community-relationships',
        creatorId: user.id,
      },
    });

    // Create a membership
    const membership = await prisma.communityMembership.create({
      data: {
        userId: user.id,
        communityId: community.id,
        role: 'member',
        status: 'active',
      },
    });

    // Test that relationships work
    const userWithCommunities = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        createdCommunities: true,
        memberships: {
          include: {
            community: true,
          },
        },
      },
    });

    expect(userWithCommunities?.createdCommunities).toHaveLength(1);
    expect(userWithCommunities?.memberships).toHaveLength(1);
    expect(userWithCommunities?.memberships[0].community.name).toBe('Test Community');

    // Cleanup
    await prisma.communityMembership.delete({ where: { id: membership.id } });
    await prisma.community.delete({ where: { id: community.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});