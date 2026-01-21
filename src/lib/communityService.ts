import prisma from './prisma';
import { Prisma } from '@prisma/client';

export interface CommunityCreateData {
  name: string;
  description?: string;
  slug: string;
  isPublic?: boolean;
  requiresApproval?: boolean;
  priceMonthly?: number;
  priceYearly?: number;
}

export interface CommunityUpdateData {
  name?: string;
  description?: string;
  isPublic?: boolean;
  requiresApproval?: boolean;
  priceMonthly?: number;
  priceYearly?: number;
}

export interface CommunityQueryOptions {
  limit?: number;
  offset?: number;
  search?: string;
  isPublic?: boolean;
  userId?: string; // For filtering user's communities
}

export interface MembershipUpdateData {
  role?: 'member' | 'moderator' | 'admin';
  status?: 'pending' | 'active' | 'suspended';
}

export class CommunityService {
  /**
   * Create a new community
   */
  static async createCommunity(creatorId: string, data: CommunityCreateData) {
    // Check if slug is already taken
    const existingCommunity = await prisma.community.findUnique({
      where: { slug: data.slug }
    });

    if (existingCommunity) {
      throw new Error('Community slug is already taken');
    }

    // Create community and add creator as admin member
    const result = await prisma.$transaction(async (tx) => {
      // Create the community
      const community = await tx.community.create({
        data: {
          ...data,
          creatorId,
          memberCount: 1
        },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true
            }
          },
          _count: {
            select: {
              memberships: true,
              posts: true,
              courses: true
            }
          }
        }
      });

      // Add creator as admin member
      await tx.communityMembership.create({
        data: {
          userId: creatorId,
          communityId: community.id,
          role: 'admin',
          status: 'active'
        }
      });

