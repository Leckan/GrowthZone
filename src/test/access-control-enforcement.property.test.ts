import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import prisma from '../lib/prisma';
import { AccessControlService } from '../lib/accessControlService';
import { hasPermission, getEffectiveRole, Permission, Role } from '../middleware/accessControl';
import { auditLogger } from '../lib/auditLogger';
import { DatabaseTestUtils, PropertyGenerators } from './testUtils';
import { propertyTestConfig, assertProperty, createPropertyTest } from './propertyTestConfig';
import bcrypt from 'bcryptjs';

/**
 * Property 10: Access Control Enforcement
 * Feature: community-learning-platform, Property 10: Access Control Enforcement
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

describe('Property-Based Testing: Access Control Enforcement', () => {
  let dbUtils: DatabaseTestUtils;

  beforeEach(async () => {
    dbUtils = new DatabaseTestUtils(prisma);
    await dbUtils.cleanup();
  });

  afterEach(async () => {
    await dbUtils.cleanup();
  });

  createPropertyTest(
    10,
    'Access Control Enforcement',
    ['6.1', '6.2', '6.3', '6.4', '6.5', '6.6'],
    async () => {
      // Property 10.1: Membership-based access control
      await assertProperty(
        fc.asyncProperty(
          fc.record({
            isPublic: fc.boolean(),
            requiresPayment: fc.boolean(),
            userRole: fc.constantFrom('member', 'moderator', 'admin', 'creator'),
            membershipStatus: fc.constantFrom('active', 'pending', 'suspended'),
            hasSubscription: fc.boolean()
          }),
          async ({ isPublic, requiresPayment, userRole, membershipStatus, hasSubscription }) => {
            // Create test data
            const creator = await dbUtils.createUser();
            const user = await dbUtils.createUser();
            
            const community = await dbUtils.createCommunity(creator.id, {
              isPublic,
              ...(requiresPayment && { 
                priceMonthly: 9.99,
                priceYearly: 99.99 
              })
            } as any);

            // Create membership if user is not creator
            if (userRole !== 'creator') {
              await prisma.communityMembership.create({
                data: {
                  userId: user.id,
                  communityId: community.id,
                  role: userRole as any,
                  status: membershipStatus
                }
              });
            }

            // Create subscription if needed
            if (hasSubscription && requiresPayment) {
              await prisma.subscription.create({
                data: {
                  userId: user.id,
                  communityId: community.id,
                  stripeSubscriptionId: `sub_test_${Date.now()}`,
                  status: 'active',
                  currentPeriodStart: new Date(),
                  currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                }
              });
            }

            const testUserId = userRole === 'creator' ? creator.id : user.id;
            const access = await AccessControlService.checkCommunityAccess(community.id, testUserId);

            // Validate access rules (Requirements 6.1, 6.2, 6.3)
            if (userRole === 'creator') {
              // Creators always have full access
              expect(access.hasAccess).toBe(true);
              expect(access.hasPaidAccess).toBe(true);
              expect(access.isCreator).toBe(true);
            } else if (membershipStatus === 'active') {
              // Active members have access
              expect(access.hasAccess).toBe(true);
              
              // Paid access depends on payment requirements and subscription
              if (requiresPayment) {
                expect(access.hasPaidAccess).toBe(hasSubscription);
              } else {
                expect(access.hasPaidAccess).toBe(true);
              }
            } else if (isPublic && membershipStatus !== 'active') {
              // Public communities allow basic access even without active membership
              expect(access.hasAccess).toBe(true);
              expect(access.hasPaidAccess).toBe(false);
            } else {
              // Private communities require active membership
              expect(access.hasAccess).toBe(false);
              expect(access.hasPaidAccess).toBe(false);
            }

            return true;
          }
        )
      );

      // Property 10.2: Permission validation consistency
      await assertProperty(
        fc.asyncProperty(
          fc.record({
            role: fc.constantFrom('member', 'moderator', 'admin', 'creator'),
            permission: fc.constantFrom(
              'community:read', 'community:write', 'community:admin', 'community:delete',
              'course:read', 'course:write', 'course:publish', 'course:delete',
              'post:read', 'post:write', 'post:moderate', 'post:delete',
              'member:read', 'member:write', 'member:remove'
            ),
            membershipStatus: fc.constantFrom('active', 'pending', 'suspended')
          }),
          async ({ role, permission, membershipStatus }) => {
            // Create test data
            const creator = await dbUtils.createUser();
            const user = await dbUtils.createUser();
            const community = await dbUtils.createCommunity(creator.id);

            // Create membership
            if (role !== 'creator') {
              await prisma.communityMembership.create({
                data: {
                  userId: user.id,
                  communityId: community.id,
                  role: role as any,
                  status: membershipStatus
                }
              });
            }

            const testUserId = role === 'creator' ? creator.id : user.id;
            
            // Check permission using service
            const validation = await AccessControlService.validatePermission(
              testUserId,
              community.id,
              permission as Permission
            );

            // Check permission using direct function
            const access = await AccessControlService.checkCommunityAccess(community.id, testUserId);
            const effectiveRole = getEffectiveRole(access.membership, access.isCreator);
            const directPermissionCheck = hasPermission(effectiveRole, permission as Permission);

            // Validate consistency (Requirement 6.4)
            if (access.hasAccess) {
              // For write/admin permissions, require active membership (except for creators)
              const requiresActiveMembership = permission.includes(':write') || 
                                             permission.includes(':admin') || 
                                             permission.includes(':moderate') || 
                                             permission.includes(':delete') ||
                                             permission.includes(':publish');
              
              if (requiresActiveMembership && !access.isCreator && 
                  (!access.membership || access.membership.status !== 'active')) {
                expect(validation.allowed).toBe(false);
              } else {
                expect(validation.allowed).toBe(directPermissionCheck);
              }
            } else {
              expect(validation.allowed).toBe(false);
            }

            return true;
          }
        )
      );

      // Property 10.3: Content access control
      await assertProperty(
        fc.asyncProperty(
          fc.record({
            contentType: fc.constantFrom('lesson', 'post', 'comment'),
            isAuthor: fc.boolean(),
            userRole: fc.constantFrom('member', 'moderator', 'admin', 'creator'),
            isPremiumContent: fc.boolean(),
            hasSubscription: fc.boolean(),
            membershipStatus: fc.constantFrom('active', 'pending', 'suspended')
          }),
          async ({ contentType, isAuthor, userRole, isPremiumContent, hasSubscription, membershipStatus }) => {
            // Create test data
            const creator = await dbUtils.createUser();
            const user = await dbUtils.createUser();
            const author = isAuthor ? user : await dbUtils.createUser();
            
            const community = await dbUtils.createCommunity(creator.id, {
              ...(isPremiumContent && { priceMonthly: 9.99 })
            } as any);

            // Create membership
            if (userRole !== 'creator') {
              await prisma.communityMembership.create({
                data: {
                  userId: user.id,
                  communityId: community.id,
                  role: userRole as any,
                  status: membershipStatus
                }
              });
            }

            // Create subscription if needed
            if (hasSubscription && isPremiumContent) {
              await prisma.subscription.create({
                data: {
                  userId: user.id,
                  communityId: community.id,
                  stripeSubscriptionId: `sub_test_${Date.now()}`,
                  status: 'active',
                  currentPeriodStart: new Date(),
                  currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                }
              });
            }

            // Create content based on type
            let contentId: string;
            
            if (contentType === 'lesson') {
              const course = await dbUtils.createCourse(community.id);
              const lesson = await dbUtils.createLesson(course.id, {
                isFree: !isPremiumContent
              });
              contentId = lesson.id;
            } else if (contentType === 'post') {
              const post = await prisma.post.create({
                data: {
                  title: 'Test Post',
                  content: 'Test content',
                  authorId: author.id,
                  communityId: community.id
                }
              });
              contentId = post.id;
            } else {
              const post = await prisma.post.create({
                data: {
                  title: 'Test Post',
                  content: 'Test content',
                  authorId: creator.id,
                  communityId: community.id
                }
              });
              const comment = await prisma.comment.create({
                data: {
                  content: 'Test comment',
                  authorId: author.id,
                  postId: post.id
                }
              });
              contentId = comment.id;
            }

            const testUserId = userRole === 'creator' ? creator.id : user.id;
            const access = await AccessControlService.checkContentAccess(
              contentType as 'lesson' | 'post' | 'comment', 
              contentId, 
              testUserId
            );

            // Validate content access rules (Requirements 6.2, 6.4, 6.5)
            if (!access.hasAccess) {
              expect(access.canView).toBe(false);
              expect(access.canEdit).toBe(false);
              expect(access.canDelete).toBe(false);
            } else {
              // View access
              if (contentType === 'lesson' && isPremiumContent && !access.hasPaidAccess) {
                // Premium lessons require paid access unless user is moderator/admin/creator
                const canViewPremium = ['moderator', 'admin', 'creator'].includes(access.role);
                expect(access.canView).toBe(canViewPremium);
              } else {
                expect(access.canView).toBe(true);
              }

              // Edit access
              const canEdit = isAuthor || access.isCreator || 
                hasPermission(access.role, `${contentType}:write` as Permission);
              expect(access.canEdit).toBe(canEdit);

              // Delete access
              const canDelete = isAuthor || access.isCreator || 
                hasPermission(access.role, `${contentType}:delete` as Permission);
              expect(access.canDelete).toBe(canDelete);

              // Moderate access
              const canModerate = hasPermission(access.role, `${contentType}:moderate` as Permission);
              expect(access.canModerate).toBe(canModerate);
            }

            return true;
          }
        )
      );

      // Property 10.4: Audit logging completeness
      await assertProperty(
        fc.asyncProperty(
          fc.record({
            action: fc.constantFrom('ACCESS_DENIED', 'ACCESS_GRANTED', 'ACCESS_ERROR'),
            permission: fc.constantFrom('course:write', 'post:delete', 'member:remove', 'community:admin'),
            hasUserId: fc.boolean(),
            hasCommunityId: fc.boolean()
          }),
          async ({ action, permission, hasUserId, hasCommunityId }) => {
            const user = hasUserId ? await dbUtils.createUser() : null;
            const creator = await dbUtils.createUser();
            const community = hasCommunityId ? await dbUtils.createCommunity(creator.id) : null;

            // Log security event
            await auditLogger.logSecurityEvent({
              userId: user?.id || null,
              action,
              resource: permission,
              reason: 'Test audit log',
              communityId: community?.id,
              ipAddress: '127.0.0.1',
              userAgent: 'test-agent'
            });

            // Retrieve and validate audit logs (Requirement 6.6)
            const logs = await auditLogger.getAuditLogs({
              userId: user?.id,
              communityId: community?.id,
              limit: 1
            });

            expect(logs.logs).toHaveLength(1);
            const log = logs.logs[0];
            
            expect(log.action).toBe(action);
            expect(log.resource).toBe(permission);
            expect(log.userId).toBe(user?.id || null);
            expect(log.communityId).toBe(community?.id || null);
            expect(log.ipAddress).toBe('127.0.0.1');
            expect(log.userAgent).toBe('test-agent');
            expect(log.createdAt).toBeDefined();

            return true;
          }
        )
      );

      // Property 10.5: Role hierarchy consistency
      await assertProperty(
        fc.property(
          fc.record({
            role: fc.constantFrom('member', 'moderator', 'admin', 'creator'),
            isCreator: fc.boolean(),
            membershipData: fc.record({
              role: fc.constantFrom('member', 'moderator', 'admin'),
              status: fc.constantFrom('active', 'pending', 'suspended')
            })
          }),
          ({ role, isCreator, membershipData }) => {
            // Test effective role calculation
            const membership = membershipData.status === 'active' ? membershipData : null;
            const effectiveRole = getEffectiveRole(membership, isCreator);

            // Validate role hierarchy (Requirement 6.3)
            if (isCreator) {
              expect(effectiveRole).toBe('creator');
            } else if (membership && membership.status === 'active') {
              expect(effectiveRole).toBe(membership.role);
            } else {
              expect(effectiveRole).toBe('member');
            }

            // Test permission inheritance
            const permissions = {
              member: ['community:read', 'course:read', 'post:read', 'post:write'],
              moderator: ['community:read', 'community:write', 'course:write', 'post:moderate'],
              admin: ['community:admin', 'course:delete', 'post:delete', 'member:remove'],
              creator: ['community:delete', 'payment:admin']
            };

            // Each role should have at least the permissions of lower roles
            const roleHierarchy = ['member', 'moderator', 'admin', 'creator'];
            const currentRoleIndex = roleHierarchy.indexOf(effectiveRole);
            
            for (let i = 0; i <= currentRoleIndex; i++) {
              const lowerRole = roleHierarchy[i] as Role;
              const samplePermissions = permissions[lowerRole];
              
              for (const permission of samplePermissions) {
                if (hasPermission(lowerRole, permission as Permission)) {
                  expect(hasPermission(effectiveRole, permission as Permission)).toBe(true);
                }
              }
            }

            return true;
          }
        )
      );

      // Property 10.6: Bulk operation access control
      await assertProperty(
        fc.asyncProperty(
          fc.record({
            operation: fc.constantFrom('publish', 'delete', 'moderate'),
            userRole: fc.constantFrom('member', 'moderator', 'admin', 'creator'),
            resourceCount: fc.integer({ min: 1, max: 5 }),
            membershipStatus: fc.constantFrom('active', 'pending', 'suspended')
          }),
          async ({ operation, userRole, resourceCount, membershipStatus }) => {
            // Create test data
            const creator = await dbUtils.createUser();
            const user = await dbUtils.createUser();
            const community = await dbUtils.createCommunity(creator.id);

            // Create membership
            if (userRole !== 'creator') {
              await prisma.communityMembership.create({
                data: {
                  userId: user.id,
                  communityId: community.id,
                  role: userRole as any,
                  status: membershipStatus
                }
              });
            }

            // Create test resources
            const resourceIds: string[] = [];
            for (let i = 0; i < resourceCount; i++) {
              const course = await dbUtils.createCourse(community.id);
              resourceIds.push(course.id);
            }

            const testUserId = userRole === 'creator' ? creator.id : user.id;
            
            // Test bulk operation validation
            const validation = await AccessControlService.validateBulkOperation(
              testUserId,
              community.id,
              operation as 'publish' | 'delete' | 'moderate',
              resourceIds
            );

            // Validate bulk operation rules (Requirement 6.5)
            const access = await AccessControlService.checkCommunityAccess(community.id, testUserId);
            
            if (!access.hasAccess || membershipStatus !== 'active') {
              expect(validation.allowed).toBe(false);
              expect(validation.allowedIds).toHaveLength(0);
              expect(validation.deniedIds).toEqual(resourceIds);
            } else {
              const permissionMap: Record<string, Permission> = {
                publish: 'course:publish',
                delete: 'course:delete',
                moderate: 'post:moderate'
              };
              
              const requiredPermission = permissionMap[operation];
              const hasRequiredPermission = hasPermission(access.role, requiredPermission);
              
              expect(validation.allowed).toBe(hasRequiredPermission);
              
              if (hasRequiredPermission) {
                expect(validation.allowedIds).toEqual(resourceIds);
                expect(validation.deniedIds).toHaveLength(0);
              } else {
                expect(validation.allowedIds).toHaveLength(0);
                expect(validation.deniedIds).toEqual(resourceIds);
              }
            }

            return true;
          }
        )
      );
    }
  );
});