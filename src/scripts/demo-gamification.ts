import prisma from '../lib/prisma';
import { PointsService } from '../lib/pointsService';
import { AchievementService } from '../lib/achievementService';

async function demoGamificationSystem() {
  console.log('🎮 Gamification System Demo\n');

  try {
    // Create a demo user
    const user = await prisma.user.create({
      data: {
        email: 'demo@example.com',
        passwordHash: 'demo',
        username: 'demouser',
        displayName: 'Demo User'
      }
    });

    // Create a demo community
    const community = await prisma.community.create({
      data: {
        name: 'Demo Community',
        slug: 'demo-community',
        creatorId: user.id,
        isPublic: true
      }
    });

    console.log(`✅ Created demo user: ${user.displayName} (${user.username})`);
    console.log(`✅ Created demo community: ${community.name}\n`);

    // Simulate user activities and award points
    console.log('🏆 Simulating user activities...\n');

    // User joins community
    await PointsService.awardPointsForAction(user.id, community.id, 'COMMUNITY_JOINED');
    console.log('📝 Joined community: +5 points');

    // User creates first post
    await PointsService.awardPointsForAction(user.id, community.id, 'FIRST_POST');
    console.log('🎉 First post bonus: +25 points');

    // User creates more posts
    for (let i = 0; i < 3; i++) {
      await PointsService.awardPointsForAction(user.id, community.id, 'POST_CREATED');
      console.log('📝 Created post: +10 points');
    }

    // User creates comments
    for (let i = 0; i < 5; i++) {
      await PointsService.awardPointsForAction(user.id, community.id, 'COMMENT_CREATED');
      console.log('💬 Created comment: +5 points');
    }

    // User receives likes
    for (let i = 0; i < 8; i++) {
      await PointsService.awardPointsForAction(user.id, community.id, 'POST_LIKED');
      console.log('👍 Received post like: +2 points');
    }

    // User completes lessons
    for (let i = 0; i < 2; i++) {
      await PointsService.awardPointsForAction(user.id, community.id, 'LESSON_COMPLETED');
      console.log('📚 Completed lesson: +15 points');
    }

    // Get updated user info
    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id }
    });

    console.log(`\n🎯 Total Points Earned: ${updatedUser?.totalPoints}\n`);

    // Show achievements
    console.log('🏅 Achievement Progress:');
    const achievements = await AchievementService.getUserAchievementProgress(user.id);
    
    achievements.forEach(achievement => {
      const status = achievement.isEarned ? '✅' : '⏳';
      const progress = Math.round(achievement.progress * 100);
      console.log(`${status} ${achievement.achievement.name}: ${progress}% (${achievement.achievement.pointsRequired} points required)`);
      console.log(`   ${achievement.achievement.description}`);
    });

    // Show milestones
    console.log('\n🎯 Milestone Progress:');
    const milestones = await AchievementService.getUserMilestones(user.id);
    
    console.log(`Current Points: ${milestones.currentPoints}`);
    console.log(`Earned Achievements: ${milestones.earnedAchievements.length}`);
    
    if (milestones.nextAchievement) {
      console.log(`Next Achievement: ${milestones.nextAchievement.name}`);
      console.log(`Points Needed: ${milestones.pointsToNext}`);
      console.log(`Progress: ${Math.round(milestones.progressToNext * 100)}%`);
    }

    // Show leaderboard
    console.log('\n🏆 Community Leaderboard:');
    const leaderboard = await PointsService.getCommunityLeaderboard({
      communityId: community.id,
      limit: 5
    });

    leaderboard.forEach(entry => {
      console.log(`${entry.rank}. ${entry.user?.displayName || entry.user?.username} - ${entry.points} points`);
    });

    // Show points history
    console.log('\n📊 Recent Points History:');
    const history = await PointsService.getUserPointsHistory(user.id, { limit: 5 });
    
    history.transactions.forEach(transaction => {
      console.log(`+${transaction.points} - ${transaction.reason} (${transaction.createdAt.toLocaleDateString()})`);
    });

    // Clean up demo data
    console.log('\n🧹 Cleaning up demo data...');
    await prisma.pointsTransaction.deleteMany({ where: { userId: user.id } });
    await prisma.community.delete({ where: { id: community.id } });
    await prisma.user.delete({ where: { id: user.id } });
    
    console.log('✅ Demo completed successfully!');

  } catch (error) {
    console.error('❌ Demo failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the demo
if (require.main === module) {
  demoGamificationSystem();
}

export default demoGamificationSystem;