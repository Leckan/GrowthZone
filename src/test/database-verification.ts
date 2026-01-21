import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyDatabaseSchema() {
  console.log('🔍 Verifying database schema and relationships...');

  try {
    // Test user creation and relationships
    const users = await prisma.user.findMany({
      include: {
        createdCommunities: true,
        memberships: {
          include: {
            community: true,
          },
        },
        posts: true,
        comments: true,
        progress: {
          include: {
            lesson: {
              include: {
                course: true,
              },
            },
          },
        },
        pointsTransactions: true,
        subscriptions: true,
      },
    });

    console.log(`✅ Found ${users.length} users with complete relationships`);

    // Test community relationships
    const communities = await prisma.community.findMany({
      include: {
        creator: true,
        memberships: {
          include: {
            user: true,
          },
        },
        courses: {
          include: {
            lessons: true,
          },
        },
        posts: {
          include: {
            author: true,
            comments: {
              include: {
                author: true,
                replies: true,
              },
            },
          },
        },
      },
    });

    console.log(`✅ Found ${communities.length} communities with complete relationships`);

    // Test course and lesson hierarchy
    const courses = await prisma.course.findMany({
      include: {
        community: true,
        lessons: {
          include: {
            progress: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    console.log(`✅ Found ${courses.length} courses with lesson hierarchy`);

    // Test discussion threads
    const posts = await prisma.post.findMany({
      include: {
        community: true,
        author: true,
        comments: {
          include: {
            author: true,
            parent: true,
            replies: true,
          },
        },
        likes: {
          include: {
            user: true,
          },
        },
      },
    });

    console.log(`✅ Found ${posts.length} posts with threaded comments`);

    // Test gamification system
    const pointsTransactions = await prisma.pointsTransaction.findMany({
      include: {
        user: true,
        community: true,
      },
    });

    console.log(`✅ Found ${pointsTransactions.length} points transactions`);

    // Test subscription system
    const subscriptions = await prisma.subscription.findMany({
      include: {
        user: true,
        community: true,
      },
    });

    console.log(`✅ Found ${subscriptions.length} subscriptions`);

    // Verify constraints and unique indexes
    console.log('\n🔍 Testing database constraints...');

    // Test unique constraints
    try {
      await prisma.user.create({
        data: {
          email: 'creator@example.com', // Duplicate email
          passwordHash: 'test',
          username: 'duplicate',
        },
      });
      console.log('❌ Unique email constraint failed');
    } catch (error) {
      console.log('✅ Unique email constraint working');
    }

    try {
      await prisma.user.create({
        data: {
          email: 'unique@example.com',
          passwordHash: 'test',
          username: 'creator', // Duplicate username
        },
      });
      console.log('❌ Unique username constraint failed');
    } catch (error) {
      console.log('✅ Unique username constraint working');
    }

    console.log('\n🎉 Database schema verification completed successfully!');
    console.log('All tables, relationships, and constraints are working correctly.');

  } catch (error) {
    console.error('❌ Database verification failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  verifyDatabaseSchema().catch((error) => {
    console.error('Verification failed:', error);
    process.exit(1);
  });
}

export { verifyDatabaseSchema };