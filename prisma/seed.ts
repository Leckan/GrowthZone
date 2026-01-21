import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create test users
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  const creator = await prisma.user.upsert({
    where: { email: 'creator@example.com' },
    update: {},
    create: {
      email: 'creator@example.com',
      passwordHash: hashedPassword,
      username: 'creator',
      displayName: 'Community Creator',
      bio: 'I create amazing learning communities',
      emailVerified: true,
      totalPoints: 1000,
    },
  });

  const member1 = await prisma.user.upsert({
    where: { email: 'member1@example.com' },
    update: {},
    create: {
      email: 'member1@example.com',
      passwordHash: hashedPassword,
      username: 'member1',
      displayName: 'Active Member',
      bio: 'Love learning new things!',
      emailVerified: true,
      totalPoints: 500,
    },
  });

  const member2 = await prisma.user.upsert({
    where: { email: 'member2@example.com' },
    update: {},
    create: {
      email: 'member2@example.com',
      passwordHash: hashedPassword,
      username: 'member2',
      displayName: 'Engaged Learner',
      bio: 'Always asking great questions',
      emailVerified: true,
      totalPoints: 750,
    },
  });

  // Create test communities
  const community1 = await prisma.community.upsert({
    where: { slug: 'web-development-mastery' },
    update: {},
    create: {
      name: 'Web Development Mastery',
      description: 'Learn modern web development from scratch to advanced',
      slug: 'web-development-mastery',
      creatorId: creator.id,
      isPublic: true,
      requiresApproval: false,
      priceMonthly: 29.99,
      priceYearly: 299.99,
      memberCount: 2,
    },
  });

  const community2 = await prisma.community.upsert({
    where: { slug: 'data-science-bootcamp' },
    update: {},
    create: {
      name: 'Data Science Bootcamp',
      description: 'Comprehensive data science training with Python and R',
      slug: 'data-science-bootcamp',
      creatorId: creator.id,
      isPublic: false,
      requiresApproval: true,
      priceMonthly: 49.99,
      priceYearly: 499.99,
      memberCount: 1,
    },
  });

  // Create community memberships
  await prisma.communityMembership.upsert({
    where: {
      userId_communityId: {
        userId: member1.id,
        communityId: community1.id,
      },
    },
    update: {},
    create: {
      userId: member1.id,
      communityId: community1.id,
      role: 'member',
      status: 'active',
    },
  });

  await prisma.communityMembership.upsert({
    where: {
      userId_communityId: {
        userId: member2.id,
        communityId: community1.id,
      },
    },
    update: {},
    create: {
      userId: member2.id,
      communityId: community1.id,
      role: 'moderator',
      status: 'active',
    },
  });

  await prisma.communityMembership.upsert({
    where: {
      userId_communityId: {
        userId: member1.id,
        communityId: community2.id,
      },
    },
    update: {},
    create: {
      userId: member1.id,
      communityId: community2.id,
      role: 'member',
      status: 'active',
    },
  });

  // Create test courses
  const course1 = await prisma.course.upsert({
    where: { id: 'course1' },
    update: {},
    create: {
      id: 'course1',
      communityId: community1.id,
      title: 'JavaScript Fundamentals',
      description: 'Master the basics of JavaScript programming',
      isPublished: true,
      sortOrder: 1,
    },
  });

  const course2 = await prisma.course.upsert({
    where: { id: 'course2' },
    update: {},
    create: {
      id: 'course2',
      communityId: community1.id,
      title: 'React Development',
      description: 'Build modern web applications with React',
      isPublished: true,
      sortOrder: 2,
    },
  });

  // Create test lessons
  const lesson1 = await prisma.lesson.upsert({
    where: { id: 'lesson1' },
    update: {},
    create: {
      id: 'lesson1',
      courseId: course1.id,
      title: 'Variables and Data Types',
      content: 'Learn about JavaScript variables, strings, numbers, and booleans.',
      contentType: 'text',
      isFree: true,
      sortOrder: 1,
    },
  });

  const lesson2 = await prisma.lesson.upsert({
    where: { id: 'lesson2' },
    update: {},
    create: {
      id: 'lesson2',
      courseId: course1.id,
      title: 'Functions and Scope',
      content: 'Understanding JavaScript functions and variable scope.',
      contentType: 'video',
      videoUrl: 'https://example.com/video1.mp4',
      isFree: false,
      sortOrder: 2,
    },
  });

  const lesson3 = await prisma.lesson.upsert({
    where: { id: 'lesson3' },
    update: {},
    create: {
      id: 'lesson3',
      courseId: course2.id,
      title: 'Introduction to React',
      content: 'Getting started with React components and JSX.',
      contentType: 'text',
      isFree: true,
      sortOrder: 1,
    },
  });

  // Create user progress
  await prisma.userProgress.upsert({
    where: {
      userId_lessonId: {
        userId: member1.id,
        lessonId: lesson1.id,
      },
    },
    update: {},
    create: {
      userId: member1.id,
      lessonId: lesson1.id,
      completedAt: new Date(),
      timeSpent: 1800, // 30 minutes
    },
  });

  await prisma.userProgress.upsert({
    where: {
      userId_lessonId: {
        userId: member1.id,
        lessonId: lesson2.id,
      },
    },
    update: {},
    create: {
      userId: member1.id,
      lessonId: lesson2.id,
      timeSpent: 900, // 15 minutes (in progress)
    },
  });

  // Create test posts
  const post1 = await prisma.post.upsert({
    where: { id: 'post1' },
    update: {},
    create: {
      id: 'post1',
      communityId: community1.id,
      authorId: member1.id,
      title: 'Welcome to the community!',
      content: 'Excited to start learning web development with everyone here!',
      postType: 'discussion',
      likeCount: 3,
      commentCount: 2,
    },
  });

  const post2 = await prisma.post.upsert({
    where: { id: 'post2' },
    update: {},
    create: {
      id: 'post2',
      communityId: community1.id,
      authorId: creator.id,
      title: 'New Course Available: React Development',
      content: 'I just published a new course on React development. Check it out!',
      postType: 'announcement',
      likeCount: 5,
      commentCount: 1,
    },
  });

  // Create test comments
  const comment1 = await prisma.comment.upsert({
    where: { id: 'comment1' },
    update: {},
    create: {
      id: 'comment1',
      postId: post1.id,
      authorId: member2.id,
      content: 'Welcome! Great to have you here. Feel free to ask any questions.',
      likeCount: 2,
    },
  });

  const comment2 = await prisma.comment.upsert({
    where: { id: 'comment2' },
    update: {},
    create: {
      id: 'comment2',
      postId: post1.id,
      authorId: creator.id,
      content: 'Thanks for joining! Looking forward to your contributions.',
      likeCount: 1,
    },
  });

  // Create nested comment (reply)
  await prisma.comment.upsert({
    where: { id: 'comment3' },
    update: {},
    create: {
      id: 'comment3',
      postId: post1.id,
      authorId: member1.id,
      parentId: comment1.id,
      content: 'Thank you! I have a question about JavaScript closures.',
      likeCount: 0,
    },
  });

  // Create points transactions
  await prisma.pointsTransaction.create({
    data: {
      userId: member1.id,
      communityId: community1.id,
      points: 50,
      reason: 'Lesson completion',
      referenceId: lesson1.id,
    },
  });

  await prisma.pointsTransaction.create({
    data: {
      userId: member1.id,
      communityId: community1.id,
      points: 25,
      reason: 'Post creation',
      referenceId: post1.id,
    },
  });

  await prisma.pointsTransaction.create({
    data: {
      userId: member2.id,
      communityId: community1.id,
      points: 15,
      reason: 'Comment creation',
      referenceId: comment1.id,
    },
  });

  // Create post and comment likes
  await prisma.postLike.upsert({
    where: {
      userId_postId: {
        userId: member2.id,
        postId: post1.id,
      },
    },
    update: {},
    create: {
      userId: member2.id,
      postId: post1.id,
    },
  });

  await prisma.commentLike.upsert({
    where: {
      userId_commentId: {
        userId: member1.id,
        commentId: comment1.id,
      },
    },
    update: {},
    create: {
      userId: member1.id,
      commentId: comment1.id,
    },
  });

  // Create test subscription
  await prisma.subscription.upsert({
    where: { id: 'subscription1' },
    update: {},
    create: {
      id: 'subscription1',
      userId: member1.id,
      communityId: community1.id,
      stripeSubscriptionId: 'sub_test_123456789',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    },
  });

  console.log('✅ Database seeding completed successfully!');
  console.log(`Created users: ${creator.username}, ${member1.username}, ${member2.username}`);
  console.log(`Created communities: ${community1.name}, ${community2.name}`);
  console.log(`Created courses: ${course1.title}, ${course2.title}`);
  console.log(`Created lessons: ${lesson1.title}, ${lesson2.title}, ${lesson3.title}`);
  console.log(`Created posts: ${post1.title}, ${post2.title}`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });