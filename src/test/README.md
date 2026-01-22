# Testing Framework Documentation

## Overview

This testing framework provides comprehensive support for both unit testing and property-based testing for the Community Learning Platform. It follows the design document specifications for testing strategy and correctness properties.

## Framework Components

### Core Configuration

- **Jest**: Primary testing framework with TypeScript support
- **fast-check**: Property-based testing library for generating test data
- **Prisma**: Database testing with isolated test database
- **Supertest**: HTTP endpoint testing (when needed)

### Key Files

- `setup.ts` - Global test setup, database configuration, and test helpers
- `globalSetup.ts` - Test database initialization and migration
- `globalTeardown.ts` - Test database cleanup
- `propertyTestConfig.ts` - Property-based testing configuration and patterns
- `testUtils.ts` - Comprehensive test utilities and generators
- `framework.test.ts` - Framework validation tests

## Configuration

### Jest Configuration (jest.config.js)

```javascript
{
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 30000, // Extended for property-based tests
  maxWorkers: 1, // Sequential execution for database consistency
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  globalSetup: '<rootDir>/src/test/globalSetup.ts',
  globalTeardown: '<rootDir>/src/test/globalTeardown.ts'
}
```

### Property-Based Testing Configuration

- **Minimum 100 iterations** per property test (as specified in design)
- **Fixed seed (42)** for reproducible test runs
- **Verbose output** for detailed failure information
- **Automatic shrinking** to find minimal failing examples

## Usage

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- --testPathPattern=framework.test.ts

# Run tests with specific pattern
npm test -- --testNamePattern="property test"

# Run tests in watch mode
npm run test:watch
```

### Writing Unit Tests

```typescript
import { prisma } from '../test/setup';
import { DatabaseTestUtils, TestAssertions } from '../test/testUtils';

describe('User Service', () => {
  let dbUtils: DatabaseTestUtils;

  beforeAll(() => {
    dbUtils = new DatabaseTestUtils(prisma);
  });

  it('should create a user', async () => {
    const user = await dbUtils.createUser({
      email: 'test@example.com',
      username: 'testuser'
    });

    TestAssertions.hasRequiredFields(user, ['id', 'email', 'username']);
    expect(user.email).toBe('test@example.com');
  });
});
```

### Writing Property-Based Tests

```typescript
import { fc } from '../test/setup';
import { PropertyGenerators, assertProperty } from '../test/testUtils';
import { createPropertyTest } from '../test/propertyTestConfig';

createPropertyTest(
  1,
  "User Registration Validation",
  ["Requirements 1.1", "Requirements 1.2"],
  () => {
    assertProperty(
      fc.property(
        PropertyGenerators.userRegistration(),
        async (userData) => {
          // Test that valid user data creates a user
          const user = await createUser(userData);
          expect(user.email).toBe(userData.email);
          expect(user.username).toBe(userData.username);
        }
      )
    );
  }
);
```

## Test Utilities

### DatabaseTestUtils

Provides methods for creating test data:

- `createUser(overrides?)` - Create test user
- `createCommunity(creatorId, overrides?)` - Create test community
- `createCourse(communityId, overrides?)` - Create test course
- `createLesson(courseId, overrides?)` - Create test lesson
- `createTestHierarchy()` - Create complete user->community->course->lesson hierarchy
- `cleanup()` - Clean all test data

### PropertyGenerators

Provides generators for property-based testing:

- `userRegistration()` - Valid user registration data
- `communityData()` - Valid community data
- `courseData()` - Valid course data
- `lessonData()` - Valid lesson data
- `invalidEmails()` - Invalid email formats for error testing
- `invalidUsernames()` - Invalid usernames for error testing
- `whitespaceStrings()` - Whitespace-only strings for validation testing

### TestAssertions

Common assertion patterns:

- `hasRequiredFields(obj, fields)` - Assert object has required fields
- `recordExists(prisma, model, id)` - Assert database record exists
- `recordNotExists(prisma, model, id)` - Assert database record doesn't exist
- `isValidationError(error, field?)` - Assert error is validation error
- `isValidApiResponse(response, status?)` - Assert API response format

## Property Test Patterns

The framework includes common property-based testing patterns:

### Round-trip Properties
```typescript
propertyPatterns.roundTrip(
  generator,
  operation,
  inverse,
  equals
)
```

### Invariant Properties
```typescript
propertyPatterns.invariant(
  generator,
  operation,
  invariantCheck
)
```

### Idempotent Properties
```typescript
propertyPatterns.idempotent(
  generator,
  operation,
  equals
)
```

### Error Condition Properties
```typescript
propertyPatterns.errorCondition(
  invalidGenerator,
  operation,
  errorCheck
)
```

## Database Testing

### Test Database Setup

- Uses separate test database (community_learning_platform_test)
- Automatic migrations on test startup
- Isolated test environment with NODE_ENV=test
- Sequential test execution to avoid database conflicts

### Data Cleanup

- Automatic cleanup between tests (afterEach)
- Respects foreign key constraints (deletion order)
- Manual cleanup available via `dbUtils.cleanup()`
- Global cleanup on test suite completion

### Test Data Creation

All test data creation methods:
- Use realistic default values
- Support overrides for specific test needs
- Handle database relationships correctly
- Generate unique values to avoid conflicts

## Performance Considerations

- **Sequential execution** (maxWorkers: 1) for database consistency
- **Extended timeout** (30s) for property-based tests
- **Efficient cleanup** with batch deletions
- **Connection pooling** managed by Prisma

## Best Practices

1. **Use test utilities** instead of creating data manually
2. **Write both unit and property tests** for comprehensive coverage
3. **Tag property tests** with feature and property numbers
4. **Use generators** for consistent test data
5. **Clean up explicitly** when needed (automatic cleanup handles most cases)
6. **Test error conditions** using invalid data generators
7. **Verify database state** using assertion helpers

## Troubleshooting

### Common Issues

1. **Database connection errors**: Check DATABASE_URL environment variable
2. **Migration errors**: Ensure test database exists and is accessible
3. **Timeout errors**: Increase testTimeout for complex property tests
4. **Foreign key errors**: Check cleanup order in test utilities

### Debug Tips

1. Use `console.log` in property tests to see generated values
2. Set `verbose: true` in property test config for detailed output
3. Use `fc.sample(generator, n)` to preview generated test data
4. Check test database state manually using Prisma Studio

## Environment Variables

Required for testing:

```bash
NODE_ENV=test
DATABASE_URL=postgresql://username:password@localhost:5432/community_learning_platform_test
```

Optional:

```bash
TEST_TIMEOUT=30000
TEST_VERBOSE=true
```