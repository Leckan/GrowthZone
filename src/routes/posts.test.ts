import request from 'supertest';
import app from '../index';
import prisma from '../lib/prisma';
import jwt from 'jsonwebtoken';

describe('Posts API', () => {
  let authToken: string;
  let userId: string;
  let communityId: string;
  let postId: string;
  let commentId: string;

  beforeAll(async () => {
    // Clean up any existing test data
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
        email: 'testuser@example.com',
        passwordHash: 'hashedpassword',
        username: 'testuser',
        displayName: 'Test User',
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
        name: 'Test Community',
        slug: 'test-community',
        description: 'A test community',
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
    await prisma.postLike.deleteMany();
    await prisma.commentLike.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.post.deleteMany();
    await prisma.communityMembership.deleteMany();
    await prisma.community.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  describe('POST /api/v1/posts/community/:communityId', () => {
    it('should create a new post successfully', async () => {
      const postData = {
        title: 'Test Post',
        content: 'This is a test post content',
        postType: 'discussion'
      };

      const response = await request(app)
        .post(`/api/v1/posts/community/${communityId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(postData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(postData.title);
      expect(response.body.data.content).toBe(postData.content);
      expect(response.body.data.postType).toBe(postData.postType);
      expect(response.body.data.author.id).toBe(userId);

      postId = response.body.data.id;
    });

    it('should create an announcement when user has permissions', async () => {
      const postData = {
        title: 'Important Announcement',
        content: 'This is an important announcement',
        postType: 'announcement'
      };

      const response = await request(app)
        .post(`/api/v1/posts/community/${communityId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(postData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.postType).toBe('announcement');
    });

    it('should fail to create post without authentication', async () => {
      const postData = {
        title: 'Test Post',
        content: 'This is a test post content'
      };

      await request(app)
        .post(`/api/v1/posts/community/${communityId}`)
        .send(postData)
        .expect(401);
    });

    it('should fail with invalid data', async () => {
      const postData = {
        title: '',
        content: ''
      };

      const response = await request(app)
        .post(`/api/v1/posts/community/${communityId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(postData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('GET /api/v1/posts/community/:communityId', () => {
    it('should get community posts successfully', async () => {
      const response = await request(app)
        .get(`/api/v1/posts/community/${communityId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.posts).toBeInstanceOf(Array);
      expect(response.body.data.posts.length).toBeGreaterThan(0);
      expect(response.body.data.pagination).toBeDefined();
    });

    it('should filter posts by type', async () => {
      const response = await request(app)
        .get(`/api/v1/posts/community/${communityId}?postType=announcement`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      response.body.data.posts.forEach((post: any) => {
        expect(post.postType).toBe('announcement');
      });
    });

    it('should search posts by content', async () => {
      const response = await request(app)
        .get(`/api/v1/posts/community/${communityId}?search=test`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.posts).toBeInstanceOf(Array);
    });
  });

  describe('GET /api/v1/posts/:id', () => {
    it('should get a single post successfully', async () => {
      const response = await request(app)
        .get(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(postId);
      expect(response.body.data.author).toBeDefined();
      expect(response.body.data.community).toBeDefined();
    });

    it('should return 404 for non-existent post', async () => {
      const response = await request(app)
        .get('/api/v1/posts/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Not found');
    });
  });

  describe('PUT /api/v1/posts/:id', () => {
    it('should update post successfully', async () => {
      const updateData = {
        title: 'Updated Test Post',
        content: 'This is updated content'
      };

      const response = await request(app)
        .put(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(updateData.title);
      expect(response.body.data.content).toBe(updateData.content);
    });

    it('should fail to update without authentication', async () => {
      const updateData = {
        title: 'Updated Test Post'
      };

      await request(app)
        .put(`/api/v1/posts/${postId}`)
        .send(updateData)
        .expect(401);
    });
  });

  describe('POST /api/v1/posts/:id/like', () => {
    it('should like a post successfully', async () => {
      const response = await request(app)
        .post(`/api/v1/posts/${postId}/like`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.liked).toBe(true);
    });

    it('should unlike a post when liked again', async () => {
      const response = await request(app)
        .post(`/api/v1/posts/${postId}/like`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.liked).toBe(false);
    });
  });

  describe('POST /api/v1/posts/:id/comments', () => {
    it('should create a comment successfully', async () => {
      const commentData = {
        content: 'This is a test comment'
      };

      const response = await request(app)
        .post(`/api/v1/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(commentData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.content).toBe(commentData.content);
      expect(response.body.data.author.id).toBe(userId);

      commentId = response.body.data.id;
    });

    it('should create a reply to a comment', async () => {
      const replyData = {
        content: 'This is a reply to the comment',
        parentId: commentId
      };

      const response = await request(app)
        .post(`/api/v1/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(replyData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.content).toBe(replyData.content);
      expect(response.body.data.parentId).toBe(commentId);
    });

    it('should fail to create comment without authentication', async () => {
      const commentData = {
        content: 'This is a test comment'
      };

      await request(app)
        .post(`/api/v1/posts/${postId}/comments`)
        .send(commentData)
        .expect(401);
    });
  });

  describe('GET /api/v1/posts/:id/comments', () => {
    it('should get post comments successfully', async () => {
      const response = await request(app)
        .get(`/api/v1/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
      
      // Check that replies are included
      const commentWithReplies = response.body.data.find((comment: any) => comment.replies.length > 0);
      expect(commentWithReplies).toBeDefined();
    });
  });

  describe('PUT /api/v1/posts/comments/:commentId', () => {
    it('should update comment successfully', async () => {
      const updateData = {
        content: 'This is updated comment content'
      };

      const response = await request(app)
        .put(`/api/v1/posts/comments/${commentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.content).toBe(updateData.content);
    });
  });

  describe('POST /api/v1/posts/comments/:commentId/like', () => {
    it('should like a comment successfully', async () => {
      const response = await request(app)
        .post(`/api/v1/posts/comments/${commentId}/like`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.liked).toBe(true);
    });

    it('should unlike a comment when liked again', async () => {
      const response = await request(app)
        .post(`/api/v1/posts/comments/${commentId}/like`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.liked).toBe(false);
    });
  });

  describe('DELETE /api/v1/posts/comments/:commentId', () => {
    it('should delete comment successfully', async () => {
      const response = await request(app)
        .delete(`/api/v1/posts/comments/${commentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Comment deleted successfully');
    });
  });

  describe('POST /api/v1/posts/:id/report', () => {
    it('should report a post successfully', async () => {
      // First create a post to report
      const postData = {
        title: 'Post to Report',
        content: 'This is content that will be reported',
        postType: 'discussion'
      };

      const postResponse = await request(app)
        .post(`/api/v1/posts/community/${communityId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(postData);

      const reportPostId = postResponse.body.data.id;

      const reportData = {
        reason: 'spam',
        description: 'This post contains spam content'
      };

      const response = await request(app)
        .post(`/api/v1/posts/${reportPostId}/report`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.reason).toBe(reportData.reason);
      expect(response.body.data.description).toBe(reportData.description);
    });

    it('should fail to report the same post twice', async () => {
      // First create a post to report
      const postData = {
        title: 'Post to Report Twice',
        content: 'This is content that will be reported twice',
        postType: 'discussion'
      };

      const postResponse = await request(app)
        .post(`/api/v1/posts/community/${communityId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(postData);

      const reportPostId = postResponse.body.data.id;

      const reportData = {
        reason: 'inappropriate',
        description: 'This post is inappropriate'
      };

      // First report should succeed
      await request(app)
        .post(`/api/v1/posts/${reportPostId}/report`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(201);

      // Second report should fail
      const response = await request(app)
        .post(`/api/v1/posts/${reportPostId}/report`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(409);

      expect(response.body.error).toBe('Conflict');
      expect(response.body.message).toBe('You have already reported this post');
    });
  });

  describe('DELETE /api/v1/posts/:id', () => {
    it('should delete post successfully', async () => {
      const response = await request(app)
        .delete(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Post deleted successfully');
    });
  });
});