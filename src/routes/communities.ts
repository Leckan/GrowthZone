import { Router, Request, Response } from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth';
import { 
  validateRequest, 
  createCommunitySchema, 
  updateCommunitySchema, 
  communityQuerySchema,
  memberRoleUpdateSchema,
  memberStatusUpdateSchema
} from '../lib/validation';
import { CommunityService } from '../lib/communityService';

const router = Router();

/**
 * GET /api/v1/communities
 * Get communities with optional filtering
 */
router.get('/', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = validateRequest(communityQuerySchema, req.query);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const options: any = validation.data || {};
    
    // If user is authenticated, they can see their private communities
    if (req.user) {
      options.userId = req.user.id;
    } else {
      // Non-authenticated users can only see public communities
      options.isPublic = true;
    }

    const result = await CommunityService.getCommunities(options);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get communities error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to fetch communities'
    });
  }
});

/**
 * POST /api/v1/communities
 * Create a new community
 */
router.post('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = validateRequest(createCommunitySchema, req.body);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const community = await CommunityService.createCommunity(req.user!.id, validation.data!);

    res.status(201).json({
      success: true,
      data: community,
      message: 'Community created successfully'
    });
  } catch (error) {
    console.error('Create community error:', error);
    
    if (error instanceof Error && error.message === 'Community slug is already taken') {
      res.status(409).json({
        error: 'Conflict',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to create community'
    });
  }
});

/**
 * GET /api/v1/communities/:identifier
 * Get a single community by ID or slug
 */
router.get('/:identifier', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier } = req.params;
    
    const community = await CommunityService.getCommunity(identifier, req.user?.id);

    res.json({
      success: true,
      data: community
    });
  } catch (error) {
    console.error('Get community error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Community not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Access denied to private community') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to fetch community'
    });
  }
});

/**
 * PUT /api/v1/communities/:id
 * Update community settings
 */
router.put('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const validation = validateRequest(updateCommunitySchema, req.body);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const community = await CommunityService.updateCommunity(id, req.user!.id, validation.data!);

    res.json({
      success: true,
      data: community,
      message: 'Community updated successfully'
    });
  } catch (error) {
    console.error('Update community error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Insufficient permissions to update community') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to update community'
    });
  }
});

/**
 * DELETE /api/v1/communities/:id
 * Delete a community (creator only)
 */
router.delete('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const result = await CommunityService.deleteCommunity(id, req.user!.id);

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Delete community error:', error);
    
    if (error instanceof Error && error.message === 'Community not found or insufficient permissions') {
      res.status(404).json({
        error: 'Not found',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to delete community'
    });
  }
});

/**
 * POST /api/v1/communities/:id/join
 * Request to join a community
 */
router.post('/:id/join', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const membership = await CommunityService.requestMembership(id, req.user!.id);

    const message = membership.status === 'pending' 
      ? 'Membership request submitted for approval'
      : 'Successfully joined community';

    res.status(201).json({
      success: true,
      data: membership,
      message
    });
  } catch (error) {
    console.error('Join community error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Community not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message.includes('Already a member') || 
          error.message.includes('already pending') || 
          error.message.includes('suspended')) {
        res.status(409).json({
          error: 'Conflict',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to join community'
    });
  }
});

/**
 * DELETE /api/v1/communities/:id/leave
 * Leave a community
 */
router.delete('/:id/leave', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const result = await CommunityService.leaveCommunity(id, req.user!.id);

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Leave community error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Community not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Not a member of this community') {
        res.status(409).json({
          error: 'Conflict',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Community creator cannot leave their own community') {
        res.status(403).json({
          error: 'Forbidden',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to leave community'
    });
  }
});

/**
 * GET /api/v1/communities/:id/members
 * Get community members
 */
router.get('/:id/members', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const validation = validateRequest(communityQuerySchema, req.query);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const options: any = validation.data || {};
    
    const result = await CommunityService.getCommunityMembers(id, req.user!.id, options);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get community members error:', error);
    
    if (error instanceof Error && error.message === 'Access denied - not a member of this community') {
      res.status(403).json({
        error: 'Access denied',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to fetch community members'
    });
  }
});

/**
 * PUT /api/v1/communities/:id/members/:userId/role
 * Update member role
 */
router.put('/:id/members/:userId/role', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, userId } = req.params;
    
    const validation = validateRequest(memberRoleUpdateSchema, req.body);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const membership = await CommunityService.updateMember(id, userId, req.user!.id, validation.data!);

    res.json({
      success: true,
      data: membership,
      message: 'Member role updated successfully'
    });
  } catch (error) {
    console.error('Update member role error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Insufficient permissions to update member' ||
          error.message === 'Only community creator can manage admin roles' ||
          error.message === 'Cannot modify community creator membership') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Member not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to update member role'
    });
  }
});

/**
 * PUT /api/v1/communities/:id/members/:userId/status
 * Update member status
 */
router.put('/:id/members/:userId/status', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, userId } = req.params;
    
    const validation = validateRequest(memberStatusUpdateSchema, req.body);
    
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const membership = await CommunityService.updateMember(id, userId, req.user!.id, validation.data!);

    res.json({
      success: true,
      data: membership,
      message: 'Member status updated successfully'
    });
  } catch (error) {
    console.error('Update member status error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Insufficient permissions to update member' ||
          error.message === 'Cannot modify community creator membership') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Member not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to update member status'
    });
  }
});

/**
 * DELETE /api/v1/communities/:id/members/:userId
 * Remove member from community
 */
router.delete('/:id/members/:userId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, userId } = req.params;
    
    const result = await CommunityService.removeMember(id, userId, req.user!.id);

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Remove member error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Insufficient permissions to remove member' ||
          error.message === 'Cannot remove community creator' ||
          error.message === 'Moderators can only remove regular members' ||
          error.message === 'Insufficient permissions to remove this member') {
        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
        return;
      }
      
      if (error.message === 'Member not found') {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to remove member'
    });
  }
});

export default router;