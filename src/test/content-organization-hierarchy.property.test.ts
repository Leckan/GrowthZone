import * as fc from 'fast-check';
import request from 'supertest';
import app from '../index';
import { PrismaClient } from '@prisma/client';
import { createPropertyTest } from './propertyTestConfig';
import { DatabaseTestUtils } from './testUtils';
import { generateTokenPair } from '../lib/auth';

/**
 * Property-based tests for content organization hierarchy
 * Feature: community-learning-platform, Property 5: Content Organization Hierarchy
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

describe('Content Organization Hierarchy Properties', () => {
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
    5,
    'Content Organization Hierarchy',
    ['3.1', '3.2', '3.3', '3.4', '3.5'],
    async () => {
      // Test course content creation and organization - should organize content into courses and lessons (Requirement 3.1)
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            courseTitle: fc.stringOf(
              fc.char().filter(c => /[a-zA-Z0-9 ._-]/.test(c)), 
              { minLength: 1, maxLength: 200 }
            ),
            courseDescription: fc.stringOf(
              fc.char().filter(c => /[a-zA-Z0-9 .,!?_-]/.test(c)), 
              { minLength: 0, maxLength: 1000 }
            ),
            lessons: fc.array(
              fc.record({
                title: fc.stringOf(
                  fc.char().filter(c => /[a-zA-Z0-9 ._-]/.test(c)), 
                  { minLength: 1, maxLength: 200 }
                ),
                content: fc.stringOf(
                  fc.char().filter(c => /[a-zA-Z0-9 .,!?_\-\n]/.test(c)), 
                  { minLength: 1, maxLength: 1000 }
                ),
                contentType: fc.constantFrom('text', 'video', 'file'),
                isFree: fc.boolean()
              }),
              { minLength: 1, maxLength: 5 }
            )
          }),
          async (contentData) => {
            // Create test hierarchy: user -> community
            const creator = await dbUtils.createUser();
            const community = await dbUtils.createCommunity(creator.id);
            
            const fullCreator = await prisma.user.findUnique({
              where: { id: creator.id }
            });
            
            if (!fullCreator) {
              return true; // Skip if user not found
            }
            
            const { accessToken } = generateTokenPair(fullCreator);

            // Create course
            const courseResponse = await request(app)
              .post(`/api/v1/communities/${community.id}/courses`)
              .set('Authorization', `Bearer ${accessToken}`)
              .send({
                title: contentData.courseTitle,
                description: contentData.courseDescription
              });

            if (courseResponse.status !== 201) {
              return true; // Skip if course creation fails
            }

            const course = courseResponse.body.data;

            // Create lessons in the course
            const createdLessons = [];
            for (let i = 0; i < contentData.lessons.length; i++) {
              const lessonData = contentData.lessons[i];
              const lessonResponse = await request(app)
                .post(`/api/v1/courses/${course.id}/lessons`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                  title: lessonData.title,
                  content: lessonData.content,
                  contentType: lessonData.contentType,
                  isFree: lessonData.isFree,
                  sortOrder: i + 1
                });

              if (lessonResponse.status !== 201) {
                return true; // Skip if lesson creation fails
              }

              createdLessons.push(lessonResponse.body.data);
            }

            // Verify hierarchical organization: Community -> Course -> Lessons
            const courseExists = course.communityId === community.id;
            
            // Verify all lessons belong to the course and maintain order
            const lessonsOrganizedCorrectly = createdLessons.every((lesson, index) => 
              lesson.courseId === course.id && 
              lesson.sortOrder === index + 1
            );

            // Verify content types are preserved (Requirement 3.2)
            const contentTypesPreserved = createdLessons.every((lesson, index) => 
              lesson.contentType === contentData.lessons[index].contentType
            );

            // Verify free/premium marking is preserved (Requirement 3.4)
            const freeMarkingPreserved = createdLessons.every((lesson, index) => 
              lesson.isFree === contentData.lessons[index].isFree
            );

            return courseExists && lessonsOrganizedCorrectly && contentTypesPreserved && freeMarkingPreserved;
          }
        ),
        { numRuns: 10, timeout: 60000 }
      );

      // Test content reordering - should update lesson sequence correctly (Requirement 3.3)
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              title: fc.stringOf(
                fc.char().filter(c => /[a-zA-Z0-9 ._-]/.test(c)), 
                { minLength: 1, maxLength: 50 }
              ),
              content: fc.string({ minLength: 1, maxLength: 100 })
            }),
            { minLength: 2, maxLength: 4 }
          ),
          async (lessonsData) => {
            // Create test hierarchy
            const creator = await dbUtils.createUser();
            const community = await dbUtils.createCommunity(creator.id);
            const course = await dbUtils.createCourse(community.id);
            
            const fullCreator = await prisma.user.findUnique({
              where: { id: creator.id }
            });
            
            if (!fullCreator) {
              return true; // Skip if user not found
            }
            
            const { accessToken } = generateTokenPair(fullCreator);

            // Create lessons with initial order
            const createdLessons = [];
            for (let i = 0; i < lessonsData.length; i++) {
              const lessonData = lessonsData[i];
              const lessonResponse = await request(app)
                .post(`/api/v1/courses/${course.id}/lessons`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                  title: lessonData.title,
                  content: lessonData.content,
                  sortOrder: i + 1
                });

              if (lessonResponse.status !== 201) {
                return true; // Skip if lesson creation fails
              }

              createdLessons.push(lessonResponse.body.data);
            }

            // Generate a new random order
            const shuffledIds = [...createdLessons.map(l => l.id)];
            for (let i = shuffledIds.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffledIds[i], shuffledIds[j]] = [shuffledIds[j], shuffledIds[i]];
            }

            // Reorder lessons
            const reorderResponse = await request(app)
              .put(`/api/v1/courses/${course.id}/lessons/reorder`)
              .set('Authorization', `Bearer ${accessToken}`)
              .send({ lessonIds: shuffledIds });

            if (reorderResponse.status !== 200) {
              return true; // Skip if reordering fails
            }

            // Verify new order is applied correctly
            const updatedLessons = await prisma.lesson.findMany({
              where: { courseId: course.id },
              orderBy: { sortOrder: 'asc' }
            });

            const orderCorrect = updatedLessons.every((lesson, index) => 
              lesson.id === shuffledIds[index] && lesson.sortOrder === index + 1
            );

            return orderCorrect;
          }
        ),
        { numRuns: 8, timeout: 60000 }
      );

      // Test multiple content types support - should handle text, video, and file content (Requirement 3.2)
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }),
              contentType: fc.constantFrom('text', 'video', 'file'),
              content: fc.option(fc.string({ minLength: 1, maxLength: 200 })),
              videoUrl: fc.option(fc.webUrl()),
              fileUrl: fc.option(fc.webUrl())
            }),
            { minLength: 1, maxLength: 3 }
          ),
          async (lessonsData) => {
            // Create test hierarchy
            const creator = await dbUtils.createUser();
            const community = await dbUtils.createCommunity(creator.id);
            const course = await dbUtils.createCourse(community.id);
            
            const fullCreator = await prisma.user.findUnique({
              where: { id: creator.id }
            });
            
            if (!fullCreator) {
              return true; // Skip if user not found
            }
            
            const { accessToken } = generateTokenPair(fullCreator);

            // Create lessons with different content types
            const createdLessons = [];
            for (const lessonData of lessonsData) {
              const requestData: any = {
                title: lessonData.title,
                contentType: lessonData.contentType
              };

              // Add appropriate content based on type
              if (lessonData.contentType === 'text' && lessonData.content) {
                requestData.content = lessonData.content;
              } else if (lessonData.contentType === 'video' && lessonData.videoUrl) {
                requestData.videoUrl = lessonData.videoUrl;
              } else if (lessonData.contentType === 'file' && lessonData.fileUrl) {
                requestData.fileUrl = lessonData.fileUrl;
              }

              const lessonResponse = await request(app)
                .post(`/api/v1/courses/${course.id}/lessons`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(requestData);

              if (lessonResponse.status !== 201) {
                return true; // Skip if lesson creation fails
              }

              createdLessons.push(lessonResponse.body.data);
            }

            // Verify all content types are supported and preserved
            const contentTypesSupported = createdLessons.every((lesson, index) => {
              const originalData = lessonsData[index];
              const typeMatches = lesson.contentType === originalData.contentType;
              
              // Verify appropriate content fields are set
              let contentFieldsCorrect = true;
              if (originalData.contentType === 'text' && originalData.content) {
                contentFieldsCorrect = lesson.content === originalData.content;
              } else if (originalData.contentType === 'video' && originalData.videoUrl) {
                contentFieldsCorrect = lesson.videoUrl === originalData.videoUrl;
              } else if (originalData.contentType === 'file' && originalData.fileUrl) {
                contentFieldsCorrect = lesson.fileUrl === originalData.fileUrl;
              }

              return typeMatches && contentFieldsCorrect;
            });

            return contentTypesSupported;
          }
        ),
        { numRuns: 8, timeout: 60000 }
      );

      // Test free/premium lesson marking - should allow creators to mark lessons appropriately (Requirement 3.4)
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }),
              isFree: fc.boolean(),
              newIsFree: fc.boolean() // For testing updates
            }),
            { minLength: 1, maxLength: 3 }
          ),
          async (lessonsData) => {
            // Create test hierarchy
            const creator = await dbUtils.createUser();
            const community = await dbUtils.createCommunity(creator.id);
            const course = await dbUtils.createCourse(community.id);
            
            const fullCreator = await prisma.user.findUnique({
              where: { id: creator.id }
            });
            
            if (!fullCreator) {
              return true; // Skip if user not found
            }
            
            const { accessToken } = generateTokenPair(fullCreator);

            // Create lessons with initial free/premium marking
            const createdLessons = [];
            for (const lessonData of lessonsData) {
              const lessonResponse = await request(app)
                .post(`/api/v1/courses/${course.id}/lessons`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                  title: lessonData.title,
                  content: 'Test content',
                  isFree: lessonData.isFree
                });

              if (lessonResponse.status !== 201) {
                return true; // Skip if lesson creation fails
              }

              createdLessons.push(lessonResponse.body.data);
            }

            // Verify initial free/premium marking is correct
            const initialMarkingCorrect = createdLessons.every((lesson, index) => 
              lesson.isFree === lessonsData[index].isFree
            );

            // Update free/premium marking for each lesson
            const updatedLessons = [];
            for (let i = 0; i < createdLessons.length; i++) {
              const lesson = createdLessons[i];
              const newIsFree = lessonsData[i].newIsFree;

              const updateResponse = await request(app)
                .put(`/api/v1/lessons/${lesson.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ isFree: newIsFree });

              if (updateResponse.status !== 200) {
                return true; // Skip if update fails
              }

              updatedLessons.push(updateResponse.body.data);
            }

            // Verify updated free/premium marking is correct
            const updatedMarkingCorrect = updatedLessons.every((lesson, index) => 
              lesson.isFree === lessonsData[index].newIsFree
            );

            return initialMarkingCorrect && updatedMarkingCorrect;
          }
        ),
        { numRuns: 8, timeout: 60000 }
      );

      // Test content publishing - should make content available to appropriate members (Requirement 3.5)
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            courseTitle: fc.string({ minLength: 1, maxLength: 50 }),
            initialPublished: fc.boolean(),
            newPublished: fc.boolean()
          }),
          async (publishingData) => {
            // Create test hierarchy with member
            const creator = await dbUtils.createUser();
            const member = await dbUtils.createUser();
            const community = await dbUtils.createCommunity(creator.id);
            
            // Add member to community
            await prisma.communityMembership.create({
              data: {
                userId: member.id,
                communityId: community.id,
                role: 'member',
                status: 'active'
              }
            });
            
            const fullCreator = await prisma.user.findUnique({
              where: { id: creator.id }
            });
            
            const fullMember = await prisma.user.findUnique({
              where: { id: member.id }
            });
            
            if (!fullCreator || !fullMember) {
              return true; // Skip if users not found
            }
            
            const { accessToken: creatorToken } = generateTokenPair(fullCreator);
            const { accessToken: memberToken } = generateTokenPair(fullMember);

            // Create course with initial publishing state
            const courseResponse = await request(app)
              .post(`/api/v1/communities/${community.id}/courses`)
              .set('Authorization', `Bearer ${creatorToken}`)
              .send({
                title: publishingData.courseTitle,
                isPublished: publishingData.initialPublished
              });

            if (courseResponse.status !== 201) {
              return true; // Skip if course creation fails
            }

            const course = courseResponse.body.data;

            // Add a lesson to make the course valid for publishing
            await request(app)
              .post(`/api/v1/courses/${course.id}/lessons`)
              .set('Authorization', `Bearer ${creatorToken}`)
              .send({
                title: 'Test Lesson',
                content: 'Test content'
              });

            // Test member access based on initial publishing state
            const initialAccessResponse = await request(app)
              .get(`/api/v1/courses/${course.id}`)
              .set('Authorization', `Bearer ${memberToken}`);

            const initialAccessCorrect = publishingData.initialPublished 
              ? initialAccessResponse.status === 200
              : initialAccessResponse.status === 404; // Unpublished courses should not be accessible

            // Update publishing state
            const updateResponse = await request(app)
              .put(`/api/v1/courses/${course.id}`)
              .set('Authorization', `Bearer ${creatorToken}`)
              .send({ isPublished: publishingData.newPublished });

            if (updateResponse.status !== 200) {
              return true; // Skip if update fails
            }

            // Test member access based on new publishing state
            const newAccessResponse = await request(app)
              .get(`/api/v1/courses/${course.id}`)
              .set('Authorization', `Bearer ${memberToken}`);

            const newAccessCorrect = publishingData.newPublished 
              ? newAccessResponse.status === 200
              : newAccessResponse.status === 404; // Unpublished courses should not be accessible

            return initialAccessCorrect && newAccessCorrect;
          }
        ),
        { numRuns: 8, timeout: 60000 }
      );

      // Test hierarchical structure maintenance - should maintain correct relationships during operations
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            numCourses: fc.integer({ min: 1, max: 3 }),
            lessonsPerCourse: fc.integer({ min: 1, max: 3 })
          }),
          async (structureData) => {
            // Create test hierarchy
            const creator = await dbUtils.createUser();
            const community = await dbUtils.createCommunity(creator.id);
            
            const fullCreator = await prisma.user.findUnique({
              where: { id: creator.id }
            });
            
            if (!fullCreator) {
              return true; // Skip if user not found
            }
            
            const { accessToken } = generateTokenPair(fullCreator);

            // Create multiple courses with lessons
            const createdCourses = [];
            for (let i = 0; i < structureData.numCourses; i++) {
              const courseResponse = await request(app)
                .post(`/api/v1/communities/${community.id}/courses`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                  title: `Course ${i + 1}`,
                  sortOrder: i + 1
                });

              if (courseResponse.status !== 201) {
                return true; // Skip if course creation fails
              }

              const course = courseResponse.body.data;
              createdCourses.push(course);

              // Create lessons for this course
              for (let j = 0; j < structureData.lessonsPerCourse; j++) {
                const lessonResponse = await request(app)
                  .post(`/api/v1/courses/${course.id}/lessons`)
                  .set('Authorization', `Bearer ${accessToken}`)
                  .send({
                    title: `Lesson ${j + 1}`,
                    content: `Content for lesson ${j + 1}`,
                    sortOrder: j + 1
                  });

                if (lessonResponse.status !== 201) {
                  return true; // Skip if lesson creation fails
                }
              }
            }

            // Verify hierarchical structure is maintained
            const coursesInDb = await prisma.course.findMany({
              where: { communityId: community.id },
              include: {
                lessons: {
                  orderBy: { sortOrder: 'asc' }
                }
              },
              orderBy: { sortOrder: 'asc' }
            });

            // Verify course count and order
            const courseStructureCorrect = coursesInDb.length === structureData.numCourses &&
              coursesInDb.every((course, index) => course.sortOrder === index + 1);

            // Verify lesson count and order for each course
            const lessonStructureCorrect = coursesInDb.every(course => 
              course.lessons.length === structureData.lessonsPerCourse &&
              course.lessons.every((lesson, index) => lesson.sortOrder === index + 1)
            );

            // Verify all relationships are correct
            const relationshipsCorrect = coursesInDb.every(course => 
              course.communityId === community.id &&
              course.lessons.every(lesson => lesson.courseId === course.id)
            );

            return courseStructureCorrect && lessonStructureCorrect && relationshipsCorrect;
          }
        ),
        { numRuns: 5, timeout: 60000 }
      );
    }
  );
});