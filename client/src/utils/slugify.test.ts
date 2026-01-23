import { slugify } from './slugify';

describe('slugify', () => {
  it('should convert text to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('should replace spaces with hyphens', () => {
    expect(slugify('My Community Name')).toBe('my-community-name');
  });

  it('should remove special characters', () => {
    expect(slugify('Hello! @World#')).toBe('hello-world');
  });

  it('should handle multiple spaces', () => {
    expect(slugify('Hello    World')).toBe('hello-world');
  });

  it('should handle multiple hyphens', () => {
    expect(slugify('Hello---World')).toBe('hello-world');
  });

  it('should remove leading and trailing hyphens', () => {
    expect(slugify('-Hello World-')).toBe('hello-world');
  });

  it('should handle complex strings', () => {
    expect(slugify('  My Awesome Community! @2024  ')).toBe('my-awesome-community-2024');
  });

  it('should handle empty strings', () => {
    expect(slugify('')).toBe('-community');
  });

  it('should handle strings with only special characters', () => {
    expect(slugify('!@#$%^&*()')).toBe('-community');
  });

  it('should handle very short strings', () => {
    expect(slugify('Hi')).toBe('hi-community');
  });
});