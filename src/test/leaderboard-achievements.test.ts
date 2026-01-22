import prisma from '../lib/prisma';
import { PointsService } from '../lib/pointsService';
import { AchievementService } from '../lib/achievementService';
import { DatabaseTestUtils } from './testUtils';

describe('Leaderboard Calculations and Achievement Badge Awarding', () => {
  let dbUtils: DatabaseTestUtils;
  let testUsers: any[] = [];
  let testCommunity: any;

  beforeAll(async () => {
    dbUtils = new DatabaseTestUtils(prisma);
  });

  beforeEach(async () => {
    // Clean up before each test
    await dbUtils.cleanup();
    
    // Create test community and users
    const creator = await dbUtils.createUser({ username: 'creator', email: 'creator@test.com' });
    testCommunity = await dbUtils.createCommunity(creator.id);
    
    // Create multiple test users with different point levels
    testUsers = [
      await dbUtils.createUser({ username: 'user1', email: 'user1@test.com' }),
      await dbUtils.createUser({ username: 'user2', email: 'user2@test.com' }),
      await dbUtils.createUser({ username: 'user3', email: 'user3@test.com' }),
      await dbUtils.createUser({ username: 'user4', email: 'user4@test.com' }),
      await dbUtils.createUser({ username: 'user5', email: 'user5@test.com' })
    ];
  });

  afterAll(async () => {
    await dbUtils.cleanup();
  });

  describe('Leaderboard Ranking Algorithms', () => {
    describe('Community Leaderboard', () => {
      it('should rank users correctly by total points in descending order', async () => {
        // Award different amounts of points to users
        await PointsService.awardPoints({
          userId: testUsers[0].id,
          communityId: testCommunity.id,
          points: 100,
          reason: 'Test points'
        });
        
        await PointsService.awardPoints({
          userId: testUsers[1].id,
          communityId: testCommunity.id,
          points: 250,
          reason: 'Test points'
        });
        
        await PointsService.awardPoints({
          userId: testUsers[2].id,
          communityId: testCommunity.id,
          points: 50,
          reason: 'Test points'
        });

        const leaderboard = await PointsService.getCommunityLeaderboard({
          communityId: testCommunity.id,
          limit: 10
        });

        // Verify correct ranking order
        expect(leaderboard).toHaveLength(3);
        expect(leaderboard[0].rank).toBe(1);
        expect(leaderboard[0].points).toBe(250);
        expect(leaderboard[0].user?.id).toBe(testUsers[1].id);
        
        expect(leaderboard[1].rank).toBe(2);
        expect(leaderboard[1].points).toBe(100);
        expect(leaderboard[1].user?.id).toBe(testUsers[0].id);
        
        expect(leaderboard[2].rank).toBe(3);
        expect(leaderboard[2].points).toBe(50);
        expect(leaderboard[2].user?.id).toBe(testUsers[2].id);
      });

      it('should handle ties correctly by maintaining consistent ordering', async () => {
        // Award same points to multiple users
        await PointsService.awardPoints({
          userId: testUsers[0].id,
          communityId: testCommunity.id,
          points: 100,
          reason: 'Test points'
        });
        
        await PointsService.awardPoints({
          userId: testUsers[1].id,
          communityId: testCommunity.id,
          points: 100,
          reason: 'Test points'
        });

        const leaderboard = await PointsService.getCommunityLeaderboard({
          communityId: testCommunity.id,
          limit: 10
        });

        // Both users should have same points but different ranks
        expect(leaderboard).toHaveLength(2);
        expect(leaderboard[0].points).toBe(100);
        expect(leaderboard[1].points).toBe(100);
        expect(leaderboard[0].rank).toBe(1);
        expect(leaderboard[1].rank).toBe(2);
      });

      it('should respect limit parameter correctly', async () => {
        // Award points to all test users
        for (let i = 0; i < testUsers.length; i++) {
          await PointsService.awardPoints({
            userId: testUsers[i].id,
            communityId: testCommunity.id,
            points: (i + 1) * 10,
            reason: 'Test points'
          });
        }

        const leaderboard = await PointsService.getCommunityLeaderboard({
          communityId: testCommunity.id,
          limit: 3
        });

        expect(leaderboard).toHaveLength(3);
        // Should return top 3 users
        expect(leaderboard[0].points).toBe(50); // user5: 5 * 10
        expect(leaderboard[1].points).toBe(40); // user4: 4 * 10
        expect(leaderboard[2].points).toBe(30); // user3: 3 * 10
      });

      it('should filter by timeframe correctly', async () => {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Award points at different times (simulated by creating transactions directly)
        await prisma.pointsTransaction.create({
          data: {
            userId: testUsers[0].id,
            communityId: testCommunity.id,
            points: 100,
            reason: 'Old points',
            createdAt: lastWeek
          }
        });

        await PointsService.awardPoints({
          userId: testUsers[1].id,
          communityId: testCommunity.id,
          points: 50,
          reason: 'Recent points'
        });

        // Test daily leaderboard (should only include today's points)
        const dailyLeaderboard = await PointsService.getCommunityLeaderboard({
          communityId: testCommunity.id,
          timeframe: 'day',
          limit: 10
        });

        expect(dailyLeaderboard).toHaveLength(1);
        expect(dailyLeaderboard[0].user?.id).toBe(testUsers[1].id);
        expect(dailyLeaderboard[0].points).toBe(50);

        // Test all-time leaderboard (should include all points)
        const allTimeLeaderboard = await PointsService.getCommunityLeaderboard({
          communityId: testCommunity.id,
          timeframe: 'all',
          limit: 10
        });

        expect(allTimeLeaderboard).toHaveLength(2);
      });

      it('should only include points from specified community', async () => {
        // Create another community
        const anotherCommunity = await dbUtils.createCommunity(testUsers[0].id);

        // Award points in both communities
        await PointsService.awardPoints({
          userId: testUsers[0].id,
          communityId: testCommunity.id,
          points: 100,
          reason: 'Community 1 points'
        });

        await PointsService.awardPoints({
          userId: testUsers[0].id,
          communityId: anotherCommunity.id,
          points: 200,
          reason: 'Community 2 points'
        });

        const community1Leaderboard = await PointsService.getCommunityLeaderboard({
          communityId: testCommunity.id,
          limit: 10
        });

        const community2Leaderboard = await PointsService.getCommunityLeaderboard({
          communityId: anotherCommunity.id,
          limit: 10
        });

        expect(community1Leaderboard).toHaveLength(1);
        expect(community1Leaderboard[0].points).toBe(100);

        expect(community2Leaderboard).toHaveLength(1);
        expect(community2Leaderboard[0].points).toBe(200);
      });
    });

    describe('Global Leaderboard', () => {
      it('should rank users by total points across all communities', async () => {
        // Award points to users in different communities
        await PointsService.awardPoints({
          userId: testUsers[0].id,
          communityId: testCommunity.id,
          points: 150,
          reason: 'Test points'
        });

        await PointsService.awardPoints({
          userId: testUsers[1].id,
          communityId: testCommunity.id,
          points: 300,
          reason: 'Test points'
        });

        const globalLeaderboard = await PointsService.getGlobalLeaderboard(10);

        // Filter to only our test users who have points
        const testUserLeaderboard = globalLeaderboard.filter(entry => 
          testUsers.some(user => user.id === entry.user.id) && entry.points > 0
        );

        expect(testUserLeaderboard).toHaveLength(2);
        expect(testUserLeaderboard[0].points).toBe(300);
        expect(testUserLeaderboard[0].user.id).toBe(testUsers[1].id);

        expect(testUserLeaderboard[1].points).toBe(150);
        expect(testUserLeaderboard[1].user.id).toBe(testUsers[0].id);
      });

      it('should accumulate points from multiple communities for same user', async () => {
        const anotherCommunity = await dbUtils.createCommunity(testUsers[0].id);

        // Award points in multiple communities to same user
        await PointsService.awardPoints({
          userId: testUsers[0].id,
          communityId: testCommunity.id,
          points: 100,
          reason: 'Community 1 points'
        });

        await PointsService.awardPoints({
          userId: testUsers[0].id,
          communityId: anotherCommunity.id,
          points: 150,
          reason: 'Community 2 points'
        });

        const globalLeaderboard = await PointsService.getGlobalLeaderboard(10);

        // Filter to only our test user
        const testUserEntry = globalLeaderboard.find(entry => entry.user.id === testUsers[0].id);

        expect(testUserEntry).toBeDefined();
        expect(testUserEntry!.points).toBe(250); // 100 + 150
      });
    });

    describe('Achievement Leaderboard', () => {
      it('should rank users by achievement count correctly', async () => {
        // Award different amounts of points to trigger different achievement levels
        await PointsService.awardPoints({
          userId: testUsers[0].id,
          communityId: testCommunity.id,
          points: 50, // Should earn 'Newcomer' (10 points) achievement
          reason: 'Test points'
        });

        await PointsService.awardPoints({
          userId: testUsers[1].id,
          communityId: testCommunity.id,
          points: 150, // Should earn 'Newcomer' (10) and 'Contributor' (100) achievements
          reason: 'Test points'
        });

        await PointsService.awardPoints({
          userId: testUsers[2].id,
          communityId: testCommunity.id,
          points: 600, // Should earn multiple achievements
          reason: 'Test points'
        });

        const achievementLeaderboard = await AchievementService.getAchievementLeaderboard(10);

        // Filter to only our test users who have achievements
        const testUserLeaderboard = achievementLeaderboard.filter(entry => 
          testUsers.some(user => user.id === entry.user.id) && entry.achievementCount > 0
        );

        expect(testUserLeaderboard).toHaveLength(3);
        
        // User with 600 points should be first (most achievements)
        expect(testUserLeaderboard[0].user.id).toBe(testUsers[2].id);
        expect(testUserLeaderboard[0].achievementCount).toBe(3); // Newcomer, Contributor, Active Member
        
        // User with 150 points should be second
        expect(testUserLeaderboard[1].user.id).toBe(testUsers[1].id);
        expect(testUserLeaderboard[1].achievementCount).toBe(2); // Newcomer, Contributor
        
        // User with 50 points should be third
        expect(testUserLeaderboard[2].user.id).toBe(testUsers[0].id);
        expect(testUserLeaderboard[2].achievementCount).toBe(1); // Newcomer only
      });

      it('should include achievement details in leaderboard', async () => {
        await PointsService.awardPoints({
          userId: testUsers[0].id,
          communityId: testCommunity.id,
          points: 150,
          reason: 'Test points'
        });

        const achievementLeaderboard = await AchievementService.getAchievementLeaderboard(10);

        // Filter to only our test user
        const testUserEntry = achievementLeaderboard.find(entry => entry.user.id === testUsers[0].id);

        expect(testUserEntry).toBeDefined();
        expect(testUserEntry!).toHaveProperty('achievements');
        expect(Array.isArray(testUserEntry!.achievements)).toBe(true);
        expect(testUserEntry!.achievements.length).toBe(2);
        
        // Check achievement structure
        const achievement = testUserEntry!.achievements[0];
        expect(achievement).toHaveProperty('id');
        expect(achievement).toHaveProperty('name');
        expect(achievement).toHaveProperty('description');
        expect(achievement).toHaveProperty('pointsRequired');
        expect(achievement).toHaveProperty('badgeIcon');
      });
    });
  });

  describe('Achievement Badge Awarding', () => {
    it('should award correct achievements based on point thresholds', async () => {
      // Test each achievement threshold
      const testCases = [
        { points: 5, expectedAchievements: 0 },
        { points: 15, expectedAchievements: 1 }, // Newcomer (10 points)
        { points: 150, expectedAchievements: 2 }, // Newcomer + Contributor (100 points)
        { points: 600, expectedAchievements: 3 }, // + Active Member (500 points)
        { points: 1200, expectedAchievements: 4 }, // + Community Champion (1000 points)
        { points: 6000, expectedAchievements: 5 } // + Legend (5000 points)
      ];

      for (const testCase of testCases) {
        const user = await dbUtils.createUser({ 
          username: `user_${testCase.points}`, 
          email: `user_${testCase.points}@test.com` 
        });

        await PointsService.awardPoints({
          userId: user.id,
          communityId: testCommunity.id,
          points: testCase.points,
          reason: 'Achievement test'
        });

        const achievements = await AchievementService.checkAndAwardAchievements(user.id);
        expect(achievements).toHaveLength(testCase.expectedAchievements);
      }
    });

    it('should return achievements in correct order (by points required)', async () => {
      await PointsService.awardPoints({
        userId: testUsers[0].id,
        communityId: testCommunity.id,
        points: 1500,
        reason: 'Test points'
      });

      const achievements = await AchievementService.checkAndAwardAchievements(testUsers[0].id);
      
      expect(achievements).toHaveLength(4);
      expect(achievements[0].pointsRequired).toBe(10); // Newcomer
      expect(achievements[1].pointsRequired).toBe(100); // Contributor
      expect(achievements[2].pointsRequired).toBe(500); // Active Member
      expect(achievements[3].pointsRequired).toBe(1000); // Community Champion
    });

    it('should calculate achievement progress correctly', async () => {
      await PointsService.awardPoints({
        userId: testUsers[0].id,
        communityId: testCommunity.id,
        points: 250, // Between Contributor (100) and Active Member (500)
        reason: 'Test points'
      });

      const progress = await AchievementService.getUserAchievementProgress(testUsers[0].id);
      
      expect(progress).toHaveLength(5); // Total number of achievements
      
      // Check earned achievements
      expect(progress[0].isEarned).toBe(true); // Newcomer (10 points)
      expect(progress[0].progress).toBe(1);
      
      expect(progress[1].isEarned).toBe(true); // Contributor (100 points)
      expect(progress[1].progress).toBe(1);
      
      // Check progress towards next achievement
      expect(progress[2].isEarned).toBe(false); // Active Member (500 points)
      expect(progress[2].progress).toBe(0.5); // 250/500 = 0.5
      
      expect(progress[3].isEarned).toBe(false); // Community Champion (1000 points)
      expect(progress[3].progress).toBe(0.25); // 250/1000 = 0.25
    });

    it('should handle milestone tracking correctly', async () => {
      await PointsService.awardPoints({
        userId: testUsers[0].id,
        communityId: testCommunity.id,
        points: 750,
        reason: 'Test points'
      });

      const milestones = await AchievementService.getUserMilestones(testUsers[0].id);
      
      expect(milestones.currentPoints).toBe(750);
      expect(milestones.earnedAchievements).toHaveLength(3); // Newcomer, Contributor, Active Member
      expect(milestones.nextAchievement?.id).toBe('community_champion');
      expect(milestones.pointsToNext).toBe(250); // 1000 - 750
      expect(milestones.progressToNext).toBe(0.75); // 750/1000
    });

    it('should handle edge case when user has maximum achievements', async () => {
      await PointsService.awardPoints({
        userId: testUsers[0].id,
        communityId: testCommunity.id,
        points: 10000, // More than highest achievement
        reason: 'Test points'
      });

      const milestones = await AchievementService.getUserMilestones(testUsers[0].id);
      
      expect(milestones.currentPoints).toBe(10000);
      expect(milestones.earnedAchievements).toHaveLength(5); // All achievements
      expect(milestones.nextAchievement).toBeUndefined();
      expect(milestones.pointsToNext).toBe(0);
      expect(milestones.progressToNext).toBe(1);
    });

    it('should calculate achievement statistics correctly', async () => {
      // Create users with different achievement levels
      const users = [];
      for (let i = 0; i < 5; i++) {
        const user = await dbUtils.createUser({ 
          username: `stats_user_${i}`, 
          email: `stats_user_${i}@test.com` 
        });
        users.push(user);
      }

      // Award different points to create achievement distribution
      await PointsService.awardPoints({
        userId: users[0].id,
        communityId: testCommunity.id,
        points: 50, // 1 achievement
        reason: 'Test'
      });

      await PointsService.awardPoints({
        userId: users[1].id,
        communityId: testCommunity.id,
        points: 150, // 2 achievements
        reason: 'Test'
      });

      await PointsService.awardPoints({
        userId: users[2].id,
        communityId: testCommunity.id,
        points: 600, // 3 achievements
        reason: 'Test'
      });

      const stats = await AchievementService.getAchievementStats();
      
      expect(stats.totalUsers).toBeGreaterThanOrEqual(3);
      expect(stats.totalAchievements).toBe(5);
      expect(Array.isArray(stats.achievementStats)).toBe(true);
      
      // Check specific achievement stats
      const newcomerStats = stats.achievementStats.find(s => s.achievement.id === 'newcomer');
      expect(newcomerStats?.usersEarned).toBe(3); // All 3 users should have this
      
      const contributorStats = stats.achievementStats.find(s => s.achievement.id === 'contributor');
      expect(contributorStats?.usersEarned).toBe(2); // 2 users have 100+ points
    });

    it('should handle recent achievement earners correctly', async () => {
      await PointsService.awardPoints({
        userId: testUsers[0].id,
        communityId: testCommunity.id,
        points: 150,
        reason: 'Test points'
      });

      const recentEarners = await AchievementService.getRecentAchievementEarners('contributor', 10);
      
      expect(Array.isArray(recentEarners)).toBe(true);
      expect(recentEarners.length).toBeGreaterThan(0);
      
      const earner = recentEarners[0];
      expect(earner).toHaveProperty('user');
      expect(earner).toHaveProperty('achievement');
      expect(earner).toHaveProperty('earnedAt');
      expect(earner.achievement.id).toBe('contributor');
    });

    it('should throw error for invalid achievement ID', async () => {
      await expect(
        AchievementService.getRecentAchievementEarners('invalid_achievement', 10)
      ).rejects.toThrow('Achievement not found');
    });

    it('should throw error for non-existent user', async () => {
      await expect(
        AchievementService.checkAndAwardAchievements('non-existent-user-id')
      ).rejects.toThrow('User not found');

      await expect(
        AchievementService.getUserAchievementProgress('non-existent-user-id')
      ).rejects.toThrow('User not found');

      await expect(
        AchievementService.getUserMilestones('non-existent-user-id')
      ).rejects.toThrow('User not found');
    });
  });
});