import * as fc from 'fast-check';
import { PrismaClient } from '@prisma/client';
import { createPropertyTest, assertProperty } from './propertyTestConfig';
import { DatabaseTestUtils, PropertyGenerators } from './testUtils';
import { generateTokenPair, verifyAccessToken, hashPassword, verifyPassword } from '../lib/auth';

/**
 * Property-based tests for database schema integrity
 * Feature: community-learning-platform
 */

describe('Database Schema Integrity Properties', () => {
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
    1,
    'Authentication Round Trip',
    ['1.3', '1.4'],
    async () => {
      await fc.assert(
        fc.asyncProperty(
          PropertyGenerators.userRegistration(),
          async (userData) => {
            // Create user with hashed password
            const passwordHash = await hashPassword(userData.password);
            const user = await prisma.user.create({
              data: {
                email: userData.email,
                username: userData.username,
                displayName: userData.displayName,
                passwordHash,
                emailVerified: true
              }
            });

            // Generate token pair
            const tokens = generateTokenPair(user);
            
            // Verify access token contains correct user information
            const payload = verifyAccessToken(tokens.accessToken);
            
            // Verify password round trip
            const passwordValid = await verifyPassword(userData.password, passwordHash);
            
            // Fetch user from database using token payload
            const fetchedUser = await prisma.user.findUnique({
              where: { id: payload.userId }
            });

            // All assertions for round trip integrity
            return (
              // Token payload matches original user data
              payload.userId === user.id &&
              payload.email === user.email &&
              payload.username === user.username &&
              
              // Password verification works correctly
              passwordValid === true &&
              
              // Database user matches original user
              fetchedUser !== null &&
              fetchedUser.id === user.id &&
              fetchedUser.email === user.email &&
              fetchedUser.username === user.username &&
              fetchedUser.displayName === user.displayName &&
              
              // Authentication state is consistent
              fetchedUser.emailVerified === true
            );
          }
        ),
        { numRuns: 10, timeout: 60000 }
      );
    }
  );
});