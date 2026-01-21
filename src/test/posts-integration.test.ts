import request from 'supertest';
import app from '../index';
import prisma from '../lib/prisma';
import jwt from 'jsonwebtoken';

describe('Posts Integration Test', () => {
  let authToken: string;
  let userId: string;
  let communityId: string;

  beforeAll(async () => {
    // Clean up any existing test data
    await prisma.contentReport.deleteMany();
    await prisma.postLike.deleteMany();
    await prisma.commentLike.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.post.deleteMany();
    await prisma.communityMembership.deleteMany();
    await prisma.community.deleteMany();
    await prisma.user.deleteMany();

    // Create test user
    const user = await prisma.user.create({
      data: {
        email: 'integration@example.com',
        passwordHash: 'hashedpassword',
        username: 'integrationuser',
        displayName: 'Integration User',
        emailVerified: true
      }
    });
    userId = user.id;

    // Create auth token
    authToken = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        username: user.username
      },
      process.env.JWT_SECRET || 'dev-jwt-secret-key-change-in-production',
      { 
        expiresIn: '1h',
        issuer: 'community-learning-platform',
        audience: 'community-users'
      }
    );

    // Create test community
    const community = await prisma.community.create({
      data: {
        name: 'Integration Test Community',
        slug: 'integration-test-community',
        description: 'A test community for integration tests',
        creatorId: userId,
        isPublic: true
      }
    });
    communityId = community.id;

    // Create membership
    await prisma.communityMembership.create({
      data: {
        userId,
        communityId,
        role: 'admin',
        status: 'active'
      }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.contentReport.deleteMany();
    await prisma.postLike.deleteMany();
    await prisma.commentLike.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.post.deleteMany();
    await prisma.communityMembership.deleteMany();
    await prisma.community.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it('should complete full post workflow: create, comment, like, report', async () => {
    // 1. Create a post
    const postData = {
      title: 'Integration Test Post',
      content: 'This is a test post for integration testing',
      postType: 'discussion'
    };

    const postResponse = await request(app)
      .post(`/api/v1/posts/community/${communityId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(postData)
      .expect(201);

    expect(postResponse.body.success).toBe(true);
    expect(postResponse.body.data.title).toBe(postData.title);
    const postId = postResponse.body.data.id;

    // 2. Get the post
    const getPostResponse = await request(app)
      .get(`/api/v1/posts/${postId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(getPostResponse.body.success).toBe(true);
    expect(getPostResponse.body.data.id).toBe(postId);

    // 3. Create a comment
    const commentData = {
      content: 'This is a test comment'
    };

    const commentResponse = await request(app)
      .post(`/api/v1/posts/${postId}/comments`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(commentData)
      .expect(201);

    expect(commentResponse.body.success).toBe(true);
    expect(commentResponse.body.data.content).toBe(commentData.content);
    const commentId = commentResponse.body.data.id;

    // 4. Get comments
    const getCommentsResponse = await request(app)
      .get(`/api/v1/posts/${postId}/comments`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(getCommentsResponse.body.success).toBe(true);
    expect(getCommentsResponse.body.data).toBeInstanceOf(Array);
    expect(getCommentsResponse.body.data.length).toBeGreaterThan(0);

    // 5. Like the post
    const likePostResponse = await request(app)
      .post(`/api/v1/posts/${postId}/like`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(likePostResponse.body.success).toBe(true);
    expect(likePostResponse.body.data.liked).toBe(true);

    // 6. Like the comment
    const likeCommentResponse = await request(app)
      .post(`/api/v1/posts/comments/${commentId}/like`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(likeCommentResponse.body.success).toBe(true);
    expect(likeCommentResponse.body.data.liked).toBe(true);

    // 7. Report the post
    const reportData = {
      reason: 'spam',
      description: 'This post contains spam content'
    };

    const reportResponse = await request(app)
      .post(`/api/v1/posts/${postId}/report`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(reportData)
      .expect(201);

    expect(reportResponse.body.success).toBe(true);
    expect(reportResponse.body.data.reason).toBe(reportData.reason);

    // 8. Get community posts with search
    const searchResponse = await request(app)
      .get(`/api/v1/posts/community/${communityId}?search=integration&sortBy=newest`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(searchResponse.body.success).toBe(true);
    expect(searchResponse.body.data.posts).toBeInstanceOf(Array);
    expect(searchResponse.body.data.posts.length).toBeGreaterThan(0);

    console.log('✅ All post functionality working correctly!');
  });
});