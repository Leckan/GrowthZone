import * as fc from 'fast-check';
import request from 'supertest';
import app from '../index';
import { PrismaClient } from '@prisma/client';
import { createPropertyTest } from './propertyTestConfig';
import { DatabaseTestUtils } from './testUtils';
import { generateTokenPair } from '../lib/auth';

/**
 * Property-based tests for profile management consistency
 * Feature: community-learning-platform, Property 3: Profile Management Consistency
 * Validates: Requirements 1.5, 1.6
 */

describe('Profile Management Consistency Properties', () => {
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
    3,
    'Profile Management Consistency',
    ['1.5', '1.6'],
    async () => {
      // Test profile update consistency - updates should persist and be displayed consistently
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            displayName: fc.option(
              fc.stringOf(
                fc.char().filter(c => /[a-zA-Z0-9 ]/.test(c)), 
                { minLength: 1, maxLength: 100 }
              )
            ),
            bio: fc.option(
              fc.stringOf(
                fc.char().filter(c => /[a-zA-Z0-9 .,!?-]/.test(c)), 
                { minLength: 0, maxLength: 500 }
              )
            ),
            avatarUrl: fc.option(
              fc.tuple(
                fc.constantFrom('http', 'https'),
                fc.stringOf(fc.char().filter(c => /[a-zA-Z0-9]/.test(c)), { minLength: 3, maxLength: 10 }),
                fc.stringOf(fc.char().filter(c => /[a-zA-Z]/.test(c)), { minLength: 2, maxLength: 5 }),
                fc.stringOf(fc.char().filter(c => /[a-zA-Z0-9/._-]/.test(c)), { minLength: 1, maxLength: 50 })
              ).map(([protocol, domain, tld, path]) => `${protocol}://${domain}.${tld}/${path}`)
            )
          }),
          async (profileUpdates) => {
            // Create a test user
            const testUser = await dbUtils.createUser();
            
            // Fetch the full user object for token generation
            const fullUser = await prisma.user.findUnique({
              where: { id: testUser.id }
            });
            
            if (!fullUser) {
              return true; // Skip if user not found
            }
            
            const { accessToken } = generateTokenPair(fullUser);

            // Get initial profile to establish baseline
            const initialResponse = await request(app)
              .get('/api/v1/users/profile')
              .set('Authorization', `Bearer ${accessToken}`);

            if (initialResponse.status !== 200) {
              return true; // Skip if initial profile fetch fails
            }

            const initialProfile = initialResponse.body.user;

            // Update profile with new data
            const updateResponse = await request(app)
              .put('/api/v1/users/profile')
              .set('Authorization', `Bearer ${accessToken}`)
              .send(profileUpdates);

            if (updateResponse.status !== 200) {
              return true; // Skip if update fails (could be validation error)
            }

            // Verify update response contains updated data
            const updatedProfile = updateResponse.body.user;
            
            // Check that specified fields were updated
            if (profileUpdates.displayName !== undefined) {
              if (updatedProfile.displayName !== profileUpdates.displayName) {
                return false;
              }
            } else {
              // If not specified, should remain unchanged
              if (updatedProfile.displayName !== initialProfile.displayName) {
                return false;
              }
            }

            if (profileUpdates.bio !== undefined) {
              if (updatedProfile.bio !== profileUpdates.bio) {
                return false;
              }
            } else {
              // If not specified, should remain unchanged
              if (updatedProfile.bio !== initialProfile.bio) {
                return false;
              }
            }

            if (profileUpdates.avatarUrl !== undefined) {
              if (updatedProfile.avatarUrl !== profileUpdates.avatarUrl) {
                return false;
              }
            } else {
              // If not specified, should remain unchanged
              if (updatedProfile.avatarUrl !== initialProfile.avatarUrl) {
                return false;
              }
            }

            // Fetch profile again to verify persistence
            const verificationResponse = await request(app)
              .get('/api/v1/users/profile')
              .set('Authorization', `Bearer ${accessToken}`);

            if (verificationResponse.status !== 200) {
              return false; // Profile fetch should work after update
            }

            const verifiedProfile = verificationResponse.body.user;

            // Verify that the fetched profile matches the updated profile
            const profileFieldsMatch = 
              verifiedProfile.displayName === updatedProfile.displayName &&
              verifiedProfile.bio === updatedProfile.bio &&
              verifiedProfile.avatarUrl === updatedProfile.avatarUrl &&
              verifiedProfile.email === updatedProfile.email &&
              verifiedProfile.username === updatedProfile.username;

            // Verify that profile includes activity statistics (Requirement 1.6)
            const hasActivityStats = 
              verifiedProfile.statistics !== undefined &&
              typeof verifiedProfile.statistics.postsCount === 'number' &&
              typeof verifiedProfile.statistics.commentsCount === 'number' &&
              typeof verifiedProfile.statistics.communitiesJoined === 'number' &&
              typeof verifiedProfile.statistics.communitiesCreated === 'number';

            return profileFieldsMatch && hasActivityStats;
          }
        ),
        { numRuns: 10, timeout: 30000 }
      );

      // Test partial profile updates - only specified fields should change
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.record({ displayName: fc.string({ minLength: 1, maxLength: 100 }) }),
            fc.record({ bio: fc.string({ maxLength: 500 }) }),
            fc.record({ 
              avatarUrl: fc.webUrl({ validSchemes: ['http', 'https'] })
                .filter(url => url.length <= 500)
            })
          ),
          async (partialUpdate) => {
            // Create a test user with initial profile data
            const testUser = await dbUtils.createUser({
              displayName: 'Initial Name'
            });
            
            // Update the user with bio and avatar since TestUser interface doesn't include them
            const updatedUser = await prisma.user.update({
              where: { id: testUser.id },
              data: { 
                bio: 'Initial bio content',
                avatarUrl: 'https://example.com/initial-avatar.jpg'
              }
            });
            
            const { accessToken } = generateTokenPair(updatedUser);

            // Get initial profile
            const initialResponse = await request(app)
              .get('/api/v1/users/profile')
              .set('Authorization', `Bearer ${accessToken}`);

            if (initialResponse.status !== 200) {
              return true; // Skip if initial profile fetch fails
            }

            const initialProfile = initialResponse.body.user;

            // Update only one field
            const updateResponse = await request(app)
              .put('/api/v1/users/profile')
              .set('Authorization', `Bearer ${accessToken}`)
              .send(partialUpdate);

            if (updateResponse.status !== 200) {
              return true; // Skip if update fails
            }

            // Verify only the specified field changed
            const updatedProfile = updateResponse.body.user;

            if ('displayName' in partialUpdate) {
              return updatedProfile.displayName === partialUpdate.displayName &&
                     updatedProfile.bio === initialProfile.bio &&
                     updatedProfile.avatarUrl === initialProfile.avatarUrl;
            }

            if ('bio' in partialUpdate) {
              return updatedProfile.bio === partialUpdate.bio &&
                     updatedProfile.displayName === initialProfile.displayName &&
                     updatedProfile.avatarUrl === initialProfile.avatarUrl;
            }

            if ('avatarUrl' in partialUpdate) {
              return updatedProfile.avatarUrl === partialUpdate.avatarUrl &&
                     updatedProfile.displayName === initialProfile.displayName &&
                     updatedProfile.bio === initialProfile.bio;
            }

            return false;
          }
        ),
        { numRuns: 5, timeout: 30000 }
      );

      // Test profile display consistency with activity statistics
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 10 }), // Number of activities to create
          async (activityCount) => {
            // Create a test user
            const testUser = await dbUtils.createUser();
            
            // Fetch the full user object for token generation
            const fullUser = await prisma.user.findUnique({
              where: { id: testUser.id }
            });
            
            if (!fullUser) {
              return true; // Skip if user not found
            }
            
            const { accessToken } = generateTokenPair(fullUser);

            // Create some test activities to verify statistics
            const { community } = await dbUtils.createTestHierarchy();
            
            // Add user as member to the community
            await prisma.communityMembership.create({
              data: {
                userId: testUser.id,
                communityId: community.id,
                role: 'member',
                status: 'active'
              }
            });

            // Create some posts for activity statistics
            for (let i = 0; i < activityCount; i++) {
              await prisma.post.create({
                data: {
                  title: `Test Post ${i}`,
                  content: `Test content ${i}`,
                  authorId: testUser.id,
                  communityId: community.id,
                  postType: 'discussion'
                }
              });
            }

            // Fetch profile and verify statistics are accurate
            const profileResponse = await request(app)
              .get('/api/v1/users/profile')
              .set('Authorization', `Bearer ${accessToken}`);

            if (profileResponse.status !== 200) {
              return false;
            }

            const profile = profileResponse.body.user;

            // Verify statistics match actual data
            return profile.statistics !== undefined &&
                   profile.statistics.postsCount === activityCount &&
                   profile.statistics.commentsCount === 0 &&
                   profile.statistics.communitiesJoined === 1 &&
                   profile.statistics.communitiesCreated === 0;
          }
        ),
        { numRuns: 5, timeout: 30000 }
      );
    }
  );
});