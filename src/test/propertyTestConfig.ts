import * as fc from 'fast-check';

/**
 * Configuration for property-based testing
 * Following the design document requirements for comprehensive testing
 */
export const propertyTestConfig = {
  // Minimum 100 iterations as specified in design document
  numRuns: 100,
  
  // Verbose output for better debugging of property test failures
  verbose: true,
  
  // Fixed seed for reproducible test runs during development
  seed: 42,
  
  // Stop on first failure for faster debugging
  endOnFailure: true,
  
  // Timeout for individual property tests (30 seconds)
  timeout: 30000,
  
  // Maximum shrinking attempts to find minimal failing example
  maxSkipsPerRun: 100,
};

/**
 * Apply configuration to fast-check globally
 */
export function configurePropertyTesting() {
  fc.configureGlobal(propertyTestConfig);
}

/**
 * Helper function to create property test with consistent configuration
 * and proper tagging for traceability to design document
 */
export function createPropertyTest(
  propertyNumber: number,
  propertyDescription: string,
  requirements: string[],
  testFn: () => Promise<void>
) {
  const tag = `Feature: community-learning-platform, Property ${propertyNumber}: ${propertyDescription}`;
  
  describe(`Property ${propertyNumber}: ${propertyDescription}`, () => {
    it(`should validate requirements: ${requirements.join(', ')}`, testFn, 120000);
  });
  
  return tag;
}

/**
 * Wrapper for fc.assert with consistent configuration
 */
export function assertProperty(property: fc.IProperty<any>) {
  return fc.assert(property, propertyTestConfig);
}

/**
 * Common property test patterns for the platform
 */
export const propertyPatterns = {
  /**
   * Round-trip property: operation then inverse should return to original state
   */
  roundTrip: <T>(
    generator: fc.Arbitrary<T>,
    operation: (input: T) => any,
    inverse: (output: any) => T,
    equals: (a: T, b: T) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  ) => {
    return fc.property(generator, (input) => {
      const output = operation(input);
      const result = inverse(output);
      return equals(input, result);
    });
  },

  /**
   * Invariant property: some condition should hold before and after operation
   */
  invariant: <T>(
    generator: fc.Arbitrary<T>,
    operation: (input: T) => T,
    invariantCheck: (input: T) => boolean
  ) => {
    return fc.property(generator, (input) => {
      const invariantBefore = invariantCheck(input);
      const result = operation(input);
      const invariantAfter = invariantCheck(result);
      return invariantBefore === invariantAfter;
    });
  },

  /**
   * Idempotent property: applying operation twice should equal applying it once
   */
  idempotent: <T>(
    generator: fc.Arbitrary<T>,
    operation: (input: T) => T,
    equals: (a: T, b: T) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  ) => {
    return fc.property(generator, (input) => {
      const once = operation(input);
      const twice = operation(once);
      return equals(once, twice);
    });
  },

  /**
   * Metamorphic property: relationship between inputs should be preserved in outputs
   */
  metamorphic: <T, U>(
    generator: fc.Arbitrary<T>,
    operation: (input: T) => U,
    inputRelation: (a: T, b: T) => boolean,
    outputRelation: (a: U, b: U) => boolean
  ) => {
    return fc.property(generator, generator, (input1, input2) => {
      if (inputRelation(input1, input2)) {
        const output1 = operation(input1);
        const output2 = operation(input2);
        return outputRelation(output1, output2);
      }
      return true; // Skip if input relation doesn't hold
    });
  },

  /**
   * Error condition property: invalid inputs should produce appropriate errors
   */
  errorCondition: <T>(
    invalidGenerator: fc.Arbitrary<T>,
    operation: (input: T) => any,
    errorCheck: (error: any) => boolean
  ) => {
    return fc.property(invalidGenerator, (input) => {
      try {
        operation(input);
        return false; // Should have thrown an error
      } catch (error) {
        return errorCheck(error);
      }
    });
  }
};