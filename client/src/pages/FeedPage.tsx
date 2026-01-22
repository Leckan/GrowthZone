import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Navigation } from '../components/Navigation';
import { PostForm } from '../components/PostForm';
import { PostList } from '../components/PostList';
import { useAuth } from '../contexts/AuthContext';
import { Post, User, PostFormData } from '../types';

interface PostWithAuthor extends Post {
  author: User;
}

export function FeedPage() {
  const { communityId } = useParams<{ communityId: string }>();
  const { user } = useAuth();
  const [posts, setPosts] = useState<PostWithAuthor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showPostForm, setShowPostForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'discussion' | 'announcement'>('all');
  const [error, setError] = useState('');

  useEffect(() => {
    loadPosts();
  }, [communityId]);

  const loadPosts = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      // Mock data for demo
      const mockPosts: PostWithAuthor[] = [
        {
          id: 'post-1',
          communityId: communityId || 'community-1',
          authorId: 'user-1',
          title: 'Welcome to our community!',
          content: 'Hello everyone! Welcome to our learning community. Feel free to introduce yourself and share what you\'re hoping to learn here.',
          postType: 'announcement',
          likeCount: 12,
          commentCount: 5,
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
          updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          author: {
            id: 'user-1',
            email: 'admin@example.com',
            username: 'admin',
            displayName: 'Community Admin',
            totalPoints: 1000,
            emailVerified: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        {
          id: 'post-2',
          communityId: communityId || 'community-1',
          authorId: 'user-2',
          content: 'Just finished the first lesson and I\'m already learning so much! The explanations are really clear and easy to follow. Looking forward to the next one.',
          postType: 'discussion',
          likeCount: 8,
          commentCount: 3,
          createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
          updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
          author: {
            id: 'user-2',
            email: 'jane@example.com',
            username: 'jane_doe',
            displayName: 'Jane Doe',
            totalPoints: 250,
            emailVerified: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        {
          id: 'post-3',
          communityId: communityId || 'community-1',
          authorId: 'user-3',
          title: 'Question about React Hooks',
          content: 'I\'m having trouble understanding when to use useEffect vs useLayoutEffect. Can someone explain the difference and provide some examples?',
          postType: 'discussion',
          likeCount: 15,
          commentCount: 8,
          createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
          updatedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
          author: {
            id: 'user-3',
            email: 'mike@example.com',
            username: 'mike_dev',
            displayName: 'Mike Developer',
            totalPoints: 180,
            emailVerified: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      ];
      
      setPosts(mockPosts);
    } catch (err) {
      setError('Failed to load posts');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatePost = async (data: PostFormData): Promise<boolean> => {
    try {
      // Mock implementation
      const newPost: PostWithAuthor = {
        id: `post-${Date.now()}`,
        communityId: communityId || 'community-1',
        authorId: user?.id || 'user-current',
        title: data.title,
        content: data.content,
        postType: data.postType,
        likeCount: 0,
        commentCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: user || {
          id: 'user-current',
          email: 'current@example.com',
          username: 'current_user',
          displayName: 'Current User',
          totalPoints: 0,
          emailVerified: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
      
      setPosts(prev => [newPost, ...prev]);
      setShowPostForm(false);
      return true;
    } catch (err) {
      return false;
    }
  };

  const handleLikePost = async (postId: string) => {
    // Mock implementation
    setPosts(prev => 
      prev.map(post => 
        post.id === postId 
          ? { ...post, likeCount: post.likeCount + 1 }
          : post
      )
    );
  };

  const handleAddComment = async (postId: string, content: string) => {
    // Mock implementation
    setPosts(prev => 
      prev.map(post => 
        post.id === postId 
          ? { ...post, commentCount: post.commentCount + 1 }
          : post
      )
    );
  };

  const filteredPosts = posts.filter(post => {
    const matchesSearch = 
      post.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.author.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.author.username.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || post.postType === filterType;
    
    return matchesSearch && matchesType;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Community Feed</h1>
          <p className="mt-2 text-gray-600">
            Join the conversation and share your thoughts with the community.
          </p>
        </div>

        {/* Create Post Button */}
        {user && (
          <div className="mb-6">
            {!showPostForm ? (
              <button
                onClick={() => setShowPostForm(true)}
                className="w-full p-4 text-left bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    {user.avatarUrl ? (
                      <img
                        className="h-10 w-10 rounded-full"
                        src={user.avatarUrl}
                        alt={user.displayName || user.username}
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                        <span className="text-sm font-medium text-gray-700">
                          {(user.displayName || user.username).charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-gray-500">What's on your mind?</span>
                </div>
              </button>
            ) : (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Post</h3>
                <PostForm
                  onSubmit={handleCreatePost}
                  onCancel={() => setShowPostForm(false)}
                  submitLabel="Post"
                />
              </div>
            )}
          </div>
        )}

        {/* Search and Filters */}
        <div className="mb-6 bg-white shadow rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="search" className="sr-only">
                Search posts
              </label>
              <input
                type="text"
                id="search"
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Search posts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div>
              <label htmlFor="filterType" className="sr-only">
                Filter by type
              </label>
              <select
                id="filterType"
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as 'all' | 'discussion' | 'announcement')}
              >
                <option value="all">All Posts</option>
                <option value="discussion">Discussions</option>
                <option value="announcement">Announcements</option>
              </select>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}

        {/* Posts List */}
        <PostList
          posts={filteredPosts}
          isLoading={isLoading}
          onLikePost={user ? handleLikePost : undefined}
          onAddComment={user ? handleAddComment : undefined}
          currentUser={user || undefined}
        />

        {/* Empty State for Non-Authenticated Users */}
        {!user && !isLoading && (
          <div className="text-center py-12 bg-white shadow rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Join the Discussion
            </h3>
            <p className="text-gray-600 mb-6">
              Sign in to like posts, add comments, and join the conversation.
            </p>
            <div className="space-x-4">
              <a
                href="/login"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
              >
                Sign In
              </a>
              <a
                href="/register"
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Sign Up
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}