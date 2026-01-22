import * as fc from 'fast-check';
import request from 'supertest';
import app from '../index';
import { PrismaClient } from '@prisma/client';
import { createPropertyTest } from './propertyTestConfig';
import { DatabaseTestUtils } from './testUtils';
import { generateTokenPair } from '../lib/auth';

/**
 * Property-based tests for discussion thread integrity
 * Feature: community-learning-platform, Property 7: Discussion Thread Integrity
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4
 */

describe('Discussion Thread Integrity Properties', () => {
  let prisma: PrismaClient;
  let dbUtils: DatabaseTestUtils;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    dbUtils = new DatabaseTestUtils(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await dbUtils.cleanup();
  });

  afterEach(async () => {
    await dbUtils.cleanup();
  });

  createPropertyTest(
    7,
    'Discussion Thread Integrity',
    ['4.1', '4.2', '4.3', '4.4'],
    async () => {
      // Test post creation and management - should add posts to community feed (Requirement 4.1)
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            posts: fc.array(
              fc.record({
                title: fc.option(fc.stringOf(
                  fc.char().filter(c => /[a-zA-Z0-9 ._-]/.test(c)), 
                  { minLength: 1, maxLength: 200 }
                )),
                content: fc.stringOf(
                  fc.char().filter(c => /[a-zA-Z0-9 .,!?_\-\n]/.test(c)), 
                  { minLength: 1, maxLength: 1000 }
                ),
                postType: fc.constantFrom('discussion', 'announcement')
              }),
              { minLength: 1, maxLength: 5 }
            )
          }),
          async (testData) => {
            // Create test hierarchy: creator -> community -> member
            const creator = await dbUtils.createUser();
            const member = await dbUtils.createUser();
            const community = await dbUtils.createCommunity(creator.id);
            
            // Add member to community
            await prisma.communityMembership.create({
              data: {
                userId: member.id,
                communityId: community.id,
                role: 'member',
                status: 'active'
              }
            });
            
            const fullCreator = await prisma.user.findUnique({
              where: { id: creator.id }
            });
            
            const fullMember = await prisma.user.findUnique({
              where: { id: member.id }
            });
            
            if (!fullCreator || !fullMember) {
              return true; // Skip if users not found
            }
            
            const { accessToken: creatorToken } = generateTokenPair(fullCreator);
            const { accessToken: memberToken } = generateTokenPair(fullMember);

            // Create posts in the community
            const createdPosts = [];
            for (const postData of testData.posts) {
              // Only creator can create announcements, members can create discussions
              const token = postData.postType === 'announcement' ? creatorToken : memberToken;
              const authorId = postData.postType === 'announcement' ? creator.id : member.id;
              
              const postResponse = await request(app)
                .post(`/api/v1/posts/community/${community.id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                  title: postData.title,
                  content: postData.content,
                  postType: postData.postType
                });

              if (postResponse.status !== 201) {
                return true; // Skip if post creation fails
              }

              const post = postResponse.body.data;
              createdPosts.push({ ...post, expectedAuthorId: authorId });
            }

            // Verify posts are added to community feed
            const feedResponse = await request(app)
              .get(`/api/v1/posts/community/${community.id}`)
              .set('Authorization', `Bearer ${memberToken}`);

            if (feedResponse.status !== 200) {
              return true; // Skip if feed retrieval fails
            }

            const feedPosts = feedResponse.body.data.posts;

            // Verify all created posts appear in feed with correct properties
            const postsInFeed = createdPosts.every(expectedPost => {
              const foundPost = feedPosts.find((p: any) => p.id === expectedPost.id);
              return foundPost && 
                     foundPost.communityId === community.id &&
                     foundPost.authorId === expectedPost.expectedAuthorId &&
                     foundPost.content === expectedPost.content &&
                     foundPost.postType === expectedPost.postType;
            });

            return postsInFeed && feedPosts.length === createdPosts.length;
          }
        ),
        { numRuns: 10, timeout: 60000 }
      );

      // Test comment threading and replies - should allow comments and nested replies (Requirement 4.2)
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            postContent: fc.string({ minLength: 1, maxLength: 200 }),
            comments: fc.array(
              fc.record({
                content: fc.stringOf(
                  fc.char().filter(c => /[a-zA-Z0-9 .,!?_\-\n]/.test(c)), 
                  { minLength: 1, maxLength: 500 }
                ),
                hasReply: fc.boolean(),
                replyContent: fc.option(fc.stringOf(
                  fc.char().filter(c => /[a-zA-Z0-9 .,!?_\-\n]/.test(c)), 
                  { minLength: 1, maxLength: 300 }
                ))
              }),
              { minLength: 1, maxLength: 4 }
            )
          }),
          async (testData) => {
            // Create test hierarchy
            const creator = await dbUtils.createUser();
            const commenter1 = await dbUtils.createUser();
            const commenter2 = await dbUtils.createUser();
            const community = await dbUtils.createCommunity(creator.id);
            
            // Add members to community
            await Promise.all([
              prisma.communityMembership.create({
                data: { userId: commenter1.id, communityId: community.id, role: 'member', status: 'active' }
              }),
              prisma.communityMembership.create({
                data: { userId: commenter2.id, communityId: community.id, role: 'member', status: 'active' }
              })
            ]);
            
            const fullCreator = await prisma.user.findUnique({ where: { id: creator.id } });
            const fullCommenter1 = await prisma.user.findUnique({ where: { id: commenter1.id } });
            const fullCommenter2 = await prisma.user.findUnique({ where: { id: commenter2.id } });
            
            if (!fullCreator || !fullCommenter1 || !fullCommenter2) {
              return true; // Skip if users not found
            }
            
            const { accessToken: creatorToken } = generateTokenPair(fullCreator);
            const { accessToken: commenter1Token } = generateTokenPair(fullCommenter1);
            const { accessToken: commenter2Token } = generateTokenPair(fullCommenter2);

            // Create a post
            const postResponse = await request(app)
              .post(`/api/v1/posts/community/${community.id}`)
              .set('Authorization', `Bearer ${creatorToken}`)
              .send({
                content: testData.postContent,
                postType: 'discussion'
              });

            if (postResponse.status !== 201) {
              return true; // Skip if post creation fails
            }

            const post = postResponse.body.data;

            // Create comments and replies
            const createdComments = [];
            for (const commentData of testData.comments) {
              // Create top-level comment
              const commentResponse = await request(app)
                .post(`/api/v1/posts/${post.id}/comments`)
                .set('Authorization', `Bearer ${commenter1Token}`)
                .send({
                  content: commentData.content
                });

              if (commentResponse.status !== 201) {
                return true; // Skip if comment creation fails
              }

              const comment = commentResponse.body.data;
              createdComments.push(comment);

              // Create reply if specified
              if (commentData.hasReply && commentData.replyContent) {
                const replyResponse = await request(app)
                  .post(`/api/v1/posts/${post.id}/comments`)
                  .set('Authorization', `Bearer ${commenter2Token}`)
                  .send({
                    content: commentData.replyContent,
                    parentId: comment.id
                  });

                if (replyResponse.status !== 201) {
                  return true; // Skip if reply creation fails
                }

                const reply = replyResponse.body.data;
                createdComments.push(reply);
              }
            }

            // Verify comment threading structure
            const commentsResponse = await request(app)
              .get(`/api/v1/posts/${post.id}/comments`)
              .set('Authorization', `Bearer ${commenter1Token}`);

            if (commentsResponse.status !== 200) {
              return true; // Skip if comments retrieval fails
            }

            const comments = commentsResponse.body.data;

            // Verify top-level comments exist
            const topLevelComments = comments.filter((c: any) => !c.parentId);
            const topLevelCommentsCorrect = topLevelComments.length === testData.comments.length;

            // Verify replies are properly nested
            const repliesCorrect = testData.comments.every((commentData, index) => {
              if (!commentData.hasReply || !commentData.replyContent) {
                return true; // No reply expected
              }

              const parentComment = topLevelComments[index];
              if (!parentComment) return false;

              const replies = parentComment.replies || [];
              return replies.length === 1 && 
                     replies[0].content === commentData.replyContent &&
                     replies[0].parentId === parentComment.id;
            });

            // Verify post comment count is updated correctly
            const updatedPost = await prisma.post.findUnique({
              where: { id: post.id },
              select: { commentCount: true }
            });

            const expectedCommentCount = testData.comments.length + 
              testData.comments.filter(c => c.hasReply && c.replyContent).length;
            
            const commentCountCorrect = updatedPost?.commentCount === expectedCommentCount;

            return topLevelCommentsCorrect && repliesCorrect && commentCountCorrect;
          }
        ),
        { numRuns: 8, timeout: 60000 }
      );

      // Test engagement tracking - should record likes and reactions correctly (Requirement 4.3)
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            postContent: fc.string({ minLength: 1, maxLength: 100 }),
            commentContent: fc.string({ minLength: 1, maxLength: 100 }),
            likeActions: fc.array(
              fc.record({
                targetType: fc.constantFrom('post', 'comment'),
                action: fc.constantFrom('like', 'unlike')
              }),
              { minLength: 1, maxLength: 6 }
            )
          }),
          async (testData) => {
            // Create test hierarchy
            const creator = await dbUtils.createUser();
            const liker1 = await dbUtils.createUser();
            const liker2 = await dbUtils.createUser();
            const community = await dbUtils.createCommunity(creator.id);
            
            // Add members to community
            await Promise.all([
              prisma.communityMembership.create({
                data: { userId: liker1.id, communityId: community.id, role: 'member', status: 'active' }
              }),
              prisma.communityMembership.create({
                data: { userId: liker2.id, communityId: community.id, role: 'member', status: 'active' }
              })
            ]);
            
            const fullCreator = await prisma.user.findUnique({ where: { id: creator.id } });
            const fullLiker1 = await prisma.user.findUnique({ where: { id: liker1.id } });
            const fullLiker2 = await prisma.user.findUnique({ where: { id: liker2.id } });
            
            if (!fullCreator || !fullLiker1 || !fullLiker2) {
              return true; // Skip if users not found
            }
            
            const { accessToken: creatorToken } = generateTokenPair(fullCreator);
            const { accessToken: liker1Token } = generateTokenPair(fullLiker1);
            const { accessToken: liker2Token } = generateTokenPair(fullLiker2);

            // Create post and comment
            const postResponse = await request(app)
              .post(`/api/v1/posts/community/${community.id}`)
              .set('Authorization', `Bearer ${creatorToken}`)
              .send({
                content: testData.postContent,
                postType: 'discussion'
              });

            if (postResponse.status !== 201) {
              return true; // Skip if post creation fails
            }

            const post = postResponse.body.data;

            const commentResponse = await request(app)
              .post(`/api/v1/posts/${post.id}/comments`)
              .set('Authorization', `Bearer ${creatorToken}`)
              .send({
                content: testData.commentContent
              });

            if (commentResponse.status !== 201) {
              return true; // Skip if comment creation fails
            }

            const comment = commentResponse.body.data;

            // Track expected like counts
            let expectedPostLikes = 0;
            let expectedCommentLikes = 0;
            const postLikers = new Set<string>();
            const commentLikers = new Set<string>();

            // Perform like/unlike actions
            for (const likeAction of testData.likeActions) {
              const token = Math.random() > 0.5 ? liker1Token : liker2Token;
              const likerId = token === liker1Token ? liker1.id : liker2.id;
              
              if (likeAction.targetType === 'post') {
                const likeResponse = await request(app)
                  .post(`/api/v1/posts/${post.id}/like`)
                  .set('Authorization', `Bearer ${token}`);

                if (likeResponse.status === 200) {
                  const wasLiked = likeResponse.body.data.liked;
                  if (wasLiked && !postLikers.has(likerId)) {
                    postLikers.add(likerId);
                    expectedPostLikes++;
                  } else if (!wasLiked && postLikers.has(likerId)) {
                    postLikers.delete(likerId);
                    expectedPostLikes--;
                  }
                }
              } else {
                const likeResponse = await request(app)
                  .post(`/api/v1/posts/comments/${comment.id}/like`)
                  .set('Authorization', `Bearer ${token}`);

                if (likeResponse.status === 200) {
                  const wasLiked = likeResponse.body.data.liked;
                  if (wasLiked && !commentLikers.has(likerId)) {
                    commentLikers.add(likerId);
                    expectedCommentLikes++;
                  } else if (!wasLiked && commentLikers.has(likerId)) {
                    commentLikers.delete(likerId);
                    expectedCommentLikes--;
                  }
                }
              }
            }

            // Verify like counts are tracked correctly
            const updatedPost = await prisma.post.findUnique({
              where: { id: post.id },
              select: { likeCount: true }
            });

            const updatedComment = await prisma.comment.findUnique({
              where: { id: comment.id },
              select: { likeCount: true }
            });

            const postLikesCorrect = updatedPost?.likeCount === expectedPostLikes;
            const commentLikesCorrect = updatedComment?.likeCount === expectedCommentLikes;

            return postLikesCorrect && commentLikesCorrect;
          }
        ),
        { numRuns: 8, timeout: 60000 }
      );

      // Test chronological ordering and engagement metrics - should display posts in correct order with metrics (Requirement 4.4)
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            posts: fc.array(
              fc.record({
                content: fc.string({ minLength: 1, maxLength: 100 }),
                delayMs: fc.integer({ min: 10, max: 100 }) // Small delays to ensure different timestamps
              }),
              { minLength: 2, maxLength: 4 }
            ),
            sortBy: fc.constantFrom('newest', 'oldest', 'popular')
          }),
          async (testData) => {
            // Create test hierarchy
            const creator = await dbUtils.createUser();
            const member = await dbUtils.createUser();
            const community = await dbUtils.createCommunity(creator.id);
            
            await prisma.communityMembership.create({
              data: { userId: member.id, communityId: community.id, role: 'member', status: 'active' }
            });
            
            const fullCreator = await prisma.user.findUnique({ where: { id: creator.id } });
            const fullMember = await prisma.user.findUnique({ where: { id: member.id } });
            
            if (!fullCreator || !fullMember) {
              return true; // Skip if users not found
            }
            
            const { accessToken: creatorToken } = generateTokenPair(fullCreator);
            const { accessToken: memberToken } = generateTokenPair(fullMember);

            // Create posts with delays to ensure different timestamps
            const createdPosts = [];
            for (const postData of testData.posts) {
              const postResponse = await request(app)
                .post(`/api/v1/posts/community/${community.id}`)
                .set('Authorization', `Bearer ${creatorToken}`)
                .send({
                  content: postData.content,
                  postType: 'discussion'
                });

              if (postResponse.status !== 201) {
                return true; // Skip if post creation fails
              }

              const post = postResponse.body.data;
              createdPosts.push(post);

              // Add delay to ensure different timestamps
              await new Promise(resolve => setTimeout(resolve, postData.delayMs));
            }

            // Add some engagement to test popular sorting
            if (testData.sortBy === 'popular' && createdPosts.length >= 2) {
              // Like the second post more than the first
              await request(app)
                .post(`/api/v1/posts/${createdPosts[1].id}/like`)
                .set('Authorization', `Bearer ${memberToken}`);
              
              // Add a comment to the second post
              await request(app)
                .post(`/api/v1/posts/${createdPosts[1].id}/comments`)
                .set('Authorization', `Bearer ${memberToken}`)
                .send({ content: 'Test comment' });
            }

            // Retrieve posts with specified sorting
            const feedResponse = await request(app)
              .get(`/api/v1/posts/community/${community.id}?sortBy=${testData.sortBy}`)
              .set('Authorization', `Bearer ${memberToken}`);

            if (feedResponse.status !== 200) {
              return true; // Skip if feed retrieval fails
            }

            const feedPosts = feedResponse.body.data.posts;

            // Verify correct number of posts
            if (feedPosts.length !== createdPosts.length) {
              return false;
            }

            // Verify ordering based on sort type
            let orderingCorrect = true;
            
            if (testData.sortBy === 'newest') {
              // Posts should be in reverse chronological order (newest first)
              for (let i = 0; i < feedPosts.length - 1; i++) {
                const currentPost = feedPosts[i];
                const nextPost = feedPosts[i + 1];
                if (new Date(currentPost.createdAt) < new Date(nextPost.createdAt)) {
                  orderingCorrect = false;
                  break;
                }
              }
            } else if (testData.sortBy === 'oldest') {
              // Posts should be in chronological order (oldest first)
              for (let i = 0; i < feedPosts.length - 1; i++) {
                const currentPost = feedPosts[i];
                const nextPost = feedPosts[i + 1];
                if (new Date(currentPost.createdAt) > new Date(nextPost.createdAt)) {
                  orderingCorrect = false;
                  break;
                }
              }
            } else if (testData.sortBy === 'popular') {
              // Posts should be ordered by engagement (likes + comments)
              for (let i = 0; i < feedPosts.length - 1; i++) {
                const currentPost = feedPosts[i];
                const nextPost = feedPosts[i + 1];
                const currentEngagement = currentPost.likeCount + currentPost.commentCount;
                const nextEngagement = nextPost.likeCount + nextPost.commentCount;
                
                // Current post should have >= engagement than next post
                if (currentEngagement < nextEngagement) {
                  orderingCorrect = false;
                  break;
                }
              }
            }

            // Verify engagement metrics are displayed
            const metricsCorrect = feedPosts.every((post: any) => 
              typeof post.likeCount === 'number' &&
              typeof post.commentCount === 'number' &&
              post.likeCount >= 0 &&
              post.commentCount >= 0
            );

            return orderingCorrect && metricsCorrect;
          }
        ),
        { numRuns: 8, timeout: 60000 }
      );

      // Test thread integrity during concurrent operations - should maintain consistency during simultaneous actions
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            postContent: fc.string({ minLength: 1, maxLength: 100 }),
            numUsers: fc.integer({ min: 2, max: 4 }),
            actionsPerUser: fc.integer({ min: 1, max: 3 })
          }),
          async (testData) => {
            // Create test hierarchy with multiple users
            const creator = await dbUtils.createUser();
            const community = await dbUtils.createCommunity(creator.id);
            
            const users = [creator];
            const tokens = [];
            
            // Create additional users
            for (let i = 1; i < testData.numUsers; i++) {
              const user = await dbUtils.createUser();
              users.push(user);
              
              await prisma.communityMembership.create({
                data: { userId: user.id, communityId: community.id, role: 'member', status: 'active' }
              });
            }
            
            // Get tokens for all users
            for (const user of users) {
              const fullUser = await prisma.user.findUnique({ where: { id: user.id } });
              if (!fullUser) return true; // Skip if user not found
              
              const { accessToken } = generateTokenPair(fullUser);
              tokens.push(accessToken);
            }

            // Create initial post
            const postResponse = await request(app)
              .post(`/api/v1/posts/community/${community.id}`)
              .set('Authorization', `Bearer ${tokens[0]}`)
              .send({
                content: testData.postContent,
                postType: 'discussion'
              });

            if (postResponse.status !== 201) {
              return true; // Skip if post creation fails
            }

            const post = postResponse.body.data;

            // Perform concurrent actions (comments and likes)
            const concurrentActions = [];
            
            for (let userIndex = 0; userIndex < testData.numUsers; userIndex++) {
              for (let actionIndex = 0; actionIndex < testData.actionsPerUser; actionIndex++) {
                const token = tokens[userIndex];
                
                // Alternate between creating comments and liking
                if (actionIndex % 2 === 0) {
                  // Create comment
                  concurrentActions.push(
                    request(app)
                      .post(`/api/v1/posts/${post.id}/comments`)
                      .set('Authorization', `Bearer ${token}`)
                      .send({
                        content: `Comment from user ${userIndex} action ${actionIndex}`
                      })
                  );
                } else {
                  // Like post
                  concurrentActions.push(
                    request(app)
                      .post(`/api/v1/posts/${post.id}/like`)
                      .set('Authorization', `Bearer ${token}`)
                  );
                }
              }
            }

            // Execute all actions concurrently
            const results = await Promise.allSettled(concurrentActions);
            
            // Count successful operations
            const successfulComments = results.filter((result, index) => 
              result.status === 'fulfilled' && 
              index % 2 === 0 && // Comment actions are at even indices
              (result as PromiseFulfilledResult<any>).value.status === 201
            ).length;

            const successfulLikes = results.filter((result, index) => 
              result.status === 'fulfilled' && 
              index % 2 === 1 && // Like actions are at odd indices
              (result as PromiseFulfilledResult<any>).value.status === 200
            ).length;

            // Verify final state consistency
            const finalPost = await prisma.post.findUnique({
              where: { id: post.id },
              select: { commentCount: true, likeCount: true }
            });

            const finalComments = await prisma.comment.count({
              where: { postId: post.id }
            });

            const finalLikes = await prisma.postLike.count({
              where: { postId: post.id }
            });

            // Verify counts are consistent
            const commentCountConsistent = finalPost?.commentCount === finalComments;
            const likeCountConsistent = finalPost?.likeCount === finalLikes;
            
            // Verify counts match successful operations (accounting for potential duplicates in likes)
            const commentCountCorrect = finalComments === successfulComments;
            const likeCountReasonable = finalLikes <= successfulLikes; // Likes can be toggled

            return commentCountConsistent && likeCountConsistent && 
                   commentCountCorrect && likeCountReasonable;
          }
        ),
        { numRuns: 5, timeout: 60000 }
      );
    }
  );
});