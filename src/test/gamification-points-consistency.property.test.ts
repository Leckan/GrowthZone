import * as fc from 'fast-check';
import { PrismaClient } from '@prisma/client';
import { createPropertyTest } from './propertyTestConfig';
import { DatabaseTestUtils } from './testUtils';
import { PointsService, DEFAULT_POINT_RULES, DEFAULT_ACHIEVEMENTS } from '../lib/pointsService';
import { AchievementService } from '../lib/achievementService';

/**
 * Property-based tests for gamification points consistency
 * Feature: community-learning-platform, Property 9: Gamification Points Consistency
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

describe('Gamification Points Consistency Properties', () => {
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
    9,
    'Gamification Points Consistency',
    ['5.1', '5.2', '5.3', '5.4', '5.5', '5.6'],
    async () => {
      // Test points awarding based on predefined rules (Requirement 5.1)
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...Object.keys(DEFAULT_POINT_RULES)),
          async (action) => {
            // Create test user and community with proper membership
            const user = await dbUtils.createUser();
            const community = await dbUtils.createCommunity(user.id);
            
            // Create community membership for the user
            await prisma.communityMembership.create({
              data: {
                userId: user.id,
                communityId: community.id,
                role: 'admin',
                status: 'active'
              }
            });

            // Get initial user points
            const initialUser = await prisma.user.findUnique({
              where: { id: user.id },
              select: { totalPoints: true }
            });

            if (!initialUser) return false;

            const initialPoints = initialUser.totalPoints;
            const expectedPoints = DEFAULT_POINT_RULES[action].points;

            // Award points for the action
            const result = await PointsService.awardPointsForAction(
              user.id,
              community.id,
              action
            );

            // Verify points transaction was created with correct values
            const transactionCorrect = 
              result.transaction.points === expectedPoints &&
              result.transaction.reason === DEFAULT_POINT_RULES[action].description &&
              result.transaction.userId === user.id &&
              result.transaction.communityId === community.id;

            // Verify user's total points were updated immediately (Requirement 5.3)
            const updatedUser = await prisma.user.findUnique({
              where: { id: user.id },
              select: { totalPoints: true }
            });

            const pointsUpdatedImmediately = 
              updatedUser !== null &&
              updatedUser.totalPoints === initialPoints + expectedPoints &&
              result.newTotalPoints === updatedUser.totalPoints;

            return transactionCorrect && pointsUpdatedImmediately;
          }
        ),
        { numRuns: 10, timeout: 30000 }
      );

      // Test cumulative points tracking across multiple communities (Requirement 5.2)
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.constantFrom(...Object.keys(DEFAULT_POINT_RULES)), { minLength: 2, maxLength: 4 }),
          async (actions) => {
            // Create test user and two communities
            const user = await dbUtils.createUser();
            const community1 = await dbUtils.createCommunity(user.id);
            const community2 = await dbUtils.createCommunity(user.id);
            
            // Create community memberships
            await prisma.communityMembership.createMany({
              data: [
                {
                  userId: user.id,
                  communityId: community1.id,
                  role: 'admin',
                  status: 'active'
                },
                {
                  userId: user.id,
                  communityId: community2.id,
                  role: 'admin',
                  status: 'active'
                }
              ]
            });

            let expectedTotalPoints = 0;

            // Award points across different communities
            for (let i = 0; i < actions.length; i++) {
              const action = actions[i];
              const community = i % 2 === 0 ? community1 : community2;
              const pointsForAction = DEFAULT_POINT_RULES[action].points;
              
              await PointsService.awardPointsForAction(user.id, community.id, action);
              expectedTotalPoints += pointsForAction;
            }

            // Verify cumulative points are tracked correctly across all communities
            const finalUser = await prisma.user.findUnique({
              where: { id: user.id },
              select: { totalPoints: true }
            });

            return finalUser !== null && finalUser.totalPoints === expectedTotalPoints;
          }
        ),
        { numRuns: 8, timeout: 30000 }
      );

      // Test custom point values for activities (Requirement 5.5)
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }), // custom action name
          fc.integer({ min: 1, max: 100 }), // custom points value
          async (customAction, customPoints) => {
            // Create test user and community with membership
            const user = await dbUtils.createUser();
            const community = await dbUtils.createCommunity(user.id);
            
            await prisma.communityMembership.create({
              data: {
                userId: user.id,
                communityId: community.id,
                role: 'admin',
                status: 'active'
              }
            });

            // Get initial user points
            const initialUser = await prisma.user.findUnique({
              where: { id: user.id },
              select: { totalPoints: true }
            });

            if (!initialUser) return false;

            const initialPoints = initialUser.totalPoints;

            // Award custom points for custom action
            const result = await PointsService.awardPointsForAction(
              user.id,
              community.id,
              customAction,
              undefined,
              customPoints
            );

            // Verify custom points were awarded correctly
            const customPointsCorrect = 
              result.transaction.points === customPoints &&
              result.transaction.reason === `Custom action: ${customAction}`;

            // Verify user's total points reflect custom value
            const updatedUser = await prisma.user.findUnique({
              where: { id: user.id },
              select: { totalPoints: true }
            });

            const totalPointsCorrect = 
              updatedUser !== null &&
              updatedUser.totalPoints === initialPoints + customPoints;

            return customPointsCorrect && totalPointsCorrect;
          }
        ),
        { numRuns: 8, timeout: 30000 }
      );

      // Test achievement badges for point milestones (Requirement 5.6)
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 1500 }), // points to award
          async (pointsToAward) => {
            // Create test user and community with membership
            const user = await dbUtils.createUser();
            const community = await dbUtils.createCommunity(user.id);
            
            await prisma.communityMembership.create({
              data: {
                userId: user.id,
                communityId: community.id,
                role: 'admin',
                status: 'active'
              }
            });

            // Award the specified points through multiple transactions
            let remainingPoints = pointsToAward;
            while (remainingPoints > 0) {
              const pointsThisTransaction = Math.min(remainingPoints, 50);
              await PointsService.awardPoints({
                userId: user.id,
                communityId: community.id,
                points: pointsThisTransaction,
                reason: 'Test points'
              });
              remainingPoints -= pointsThisTransaction;
            }

            // Get user achievements
            const achievements = await AchievementService.getUserAchievementProgress(user.id);
            const milestones = await AchievementService.getUserMilestones(user.id);

            // Verify achievements are awarded correctly based on points
            const expectedEarnedAchievements = DEFAULT_ACHIEVEMENTS.filter(
              (achievement) => pointsToAward >= achievement.pointsRequired
            );

            const achievementsCorrect = achievements.every(achievement => {
              const shouldBeEarned = pointsToAward >= achievement.achievement.pointsRequired;
              return achievement.isEarned === shouldBeEarned;
            });

            // Verify milestone tracking
            const milestonesCorrect = 
              milestones.currentPoints === pointsToAward &&
              milestones.earnedAchievements.length === expectedEarnedAchievements.length;

            return achievementsCorrect && milestonesCorrect;
          }
        ),
        { numRuns: 10, timeout: 30000 }
      );

      // Test leaderboard functionality (Requirement 5.4)
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.array(fc.constantFrom(...Object.keys(DEFAULT_POINT_RULES)), { minLength: 1, maxLength: 2 }),
            { minLength: 2, maxLength: 3 }
          ),
          async (userActivities) => {
            // Create test community
            const creator = await dbUtils.createUser();
            const community = await dbUtils.createCommunity(creator.id);

            // Create creator membership
            await prisma.communityMembership.create({
              data: {
                userId: creator.id,
                communityId: community.id,
                role: 'admin',
                status: 'active'
              }
            });

            // Create users and award points
            const expectedScores: Array<{ userId: string; points: number }> = [];

            for (const actions of userActivities) {
              const user = await dbUtils.createUser();
              
              // Create membership for user
              await prisma.communityMembership.create({
                data: {
                  userId: user.id,
                  communityId: community.id,
                  role: 'member',
                  status: 'active'
                }
              });
              
              let totalPoints = 0;
              for (const action of actions) {
                await PointsService.awardPointsForAction(user.id, community.id, action);
                totalPoints += DEFAULT_POINT_RULES[action].points;
              }
              expectedScores.push({ userId: user.id, points: totalPoints });
            }

            // Sort expected scores in descending order
            expectedScores.sort((a, b) => b.points - a.points);

            // Get community leaderboard
            const leaderboard = await PointsService.getCommunityLeaderboard({
              communityId: community.id,
              limit: userActivities.length
            });

            // Verify leaderboard shows top-performing members in correct order
            const leaderboardCorrect = leaderboard.length === expectedScores.length &&
              leaderboard.every((entry, index) => {
                const expected = expectedScores[index];
                return entry.user?.id === expected.userId &&
                       entry.points === expected.points &&
                       entry.rank === index + 1;
              });

            return leaderboardCorrect;
          }
        ),
        { numRuns: 5, timeout: 30000 }
      );

      // Test daily login bonus idempotency (special case for points rules)
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 4 }), // number of login attempts in same day
          async (loginAttempts) => {
            // Create test user and community with membership
            const user = await dbUtils.createUser();
            const community = await dbUtils.createCommunity(user.id);
            
            await prisma.communityMembership.create({
              data: {
                userId: user.id,
                communityId: community.id,
                role: 'admin',
                status: 'active'
              }
            });

            // Get initial points
            const initialUser = await prisma.user.findUnique({
              where: { id: user.id },
              select: { totalPoints: true }
            });

            if (!initialUser) return false;

            const initialPoints = initialUser.totalPoints;

            // Attempt daily login bonus multiple times
            const results = [];
            for (let i = 0; i < loginAttempts; i++) {
              const result = await PointsService.awardDailyLoginBonus(user.id, community.id);
              results.push(result);
            }

            // Only first attempt should succeed
            const firstSucceeded = results[0] !== null;
            const subsequentFailed = results.slice(1).every(result => result === null);

            // Verify only one daily bonus was awarded
            const finalUser = await prisma.user.findUnique({
              where: { id: user.id },
              select: { totalPoints: true }
            });

            const expectedFinalPoints = initialPoints + (firstSucceeded ? DEFAULT_POINT_RULES.DAILY_LOGIN.points : 0);
            const pointsCorrect = finalUser !== null && finalUser.totalPoints === expectedFinalPoints;

            return firstSucceeded && subsequentFailed && pointsCorrect;
          }
        ),
        { numRuns: 5, timeout: 30000 }
      );
    }
  );
});