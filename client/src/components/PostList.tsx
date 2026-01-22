import React, { useState } from 'react';
import { Post, Comment, User } from '../types';

interface PostWithAuthor extends Post {
  author: User;
}

interface PostListProps {
  posts: PostWithAuthor[];
  isLoading?: boolean;
  onLikePost?: (postId: string) => Promise<void>;
  onAddComment?: (postId: string, content: string) => Promise<void>;
  onLikeComment?: (commentId: string) => Promise<void>;
  currentUser?: User;
}

export function PostList({
  posts,
  isLoading = false,
  onLikePost,
  onAddComment,
  onLikeComment,
  currentUser,
}: PostListProps) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white shadow rounded-lg p-6 animate-pulse">
            <div className="flex items-center space-x-3 mb-4">
              <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-1/6"></div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 text-lg mb-4">No posts yet</div>
        <p className="text-gray-400">
          Be the first to start a discussion in this community!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          onLikePost={onLikePost}
          onAddComment={onAddComment}
          onLikeComment={onLikeComment}
          currentUser={currentUser}
        />
      ))}
    </div>
  );
}

interface PostCardProps {
  post: PostWithAuthor;
  onLikePost?: (postId: string) => Promise<void>;
  onAddComment?: (postId: string, content: string) => Promise<void>;
  onLikeComment?: (commentId: string) => Promise<void>;
  currentUser?: User;
}

function PostCard({
  post,
  onLikePost,
  onAddComment,
  onLikeComment,
  currentUser,
}: PostCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isLiking, setIsLiking] = useState(false);
  const [isCommenting, setIsCommenting] = useState(false);

  const handleLike = async () => {
    if (!onLikePost) return;
    
    setIsLiking(true);
    try {
      await onLikePost(post.id);
    } finally {
      setIsLiking(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddComment || !newComment.trim()) return;
    
    setIsCommenting(true);
    try {
      await onAddComment(post.id, newComment.trim());
      setNewComment('');
    } finally {
      setIsCommenting(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      {/* Post Header */}
      <div className="flex items-center space-x-3 mb-4">
        <div className="flex-shrink-0">
          {post.author.avatarUrl ? (
            <img
              className="h-10 w-10 rounded-full"
              src={post.author.avatarUrl}
              alt={post.author.displayName || post.author.username}
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
              <span className="text-sm font-medium text-gray-700">
                {(post.author.displayName || post.author.username).charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium text-gray-900 truncate">
              {post.author.displayName || post.author.username}
            </p>
            {post.postType === 'announcement' && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                Announcement
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">{formatTimeAgo(post.createdAt)}</p>
        </div>
      </div>

      {/* Post Content */}
      <div className="mb-4">
        {post.title && (
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{post.title}</h3>
        )}
        <div className="text-gray-700 whitespace-pre-wrap">{post.content}</div>
      </div>

      {/* Post Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <div className="flex items-center space-x-6">
          <button
            onClick={handleLike}
            disabled={isLiking || !currentUser}
            className="flex items-center space-x-2 text-sm text-gray-500 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <span>{post.likeCount} {post.likeCount === 1 ? 'like' : 'likes'}</span>
          </button>
          
          <button
            onClick={() => setShowComments(!showComments)}
            className="flex items-center space-x-2 text-sm text-gray-500 hover:text-indigo-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span>{post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}</span>
          </button>
        </div>
      </div>

      {/* Comments Section */}
      {showComments && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          {/* Add Comment Form */}
          {currentUser && onAddComment && (
            <form onSubmit={handleAddComment} className="mb-6">
              <div className="flex space-x-3">
                <div className="flex-shrink-0">
                  {currentUser.avatarUrl ? (
                    <img
                      className="h-8 w-8 rounded-full"
                      src={currentUser.avatarUrl}
                      alt={currentUser.displayName || currentUser.username}
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center">
                      <span className="text-xs font-medium text-gray-700">
                        {(currentUser.displayName || currentUser.username).charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <textarea
                    rows={3}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="Write a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={isCommenting || !newComment.trim()}
                      className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCommenting ? 'Posting...' : 'Comment'}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}

          {/* Comments List */}
          <div className="space-y-4">
            {/* Mock comments for demo */}
            <div className="flex space-x-3">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center">
                  <span className="text-xs font-medium text-gray-700">J</span>
                </div>
              </div>
              <div className="flex-1">
                <div className="bg-gray-50 rounded-lg px-4 py-2">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-sm font-medium text-gray-900">John Doe</span>
                    <span className="text-xs text-gray-500">2h ago</span>
                  </div>
                  <p className="text-sm text-gray-700">
                    Great post! This is really helpful information.
                  </p>
                </div>
                <div className="mt-2 flex items-center space-x-4">
                  <button className="text-xs text-gray-500 hover:text-indigo-600">
                    👍 3 likes
                  </button>
                  <button className="text-xs text-gray-500 hover:text-indigo-600">
                    Reply
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}