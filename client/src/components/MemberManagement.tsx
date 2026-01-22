import React, { useState } from 'react';
import { CommunityMembership, User } from '../types';

interface MemberWithUser extends CommunityMembership {
  user: User;
}

interface MemberManagementProps {
  members: MemberWithUser[];
  isLoading?: boolean;
  onUpdateMemberRole?: (memberId: string, role: 'member' | 'moderator' | 'admin') => Promise<void>;
  onUpdateMemberStatus?: (memberId: string, status: 'active' | 'suspended') => Promise<void>;
  onRemoveMember?: (memberId: string) => Promise<void>;
  currentUserRole?: 'member' | 'moderator' | 'admin';
}

export function MemberManagement({
  members,
  isLoading = false,
  onUpdateMemberRole,
  onUpdateMemberStatus,
  onRemoveMember,
  currentUserRole = 'member',
}: MemberManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const canManageMembers = currentUserRole === 'admin' || currentUserRole === 'moderator';
  const canManageRoles = currentUserRole === 'admin';

  const filteredMembers = members.filter((member) => {
    const matchesSearch = 
      member.user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.user.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.user.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = filterRole === 'all' || member.role === filterRole;
    const matchesStatus = filterStatus === 'all' || member.status === filterStatus;

    return matchesSearch && matchesRole && matchesStatus;
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white shadow rounded-lg p-4 animate-pulse">
            <div className="flex items-center space-x-4">
              <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/3"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
              Search Members
            </label>
            <input
              type="text"
              id="search"
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="filterRole" className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Role
            </label>
            <select
              id="filterRole"
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
            >
              <option value="all">All Roles</option>
              <option value="member">Members</option>
              <option value="moderator">Moderators</option>
              <option value="admin">Admins</option>
            </select>
          </div>

          <div>
            <label htmlFor="filterStatus" className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Status
            </label>
            <select
              id="filterStatus"
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          <div className="flex items-end">
            <div className="text-sm text-gray-500">
              {filteredMembers.length} of {members.length} members
            </div>
          </div>
        </div>
      </div>

      {/* Members List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Community Members
          </h3>
          
          {filteredMembers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No members found matching your criteria.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredMembers.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  canManageMembers={canManageMembers}
                  canManageRoles={canManageRoles}
                  onUpdateMemberRole={onUpdateMemberRole}
                  onUpdateMemberStatus={onUpdateMemberStatus}
                  onRemoveMember={onRemoveMember}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface MemberCardProps {
  member: MemberWithUser;
  canManageMembers: boolean;
  canManageRoles: boolean;
  onUpdateMemberRole?: (memberId: string, role: 'member' | 'moderator' | 'admin') => Promise<void>;
  onUpdateMemberStatus?: (memberId: string, status: 'active' | 'suspended') => Promise<void>;
  onRemoveMember?: (memberId: string) => Promise<void>;
}

function MemberCard({
  member,
  canManageMembers,
  canManageRoles,
  onUpdateMemberRole,
  onUpdateMemberStatus,
  onRemoveMember,
}: MemberCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleRoleChange = async (newRole: 'member' | 'moderator' | 'admin') => {
    if (!onUpdateMemberRole) return;
    
    setIsUpdating(true);
    try {
      await onUpdateMemberRole(member.id, newRole);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStatusChange = async (newStatus: 'active' | 'suspended') => {
    if (!onUpdateMemberStatus) return;
    
    setIsUpdating(true);
    try {
      await onUpdateMemberStatus(member.id, newStatus);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemove = async () => {
    if (!onRemoveMember || !window.confirm('Are you sure you want to remove this member?')) return;
    
    setIsUpdating(true);
    try {
      await onRemoveMember(member.id);
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      active: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      suspended: 'bg-red-100 text-red-800',
    };
    return badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-800';
  };

  const getRoleBadge = (role: string) => {
    const badges = {
      admin: 'bg-purple-100 text-purple-800',
      moderator: 'bg-blue-100 text-blue-800',
      member: 'bg-gray-100 text-gray-800',
    };
    return badges[role as keyof typeof badges] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
      <div className="flex items-center space-x-4">
        <div className="flex-shrink-0">
          {member.user.avatarUrl ? (
            <img
              className="h-10 w-10 rounded-full"
              src={member.user.avatarUrl}
              alt={member.user.displayName || member.user.username}
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
              <span className="text-sm font-medium text-gray-700">
                {(member.user.displayName || member.user.username).charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {member.user.displayName || member.user.username}
          </p>
          <p className="text-sm text-gray-500 truncate">{member.user.email}</p>
          <div className="flex items-center space-x-2 mt-1">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadge(member.role)}`}>
              {member.role}
            </span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(member.status)}`}>
              {member.status}
            </span>
          </div>
        </div>
      </div>

      {canManageMembers && (
        <div className="flex items-center space-x-2">
          {canManageRoles && (
            <select
              value={member.role}
              onChange={(e) => handleRoleChange(e.target.value as 'member' | 'moderator' | 'admin')}
              disabled={isUpdating}
              className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="member">Member</option>
              <option value="moderator">Moderator</option>
              <option value="admin">Admin</option>
            </select>
          )}

          {member.status === 'active' ? (
            <button
              onClick={() => handleStatusChange('suspended')}
              disabled={isUpdating}
              className="text-sm text-red-600 hover:text-red-500 disabled:opacity-50"
            >
              Suspend
            </button>
          ) : (
            <button
              onClick={() => handleStatusChange('active')}
              disabled={isUpdating}
              className="text-sm text-green-600 hover:text-green-500 disabled:opacity-50"
            >
              Activate
            </button>
          )}

          <button
            onClick={handleRemove}
            disabled={isUpdating}
            className="text-sm text-red-600 hover:text-red-500 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}