      return community;
    });

    return result;
  }

  /**
   * Get communities with optional filtering
   */
  static async getCommunities(options: CommunityQueryOptions = {}) {
    const {
      limit = 20,
      offset = 0,
      search,
      isPublic,
      userId
    } = options;

    const where: Prisma.CommunityWhereInput = {};

    // Apply filters
    if (isPublic !== undefined) {
      where.isPublic = isPublic;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (userId) {
      where.memberships = {
        some: {
          userId,
          status: 'active'
        }
      };
    }

    const [communities, total] = await Promise.all([
      prisma.community.findMany({
        where,
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true
            }
          },
          _count: {
            select: {
              memberships: true,
              posts: true,
              courses: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.community.count({ where })
    ]);

    return {
      communities,
      total,
      hasMore: offset + limit < total
    };
  }

  /**
   * Get a single community by ID or slug
   */
  static async getCommunity(identifier: string, userId?: string) {
    const community = await prisma.community.findFirst({
      where: {
        OR: [
          { id: identifier },
          { slug: identifier }
        ]
      },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true
          }
        },
        memberships: userId ? {
          where: { userId },
          select: {
            role: true,
            status: true,
            joinedAt: true
          }
        } : false,
        _count: {
          select: {
            memberships: true,
            posts: true,
            courses: true
          }
        }
      }
    });

    if (!community) {
      throw new Error('Community not found');
    }

    // Check if user has access to private community
    if (!community.isPublic && userId) {
      const membership = community.memberships?.[0];
      if (!membership || membership.status !== 'active') {
        throw new Error('Access denied to private community');
      }
    } else if (!community.isPublic && !userId) {
      throw new Error('Access denied to private community');
    }

    return community;
  }

  /**
   * Update community settings
   */
  static async updateCommunity(communityId: string, userId: string, data: CommunityUpdateData) {
    // Check if user is creator or admin
    const membership = await prisma.communityMembership.findFirst({
      where: {
        communityId,
        userId,
        OR: [
          { role: 'admin' },
          { 
            community: { creatorId: userId }
          }
        ],
        status: 'active'
      },
      include: {
        community: true
      }
    });

    if (!membership) {
      throw new Error('Insufficient permissions to update community');
    }

    const updatedCommunity = await prisma.community.update({
      where: { id: communityId },
      data,
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true
          }
        },
        _count: {
          select: {
            memberships: true,
            posts: true,
            courses: true
          }
        }
      }
    });

    return updatedCommunity;
  }

  /**
   * Delete a community
   */
  static async deleteCommunity(communityId: string, userId: string) {
    // Only creator can delete community
    const community = await prisma.community.findFirst({
      where: {
        id: communityId,
        creatorId: userId
      }
    });

    if (!community) {
      throw new Error('Community not found or insufficient permissions');
    }

    await prisma.community.delete({
      where: { id: communityId }
    });

    return { message: 'Community deleted successfully' };
  }

  /**
   * Request to join a community
   */
  static async requestMembership(communityId: string, userId: string) {
    const community = await prisma.community.findUnique({
      where: { id: communityId }
    });

    if (!community) {
      throw new Error('Community not found');
    }

    // Check if user is already a member
    const existingMembership = await prisma.communityMembership.findUnique({
      where: {
        userId_communityId: {
          userId,
          communityId
        }
      }
    });

    if (existingMembership) {
      if (existingMembership.status === 'active') {
        throw new Error('Already a member of this community');
      } else if (existingMembership.status === 'pending') {
        throw new Error('Membership request already pending');
      } else if (existingMembership.status === 'suspended') {
        throw new Error('Cannot join community - membership suspended');
      }
    }

    // Determine initial status based on community settings
    const initialStatus = community.requiresApproval ? 'pending' : 'active';

    const membership = await prisma.$transaction(async (tx) => {
      // Create or update membership
      const newMembership = await tx.communityMembership.upsert({
        where: {
          userId_communityId: {
            userId,
            communityId
          }
        },
        create: {
          userId,
          communityId,
          status: initialStatus,
          role: 'member'
        },
        update: {
          status: initialStatus,
          role: 'member',
          joinedAt: new Date()
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true
            }
          },
          community: {
            select: {
              id: true,
              name: true,
              slug: true
            }
          }
        }
      });

      // Update member count if approved immediately
      if (initialStatus === 'active') {
        await tx.community.update({
          where: { id: communityId },
          data: {
            memberCount: {
              increment: 1
            }
          }
        });
      }

      return newMembership;
    });

    return membership;
  }

  /**
   * Leave a community
   */
  static async leaveCommunity(communityId: string, userId: string) {
    const community = await prisma.community.findUnique({
      where: { id: communityId }
    });

    if (!community) {
      throw new Error('Community not found');
    }

    // Creator cannot leave their own community
    if (community.creatorId === userId) {
      throw new Error('Community creator cannot leave their own community');
    }

    const membership = await prisma.communityMembership.findUnique({
      where: {
        userId_communityId: {
          userId,
          communityId
        }
      }
    });

    if (!membership) {
      throw new Error('Not a member of this community');
    }

    await prisma.$transaction(async (tx) => {
      // Remove membership
      await tx.communityMembership.delete({
        where: {
          userId_communityId: {
            userId,
            communityId
          }
        }
      });

      // Update member count if was active member
      if (membership.status === 'active') {
        await tx.community.update({
          where: { id: communityId },
          data: {
            memberCount: {
              decrement: 1
            }
          }
        });
      }
    });

    return { message: 'Successfully left community' };
  }

  /**
   * Get community members
   */
  static async getCommunityMembers(communityId: string, userId: string, options: { limit?: number; offset?: number; role?: string; status?: string } = {}) {
    // Check if user has access to view members
    const userMembership = await prisma.communityMembership.findFirst({
      where: {
        communityId,
        userId,
        status: 'active'
      }
    });

    if (!userMembership) {
      throw new Error('Access denied - not a member of this community');
    }

    const { limit = 20, offset = 0, role, status } = options;

    const where: Prisma.CommunityMembershipWhereInput = {
      communityId
    };

    if (role) {
      where.role = role as any;
    }

    if (status) {
      where.status = status as any;
    }

    const [members, total] = await Promise.all([
      prisma.communityMembership.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              totalPoints: true
            }
          }
        },
        orderBy: [
          { role: 'asc' }, // admins first, then moderators, then members
          { joinedAt: 'asc' }
        ],
        take: limit,
        skip: offset
      }),
      prisma.communityMembership.count({ where })
    ]);

    return {
      members,
      total,
      hasMore: offset + limit < total
    };
  }

  /**
   * Update member role or status (admin/moderator only)
   */
  static async updateMember(communityId: string, targetUserId: string, adminUserId: string, updates: MembershipUpdateData) {
    // Check if admin has permissions
    const adminMembership = await prisma.communityMembership.findFirst({
      where: {
        communityId,
        userId: adminUserId,
        OR: [
          { role: 'admin' },
          { 
            community: { creatorId: adminUserId }
          }
        ],
        status: 'active'
      },
      include: {
        community: true
      }
    });

    if (!adminMembership) {
      throw new Error('Insufficient permissions to update member');
    }

    // Get target member
    const targetMembership = await prisma.communityMembership.findUnique({
      where: {
        userId_communityId: {
          userId: targetUserId,
          communityId
        }
      }
    });

    if (!targetMembership) {
      throw new Error('Member not found');
    }

    // Creator cannot be demoted or suspended
    if (adminMembership.community.creatorId === targetUserId) {
      throw new Error('Cannot modify community creator membership');
    }

    // Only creator can promote to admin or demote admins
    if (updates.role === 'admin' || targetMembership.role === 'admin') {
      if (adminMembership.community.creatorId !== adminUserId) {
        throw new Error('Only community creator can manage admin roles');
      }
    }

    const wasActive = targetMembership.status === 'active';
    const willBeActive = (updates.status || targetMembership.status) === 'active';

    const updatedMembership = await prisma.$transaction(async (tx) => {
      const updated = await tx.communityMembership.update({
        where: {
          userId_communityId: {
            userId: targetUserId,
            communityId
          }
        },
        data: updates,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true
            }
          }
        }
      });

      // Update member count if status changed
      if (wasActive && !willBeActive) {
        await tx.community.update({
          where: { id: communityId },
          data: { memberCount: { decrement: 1 } }
        });
      } else if (!wasActive && willBeActive) {
        await tx.community.update({
          where: { id: communityId },
          data: { memberCount: { increment: 1 } }
        });
      }

      return updated;
    });

    return updatedMembership;
  }

  /**
   * Remove member from community (admin/moderator only)
   */
  static async removeMember(communityId: string, targetUserId: string, adminUserId: string) {
    // Check if admin has permissions
    const adminMembership = await prisma.communityMembership.findFirst({
      where: {
        communityId,
        userId: adminUserId,
        OR: [
          { role: 'admin' },
          { role: 'moderator' },
          { 
            community: { creatorId: adminUserId }
          }
        ],
        status: 'active'
      },
      include: {
        community: true
      }
    });

    if (!adminMembership) {
      throw new Error('Insufficient permissions to remove member');
    }

    // Get target member
    const targetMembership = await prisma.communityMembership.findUnique({
      where: {
        userId_communityId: {
          userId: targetUserId,
          communityId
        }
      }
    });

    if (!targetMembership) {
      throw new Error('Member not found');
    }

    // Creator cannot be removed
    if (adminMembership.community.creatorId === targetUserId) {
      throw new Error('Cannot remove community creator');
    }

    // Moderators can only remove regular members
    if (adminMembership.role === 'moderator' && targetMembership.role !== 'member') {
      throw new Error('Moderators can only remove regular members');
    }

    // Only creator or admin can remove admins/moderators
    if (targetMembership.role !== 'member' && adminMembership.role !== 'admin' && adminMembership.community.creatorId !== adminUserId) {
      throw new Error('Insufficient permissions to remove this member');
    }

    await prisma.$transaction(async (tx) => {
      // Remove membership
      await tx.communityMembership.delete({
        where: {
          userId_communityId: {
            userId: targetUserId,
            communityId
          }
        }
      });

      // Update member count if was active member
      if (targetMembership.status === 'active') {
        await tx.community.update({
          where: { id: communityId },
          data: {
            memberCount: {
              decrement: 1
            }
          }
        });
      }
    });

    return { message: 'Member removed successfully' };
  }
}