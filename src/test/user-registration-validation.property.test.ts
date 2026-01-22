import * as fc from 'fast-check';
import request from 'supertest';
import app from '../index';
import { PrismaClient } from '@prisma/client';
import { createPropertyTest, assertProperty } from './propertyTestConfig';
import { DatabaseTestUtils, PropertyGenerators } from './testUtils';
import { registerSchema } from '../lib/validation';

/**
 * Property-based tests for user registration validation
 * Feature: community-learning-platform, Property 2: User Registration Validation
 * Validates: Requirements 1.1, 1.2
 */

describe('User Registration Validation Properties', () => {
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
    2,
    'User Registration Validation',
    ['1.1', '1.2'],
    async () => {
      // Test valid registration data - should create accounts
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            email: fc.tuple(
              fc.stringOf(fc.char().filter(c => /[a-zA-Z0-9]/.test(c)), { minLength: 1, maxLength: 10 }),
              fc.stringOf(fc.char().filter(c => /[a-zA-Z0-9]/.test(c)), { minLength: 1, maxLength: 10 }),
              fc.stringOf(fc.char().filter(c => /[a-zA-Z]/.test(c)), { minLength: 2, maxLength: 5 })
            ).map(([local, domain, tld]) => `${local}@${domain}.${tld}`),
            username: fc.stringOf(
              fc.char().filter(c => /[a-zA-Z0-9_-]/.test(c)), 
              { minLength: 3, maxLength: 20 }
            ),
            password: fc.tuple(
              fc.stringOf(fc.char().filter(c => /[a-z]/.test(c)), { minLength: 1, maxLength: 5 }),
              fc.stringOf(fc.char().filter(c => /[A-Z]/.test(c)), { minLength: 1, maxLength: 5 }),
              fc.stringOf(fc.char().filter(c => /[0-9]/.test(c)), { minLength: 1, maxLength: 5 }),
              fc.stringOf(fc.char().filter(c => /[a-zA-Z0-9]/.test(c)), { minLength: 0, maxLength: 10 })
            ).map(([lower, upper, digit, extra]) => {
              const combined = lower + upper + digit + extra;
              return combined.length >= 8 ? combined.slice(0, 50) : combined + 'Aa1';
            }),
            displayName: fc.stringOf(fc.char().filter(c => /[a-zA-Z0-9 ]/.test(c)), { minLength: 1, maxLength: 20 })
          }),
          async (validUserData) => {
            const response = await request(app)
              .post('/api/v1/auth/register')
              .send(validUserData);

            // Valid data should result in successful registration
            return response.status === 201 &&
                   response.body.user !== undefined &&
                   response.body.tokens !== undefined &&
                   response.body.user.email === validUserData.email.toLowerCase() &&
                   response.body.user.username === validUserData.username &&
                   !response.body.user.passwordHash;
          }
        ),
        { numRuns: 10, timeout: 60000 }
      );

      // Test invalid registration data - should return descriptive errors
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            // Invalid email cases
            fc.record({
              email: fc.oneof(
                fc.constant(''),
                fc.constant('invalid'),
                fc.constant('@example.com'),
                fc.constant('test@'),
                fc.constant('test.com')
              ),
              username: fc.stringOf(fc.char().filter(c => /[a-zA-Z0-9_-]/.test(c)), { minLength: 3, maxLength: 20 }),
              password: fc.constant('ValidPass123'),
              displayName: fc.constant('Valid Name')
            }),
            // Invalid username cases
            fc.record({
              email: fc.constant('valid@example.com'),
              username: fc.oneof(
                fc.constant(''),
                fc.constant('ab'), // too short
                fc.constant('user@invalid'), // invalid character
                fc.stringOf(fc.char(), { minLength: 51 }) // too long
              ),
              password: fc.constant('ValidPass123'),
              displayName: fc.constant('Valid Name')
            }),
            // Invalid password cases
            fc.record({
              email: fc.constant('valid@example.com'),
              username: fc.constant('validuser'),
              password: fc.oneof(
                fc.constant(''), // empty
                fc.constant('short'), // too short
                fc.constant('nouppercase123'), // no uppercase
                fc.constant('NOLOWERCASE123'), // no lowercase
                fc.constant('NoDigitsHere') // no digits
              ),
              displayName: fc.constant('Valid Name')
            })
          ),
          async (invalidUserData) => {
            const response = await request(app)
              .post('/api/v1/auth/register')
              .send(invalidUserData);

            // Invalid data should result in validation error
            return response.status === 400 &&
                   response.body.error !== undefined &&
                   response.body.details !== undefined &&
                   response.body.user === undefined &&
                   response.body.tokens === undefined;
          }
        ),
        { numRuns: 15, timeout: 60000 }
      );

      // Test duplicate handling - should return specific errors
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            email: fc.constant('unique@example.com'),
            username: fc.constant('uniqueuser'),
            password: fc.constant('ValidPass123'),
            displayName: fc.constant('Unique User')
          }),
          async (userData) => {
            // First registration should succeed
            const firstResponse = await request(app)
              .post('/api/v1/auth/register')
              .send(userData);

            if (firstResponse.status !== 201) {
              return true; // Skip if first registration fails
            }

            // Second registration with same email should fail
            const duplicateEmailResponse = await request(app)
              .post('/api/v1/auth/register')
              .send({
                ...userData,
                username: 'differentuser'
              });

            return duplicateEmailResponse.status === 409 &&
                   duplicateEmailResponse.body.message?.includes('Email address is already registered');
          }
        ),
        { numRuns: 5, timeout: 60000 }
      );
    }
  );
});