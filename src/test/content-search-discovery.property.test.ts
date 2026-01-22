import * as fc from 'fast-check';
import request from 'supertest';
import app from '../index';
import { PrismaClient } from '@prisma/client';
import { createPropertyTest } from './propertyTestConfig';
import { DatabaseTestUtils } from './testUtils';
import { generateTokenPair } from '../lib/auth';

/**
 * Property-based tests for content search and discovery
 * Feature: community-learning-platform, Property 8: Content Search and Discovery
 * Validates: Requirements 4.5, 4.6, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

describe('Content Search and Discovery Properties', () => {
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
    8,
    'Content Search and Discovery',
    ['4.5', '4.6', '8.1', '8.2', '8.3', '8.4', '8.5', '8.6'],
    async () => {
      // Property: Community search should return relevant results and support filtering (Requirements 8.1, 8.2, 8.3, 8.4)
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            communities: fc.array(
              fc.record({
                name: fc.stringOf(
                  fc.char().filter(c => /[a-zA-Z0-9 ._-]/.test(c)), 
                  { minLength: 1, maxLength: 100 }
                ),
                description: fc.option(fc.stringOf(
                  fc.char().filter(c => /[a-zA-Z0-9 ._-]/.test(c)), 
                  { minLength: 1, maxLength: 1000 }
                )),
                category: fc.option(fc.constantFrom(
                  'Technology', 'Business', 'Health', 'Education', 'Arts', 'Science'
                )),
                isPublic: fc.boolean(),
                priceMonthly: fc.option(fc.float({ min: 0, max: Math.fround(999.99) })),
                priceYearly: fc.option(fc.float({ min: 0, max: Math.fround(9999.99) })),
                memberCount: fc.integer({ min: 0, max: 10000 })
              }),
              { minLength: 1, maxLength: 10 }
            ),
            searchQuery: fc.stringOf(
              fc.char().filter(c => /[a-zA-Z0-9 ]/.test(c)), 
              { minLength: 1, maxLength: 50 }
            ),
            filters: fc.record({
              category: fc.option(fc.constantFrom(
                'Technology', 'Business', 'Health', 'Education', 'Arts', 'Science'
              )),
              priceRange: fc.option(fc.constantFrom(
                'free', 'paid', 'under-50', '50-100', 'over-100'
              )),
              memberCount: fc.option(fc.constantFrom(
                'small', 'medium', 'large'
              ))
            })
          }),
          async ({ communities, searchQuery, filters }) => {
            // Create test user and communities
            const user = await dbUtils.createUser();
            const fullUser = await prisma.user.findUnique({
              where: { id: user.id }
            });
            
            if (!fullUser) {
              return true; // Skip if user not found
            }
            
            const { accessToken } = generateTokenPair(fullUser);

            const createdCommunities = [];
            for (const communityData of communities) {
              const slug = `test-${communityData.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              
              const community = await dbUtils.createCommunity(user.id, {
                name: communityData.name,
                slug,
                isPublic: communityData.isPublic
              });

              // Update member count and additional properties to match test data
              await prisma.community.update({
                where: { id: community.id },
                data: { 
                  memberCount: communityData.memberCount,
                  description: communityData.description || undefined,
                  category: communityData.category || undefined,
                  priceMonthly: communityData.priceMonthly || undefined,
                  priceYearly: communityData.priceYearly || undefined
                }
              });

              createdCommunities.push({
                ...community,
                memberCount: communityData.memberCount,
                category: communityData.category
              });
            }

            // Test community search functionality
            const searchParams = new URLSearchParams({
              query: searchQuery,
              ...(filters.category && { category: filters.category }),
              ...(filters.priceRange && { priceRange: filters.priceRange }),
              ...(filters.memberCount && { memberCount: filters.memberCount })
            });

            const searchResponse = await request(app)
              .get(`/api/v1/communities/search?${searchParams}`)
              .set('Authorization', `Bearer ${accessToken}`);

            expect(searchResponse.status).toBe(200);
            expect(searchResponse.body).toHaveProperty('data');
            expect(searchResponse.body.data).toHaveProperty('communities');
            expect(searchResponse.body.data).toHaveProperty('total');
            expect(searchResponse.body.data).toHaveProperty('query', searchQuery);
            expect(Array.isArray(searchResponse.body.data.communities)).toBe(true);

            const results = searchResponse.body.data.communities;

            // Property 1: All search results should be relevant to the query
            for (const result of results) {
              const matchesQuery = 
                result.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (result.description && result.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (result.category && result.category.toLowerCase().includes(searchQuery.toLowerCase()));
              
              expect(matchesQuery).toBe(true);
            }

            // Property 2: All results should match applied filters
            for (const result of results) {
              // Category filter
              if (filters.category) {
                expect(result.category?.toLowerCase()).toContain(filters.category.toLowerCase());
              }

              // Price range filter
              if (filters.priceRange) {
                switch (filters.priceRange) {
                  case 'free':
                    expect(result.priceMonthly).toBeNull();
                    expect(result.priceYearly).toBeNull();
                    break;
                  case 'paid':
                    expect(result.priceMonthly !== null || result.priceYearly !== null).toBe(true);
                    break;
                  case 'under-50':
                    if (result.priceMonthly !== null) {
                      expect(result.priceMonthly).toBeLessThanOrEqual(50);
                    }
                    if (result.priceYearly !== null) {
                      expect(result.priceYearly).toBeLessThanOrEqual(600);
                    }
                    break;
                  case '50-100':
                    if (result.priceMonthly !== null) {
                      expect(result.priceMonthly).toBeGreaterThanOrEqual(50);
                      expect(result.priceMonthly).toBeLessThanOrEqual(100);
                    }
                    if (result.priceYearly !== null) {
                      expect(result.priceYearly).toBeGreaterThanOrEqual(600);
                      expect(result.priceYearly).toBeLessThanOrEqual(1200);
                    }
                    break;
                  case 'over-100':
                    expect(result.priceMonthly > 100 || result.priceYearly > 1200).toBe(true);
                    break;
                }
              }

              // Member count filter
              if (filters.memberCount) {
                switch (filters.memberCount) {
                  case 'small':
                    expect(result.memberCount).toBeLessThanOrEqual(50);
                    break;
                  case 'medium':
                    expect(result.memberCount).toBeGreaterThanOrEqual(51);
                    expect(result.memberCount).toBeLessThanOrEqual(500);
                    break;
                  case 'large':
                    expect(result.memberCount).toBeGreaterThanOrEqual(501);
                    break;
                }
              }
            }

            // Property 3: Results should be ordered by relevance (popular communities first)
            if (results.length > 1) {
              for (let i = 0; i < results.length - 1; i++) {
                expect(results[i].memberCount).toBeGreaterThanOrEqual(results[i + 1].memberCount);
              }
            }

            // Property 4: Only public communities should be returned in search
            for (const result of results) {
              expect(result.isPublic).toBe(true);
            }
            
            return true; // Property holds
          }
        ),
        { numRuns: 20 } // Reduced runs due to database operations
      );

      // Property: Post content search should return relevant posts and support filtering (Requirements 4.5, 4.6)
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
                  fc.char().filter(c => /[a-zA-Z0-9 ._-]/.test(c)), 
                  { minLength: 1, maxLength: 1000 }
                ),
                postType: fc.constantFrom('discussion', 'announcement')
              }),
              { minLength: 1, maxLength: 5 }
            ),
            searchQuery: fc.stringOf(
              fc.char().filter(c => /[a-zA-Z0-9 ]/.test(c)), 
              { minLength: 1, maxLength: 50 }
            ),
            postTypeFilter: fc.option(fc.constantFrom('discussion', 'announcement'))
          }),
          async ({ posts, searchQuery, postTypeFilter }) => {
            // Create test user and community
            const user = await dbUtils.createUser();
            const fullUser = await prisma.user.findUnique({
              where: { id: user.id }
            });
            
            if (!fullUser) {
              return true; // Skip if user not found
            }
            
            const { accessToken } = generateTokenPair(fullUser);
            const community = await dbUtils.createCommunity(user.id);

            // Create test posts
            const createdPosts = [];
            for (const postData of posts) {
              const post = await prisma.post.create({
                data: {
                  communityId: community.id,
                  authorId: user.id,
                  title: postData.title || undefined,
                  content: postData.content,
                  postType: postData.postType
                }
              });
              createdPosts.push({ ...post, ...postData });
            }

            // Test post search functionality
            const searchParams = new URLSearchParams({
              search: searchQuery,
              ...(postTypeFilter && { postType: postTypeFilter })
            });

            const searchResponse = await request(app)
              .get(`/api/v1/posts/community/${community.id}?${searchParams}`)
              .set('Authorization', `Bearer ${accessToken}`);

            expect(searchResponse.status).toBe(200);
            expect(searchResponse.body).toHaveProperty('data');
            expect(searchResponse.body.data).toHaveProperty('posts');
            expect(Array.isArray(searchResponse.body.data.posts)).toBe(true);

            const results = searchResponse.body.data.posts;

            // Property 1: All search results should be relevant to the query
            for (const result of results) {
              const matchesQuery = 
                (result.title && result.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
                result.content.toLowerCase().includes(searchQuery.toLowerCase());
              
              expect(matchesQuery).toBe(true);
            }

            // Property 2: All results should match post type filter if applied
            if (postTypeFilter) {
              for (const result of results) {
                expect(result.postType).toBe(postTypeFilter);
              }
            }

            // Property 3: Results should be ordered chronologically (newest first by default)
            if (results.length > 1) {
              for (let i = 0; i < results.length - 1; i++) {
                const currentDate = new Date(results[i].createdAt);
                const nextDate = new Date(results[i + 1].createdAt);
                expect(currentDate.getTime()).toBeGreaterThanOrEqual(nextDate.getTime());
              }
            }
            
            return true; // Property holds
          }
        ),
        { numRuns: 15 } // Reduced runs due to database operations
      );

      // Property: Discovery recommendations should return appropriate communities (Requirements 8.5, 8.6)
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            discoveryType: fc.constantFrom('trending', 'popular', 'new', 'recommended'),
            limit: fc.integer({ min: 1, max: 20 }),
            communities: fc.array(
              fc.record({
                name: fc.stringOf(
                  fc.char().filter(c => /[a-zA-Z0-9 ._-]/.test(c)), 
                  { minLength: 1, maxLength: 100 }
                ),
                category: fc.option(fc.constantFrom(
                  'Technology', 'Business', 'Health', 'Education', 'Arts', 'Science'
                )),
                memberCount: fc.integer({ min: 0, max: 1000 }),
                hasRecentPosts: fc.boolean()
              }),
              { minLength: 1, maxLength: 15 }
            )
          }),
          async ({ discoveryType, limit, communities }) => {
            // Create test user
            const user = await dbUtils.createUser();
            const fullUser = await prisma.user.findUnique({
              where: { id: user.id }
            });
            
            if (!fullUser) {
              return true; // Skip if user not found
            }
            
            const { accessToken } = generateTokenPair(fullUser);

            // Create test communities
            const createdCommunities = [];
            for (const communityData of communities) {
              const slug = `test-${communityData.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              
              const community = await dbUtils.createCommunity(user.id, {
                name: communityData.name,
                slug,
                isPublic: true
              });

              // Update member count and category
              await prisma.community.update({
                where: { id: community.id },
                data: { 
                  memberCount: communityData.memberCount,
                  category: communityData.category || undefined
                }
              });

              // Add recent posts if specified
              if (communityData.hasRecentPosts) {
                await prisma.post.create({
                  data: {
                    communityId: community.id,
                    authorId: user.id,
                    content: 'Recent test post',
                    createdAt: new Date()
                  }
                });
              }

              createdCommunities.push({
                ...community,
                memberCount: communityData.memberCount,
                hasRecentPosts: communityData.hasRecentPosts
              });
            }

            // Test discovery functionality
            const discoveryParams = new URLSearchParams({
              type: discoveryType,
              limit: limit.toString()
            });

            const discoveryResponse = await request(app)
              .get(`/api/v1/communities/discover?${discoveryParams}`)
              .set('Authorization', `Bearer ${accessToken}`);

            expect(discoveryResponse.status).toBe(200);
            expect(discoveryResponse.body).toHaveProperty('data');
            expect(discoveryResponse.body.data).toHaveProperty('communities');
            expect(discoveryResponse.body.data).toHaveProperty('type', discoveryType);
            expect(Array.isArray(discoveryResponse.body.data.communities)).toBe(true);

            const results = discoveryResponse.body.data.communities;

            // Property 1: Results should not exceed requested limit
            expect(results.length).toBeLessThanOrEqual(limit);

            // Property 2: All results should be public communities
            for (const result of results) {
              expect(result.isPublic).toBe(true);
            }

            // Property 3: Results should be ordered according to discovery type
            if (results.length > 1) {
              switch (discoveryType) {
                case 'popular':
                  // Should be ordered by member count (descending)
                  for (let i = 0; i < results.length - 1; i++) {
                    expect(results[i].memberCount).toBeGreaterThanOrEqual(results[i + 1].memberCount);
                  }
                  break;
                case 'new':
                  // Should be ordered by creation date (newest first)
                  for (let i = 0; i < results.length - 1; i++) {
                    const currentDate = new Date(results[i].createdAt);
                    const nextDate = new Date(results[i + 1].createdAt);
                    expect(currentDate.getTime()).toBeGreaterThanOrEqual(nextDate.getTime());
                  }
                  break;
                case 'trending':
                  // Should prioritize communities with recent activity and high member count
                  for (let i = 0; i < results.length - 1; i++) {
                    expect(results[i].memberCount).toBeGreaterThanOrEqual(results[i + 1].memberCount);
                  }
                  break;
              }
            }

            // Property 4: Each result should have required community information
            for (const result of results) {
              expect(result).toHaveProperty('id');
              expect(result).toHaveProperty('name');
              expect(result).toHaveProperty('slug');
              expect(result).toHaveProperty('memberCount');
              expect(result).toHaveProperty('creator');
              expect(result).toHaveProperty('_count');
              expect(result._count).toHaveProperty('memberships');
              expect(result._count).toHaveProperty('posts');
              expect(result._count).toHaveProperty('courses');
            }
            
            return true; // Property holds
          }
        ),
        { numRuns: 10 } // Reduced runs due to database operations
      );

      // Property: Bookmarking functionality should work correctly (Requirements 8.6)
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            communities: fc.array(
              fc.record({
                name: fc.stringOf(
                  fc.char().filter(c => /[a-zA-Z0-9 ._-]/.test(c)), 
                  { minLength: 1, maxLength: 100 }
                ),
                category: fc.option(fc.constantFrom(
                  'Technology', 'Business', 'Health', 'Education', 'Arts', 'Science'
                ))
              }),
              { minLength: 1, maxLength: 5 }
            )
          }),
          async ({ communities }) => {
            // Create test user
            const user = await dbUtils.createUser();
            const fullUser = await prisma.user.findUnique({
              where: { id: user.id }
            });
            
            if (!fullUser) {
              return true; // Skip if user not found
            }
            
            const { accessToken } = generateTokenPair(fullUser);

            // Create test communities
            const createdCommunities = [];
            for (const communityData of communities) {
              const slug = `test-${communityData.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              
              const community = await dbUtils.createCommunity(user.id, {
                name: communityData.name,
                slug,
                isPublic: true
              });

              // Update category if provided
              if (communityData.category) {
                await prisma.community.update({
                  where: { id: community.id },
                  data: { category: communityData.category }
                });
              }

              createdCommunities.push(community);
            }

            // Test bookmarking functionality
            for (const community of createdCommunities) {
              // Bookmark the community
              const bookmarkResponse = await request(app)
                .post(`/api/v1/communities/${community.id}/bookmark`)
                .set('Authorization', `Bearer ${accessToken}`);

              expect(bookmarkResponse.status).toBe(201);
              expect(bookmarkResponse.body).toHaveProperty('data');
              expect(bookmarkResponse.body.data).toHaveProperty('community');
              expect(bookmarkResponse.body.data.community.id).toBe(community.id);

              // Verify bookmark appears in user's bookmarks
              const bookmarksResponse = await request(app)
                .get('/api/v1/communities/bookmarks')
                .set('Authorization', `Bearer ${accessToken}`);

              expect(bookmarksResponse.status).toBe(200);
              expect(bookmarksResponse.body).toHaveProperty('data');
              expect(bookmarksResponse.body.data).toHaveProperty('bookmarks');
              
              const bookmarkedIds = bookmarksResponse.body.data.bookmarks.map((b: any) => b.id);
              expect(bookmarkedIds).toContain(community.id);
            }

            // Property: Cannot bookmark the same community twice
            if (createdCommunities.length > 0) {
              const firstCommunity = createdCommunities[0];
              
              const duplicateBookmarkResponse = await request(app)
                .post(`/api/v1/communities/${firstCommunity.id}/bookmark`)
                .set('Authorization', `Bearer ${accessToken}`);

              expect(duplicateBookmarkResponse.status).toBe(409);
              expect(duplicateBookmarkResponse.body).toHaveProperty('error');
            }

            // Test removing bookmarks
            for (const community of createdCommunities) {
              const removeBookmarkResponse = await request(app)
                .delete(`/api/v1/communities/${community.id}/bookmark`)
                .set('Authorization', `Bearer ${accessToken}`);

              expect(removeBookmarkResponse.status).toBe(200);

              // Verify bookmark is removed
              const bookmarksResponse = await request(app)
                .get('/api/v1/communities/bookmarks')
                .set('Authorization', `Bearer ${accessToken}`);

              const bookmarkedIds = bookmarksResponse.body.data.bookmarks.map((b: any) => b.id);
              expect(bookmarkedIds).not.toContain(community.id);
            }
            
            return true; // Property holds
          }
        ),
        { numRuns: 10 } // Reduced runs due to database operations
      );
    }
  );
});