import React, { useState, useEffect, useCallback } from 'react';
import { PostList } from './PostList';
import { useSocket } from '../contexts/SocketContext';
import { Post, Comment, User } from '../types';

interface PostWithAuthor extends Post {
  author: User;
}

interface RealTimePostListProps {
  communityId: string;
  initialPosts: PostWithAuthor[];
  isLoading?: boolean;
  onLikePost?: (postId: string) => Promise<void>;
  onAddComment?: (postId: string, content: string) => Promise<void>;
  onLikeComment?: (commentId: string) => Promise<void>;
  currentUser?: User;
}

export function RealTimePostList({
  communityId,
  initialPosts,
  isLoading = false,
  onLikePost,
  onAddComment,
  onLikeComment,
  currentUser,
}: RealTimePostListProps) {
  const [posts, setPosts] = useState<PostWithAuthor[]>(initialPosts);
  const [newPostsCount, setNewPostsCount] = useState(0);
  const [showNewPostsButton, setShowNewPostsButton] = useState(false);
  const { joinCommunity, leaveCommunity, on, off, isConnected } = useSocket();

  // Join community room when component mounts
  useEffect(() => {
    if (isConnected && communityId) {
      joinCommunity(communityId);
    }

    return () => {
      if (communityId) {
        leaveCommunity(communityId);
      }
    };
  }, [communityId, isConnected, joinCommunity, leaveCommunity]);

  // Update posts when initialPosts change
  useEffect(() => {
    setPosts(initialPosts);
    setNewPostsCount(0);
    setShowNewPostsButton(false);
  }, [initialPosts]);

  // Handle new posts
  const handleNewPost = useCallback((data: { post: PostWithAuthor }) => {
    const newPost = data.post;
    
    // Don't add if it's from the current user (they'll see it immediately)
    if (currentUser && newPost.author.id === currentUser.id) {
      return;
    }

    setPosts(prevPosts => {
      // Check if post already exists
      if (prevPosts.some(p => p.id === newPost.id)) {
        return prevPosts;
      }
      
      // Add new post to the beginning
      return [newPost, ...prevPosts];
    });

    setNewPostsCount(prev => prev + 1);
    setShowNewPostsButton(true);
  }, [currentUser]);

  // Handle new comments
  const handleNewComment = useCallback((data: { postId: string; comment: Comment & { author: User } }) => {
    const { postId, comment } = data;
    
    setPosts(prevPosts => 
      prevPosts.map(post => {
        if (post.id === postId) {
          return {
            ...post,
            commentCount: post.commentCount + 1,
            // You could also add the comment to a comments array if you're tracking them
          };
        }
        return post;
      })
    );
  }, []);

  // Handle member joined
  const handleMemberJoined = useCallback((data: { member: User }) => {
    // You could show a toast notification here
    console.log('New member joined:', data.member.username);
  }, []);

  // Handle member left
  const handleMemberLeft = useCallback((data: { member: User }) => {
    // You could show a toast notification here
    console.log('Member left:', data.member.username);
  }, []);

  // Set up event listeners
  useEffect(() => {
    on('community:new_post', handleNewPost);
    on('community:new_comment', handleNewComment);
    on('community:member_joined', handleMemberJoined);
    on('community:member_left', handleMemberLeft);

    return () => {
      off('community:new_post', handleNewPost);
      off('community:new_comment', handleNewComment);
      off('community:member_joined', handleMemberJoined);
      off('community:member_left', handleMemberLeft);
    };
  }, [on, off, handleNewPost, handleNewComment, handleMemberJoined, handleMemberLeft]);

  const handleShowNewPosts = () => {
    setNewPostsCount(0);
    setShowNewPostsButton(false);
    // Scroll to top to show new posts
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const enhancedOnAddComment = async (postId: string, content: string) => {
    if (onAddComment) {
      await onAddComment(postId, content);
      // The real-time update will be handled by the WebSocket event
    }
  };

  return (
    <div className="relative">
      {/* New Posts Notification */}
      {showNewPostsButton && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-40">
          <button
            onClick={handleShowNewPosts}
            className="bg-indigo-600 text-white px-4 py-2 rounded-full shadow-lg hover:bg-indigo-700 transition-colors duration-200 flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
            <span>
              {newPostsCount} new {newPostsCount === 1 ? 'post' : 'posts'}
            </span>
          </button>
        </div>
      )}

      {/* Connection Status Indicator */}
      {!isConnected && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-800">
                Real-time updates are currently unavailable. Posts and comments may not appear immediately.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Posts List */}
      <PostList
        posts={posts}
        isLoading={isLoading}
        onLikePost={onLikePost}
        onAddComment={enhancedOnAddComment}
        onLikeComment={onLikeComment}
        currentUser={currentUser}
      />
    </div>
  );
}