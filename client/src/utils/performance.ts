// Performance optimization utilities for the React client
import React from 'react';

// Lazy loading utility
export const lazyLoad = (importFunc: () => Promise<any>) => {
  return React.lazy(importFunc);
};

// Image lazy loading with intersection observer
export class LazyImageLoader {
  private observer: IntersectionObserver | null = null;

  constructor() {
    if ('IntersectionObserver' in window) {
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const img = entry.target as HTMLImageElement;
              if (img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
                this.observer?.unobserve(img);
              }
            }
          });
        },
        {
          rootMargin: '50px 0px',
          threshold: 0.01
        }
      );
    }
  }

  observe(element: HTMLImageElement) {
    if (this.observer) {
      this.observer.observe(element);
    } else {
      // Fallback for browsers without IntersectionObserver
      if (element.dataset.src) {
        element.src = element.dataset.src;
        element.removeAttribute('data-src');
      }
    }
  }

  disconnect() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}

// Debounce utility for search and input handling
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate?: boolean
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    
    const callNow = immediate && !timeout;
    
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    
    if (callNow) func(...args);
  };
}

// Throttle utility for scroll and resize events
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return function executedFunction(this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Memory-efficient list virtualization for large datasets
export class VirtualList {
  private container: HTMLElement;
  private itemHeight: number;
  private visibleCount: number;
  private totalCount: number;
  private scrollTop: number = 0;

  constructor(
    container: HTMLElement,
    itemHeight: number,
    visibleCount: number,
    totalCount: number
  ) {
    this.container = container;
    this.itemHeight = itemHeight;
    this.visibleCount = visibleCount;
    this.totalCount = totalCount;
  }

  getVisibleRange(): { start: number; end: number } {
    const start = Math.floor(this.scrollTop / this.itemHeight);
    const end = Math.min(start + this.visibleCount, this.totalCount);
    return { start, end };
  }

  updateScrollTop(scrollTop: number) {
    this.scrollTop = scrollTop;
  }

  getTotalHeight(): number {
    return this.totalCount * this.itemHeight;
  }

  getOffsetY(): number {
    const { start } = this.getVisibleRange();
    return start * this.itemHeight;
  }
}

// Bundle size optimization - dynamic imports
export const loadChunk = async (chunkName: string) => {
  try {
    switch (chunkName) {
      case 'profile':
        return await import('../pages/ProfilePage');
      case 'communities':
        return await import('../pages/CommunitiesPage');
      case 'course':
        return await import('../pages/CourseDetailPage');
      case 'feed':
        return await import('../pages/FeedPage');
      default:
        throw new Error(`Unknown chunk: ${chunkName}`);
    }
  } catch (error) {
    console.error(`Failed to load chunk ${chunkName}:`, error);
    throw error;
  }
};

// Service Worker registration for caching
export const registerServiceWorker = () => {
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('SW registered: ', registration);
        })
        .catch((registrationError) => {
          console.log('SW registration failed: ', registrationError);
        });
    });
  }
};

// Performance monitoring
export class PerformanceMonitor {
  private metrics: Map<string, number> = new Map();

  startTiming(label: string) {
    this.metrics.set(`${label}_start`, performance.now());
  }

  endTiming(label: string): number {
    const startTime = this.metrics.get(`${label}_start`);
    if (startTime) {
      const duration = performance.now() - startTime;
      this.metrics.set(label, duration);
      return duration;
    }
    return 0;
  }

  getMetric(label: string): number | undefined {
    return this.metrics.get(label);
  }

  getAllMetrics(): Record<string, number> {
    return Object.fromEntries(this.metrics);
  }

  // Report Core Web Vitals
  reportWebVitals() {
    if ('web-vitals' in window) {
      import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
        getCLS(console.log);
        getFID(console.log);
        getFCP(console.log);
        getLCP(console.log);
        getTTFB(console.log);
      });
    }
  }
}

// Memory management utilities
export const cleanupResources = () => {
  // Clear any intervals or timeouts
  // Note: This is a simplified cleanup - in practice, you'd track specific IDs
  console.log('Cleaning up resources...');
};

// Preload critical resources
export const preloadResource = (href: string, as: string) => {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = href;
  link.as = as;
  document.head.appendChild(link);
};

// Critical CSS inlining
export const inlineCriticalCSS = (css: string) => {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
};

// Font loading optimization
export const optimizeFontLoading = () => {
  // Preload critical fonts
  const fonts = [
    '/fonts/inter-var.woff2',
    '/fonts/inter-regular.woff2'
  ];

  fonts.forEach(font => {
    preloadResource(font, 'font');
  });

  // Use font-display: swap for better performance
  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: 'Inter';
      font-display: swap;
      src: url('/fonts/inter-var.woff2') format('woff2');
    }
  `;
  document.head.appendChild(style);
};

// Create singleton instances
export const lazyImageLoader = new LazyImageLoader();
export const performanceMonitor = new PerformanceMonitor();