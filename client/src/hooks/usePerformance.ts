import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { debounce, throttle, performanceMonitor } from '../utils/performance';

// Hook for debounced values (useful for search inputs)
export const useDebounce = <T>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// Hook for throttled callbacks (useful for scroll events)
export const useThrottle = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number
) => {
  const throttledCallback = useMemo(
    () => throttle(callback, delay),
    [callback, delay]
  );

  return throttledCallback as T;
};

// Hook for debounced callbacks (useful for API calls)
export const useDebounceCallback = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number
) => {
  const debouncedCallback = useMemo(
    () => debounce(callback, delay),
    [callback, delay]
  );

  return debouncedCallback as T;
};

// Hook for intersection observer (lazy loading, infinite scroll)
export const useIntersectionObserver = (
  options: IntersectionObserverInit = {}
) => {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);
        setEntry(entry);
      },
      {
        threshold: 0.1,
        rootMargin: '50px',
        ...options
      }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [options]);

  return { elementRef, isIntersecting, entry };
};

// Hook for virtual scrolling (large lists)
export const useVirtualScroll = <T>(
  items: T[],
  itemHeight: number,
  containerHeight: number
) => {
  const [scrollTop, setScrollTop] = useState(0);

  const visibleCount = Math.ceil(containerHeight / itemHeight) + 2; // Buffer
  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(startIndex + visibleCount, items.length);

  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex).map((item, index) => ({
      item,
      index: startIndex + index,
      offsetY: (startIndex + index) * itemHeight
    }));
  }, [items, startIndex, endIndex, itemHeight]);

  const totalHeight = items.length * itemHeight;

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  return {
    visibleItems,
    totalHeight,
    handleScroll,
    startIndex,
    endIndex
  };
};

// Hook for performance monitoring
export const usePerformanceMonitor = (componentName: string) => {
  useEffect(() => {
    performanceMonitor.startTiming(`${componentName}_mount`);
    
    return () => {
      performanceMonitor.endTiming(`${componentName}_mount`);
    };
  }, [componentName]);

  const measureRender = useCallback((renderName: string) => {
    performanceMonitor.startTiming(`${componentName}_${renderName}`);
    
    return () => {
      performanceMonitor.endTiming(`${componentName}_${renderName}`);
    };
  }, [componentName]);

  return { measureRender };
};

// Hook for memory leak prevention
export const useCleanup = (cleanup: () => void) => {
  useEffect(() => {
    return cleanup;
  }, [cleanup]);
};

// Hook for efficient API caching
export const useApiCache = <T>(
  key: string,
  fetcher: () => Promise<T>,
  options: {
    ttl?: number;
    staleWhileRevalidate?: boolean;
  } = {}
) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const cacheRef = useRef<Map<string, { data: T; timestamp: number }>>(new Map());

  const { ttl = 5 * 60 * 1000, staleWhileRevalidate = true } = options; // 5 minutes default

  const fetchData = useCallback(async (useCache = true) => {
    const cached = cacheRef.current.get(key);
    const now = Date.now();

    // Return cached data if valid
    if (useCache && cached && (now - cached.timestamp) < ttl) {
      setData(cached.data);
      return cached.data;
    }

    // Return stale data immediately, then fetch fresh data
    if (staleWhileRevalidate && cached) {
      setData(cached.data);
    } else {
      setLoading(true);
    }

    try {
      const freshData = await fetcher();
      cacheRef.current.set(key, { data: freshData, timestamp: now });
      setData(freshData);
      setError(null);
      return freshData;
    } catch (err) {
      setError(err as Error);
      // Return cached data on error if available
      if (cached) {
        setData(cached.data);
        return cached.data;
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, [key, fetcher, ttl, staleWhileRevalidate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const invalidate = useCallback(() => {
    cacheRef.current.delete(key);
  }, [key]);

  const refetch = useCallback(() => {
    return fetchData(false);
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch,
    invalidate
  };
};

// Hook for image lazy loading
export const useLazyImage = (src: string, placeholder?: string) => {
  const [imageSrc, setImageSrc] = useState(placeholder || '');
  const [imageRef, setImageRef] = useState<HTMLImageElement | null>(null);
  const { isIntersecting } = useIntersectionObserver();

  useEffect(() => {
    if (isIntersecting && imageRef && src) {
      const img = new Image();
      img.onload = () => {
        setImageSrc(src);
      };
      img.src = src;
    }
  }, [isIntersecting, imageRef, src]);

  return {
    imageSrc,
    setImageRef
  };
};

// Hook for bundle splitting and code splitting
export const useDynamicImport = <T>(importFunc: () => Promise<{ default: T }>) => {
  const [component, setComponent] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadComponent = useCallback(async () => {
    if (component) return component;

    setLoading(true);
    try {
      const module = await importFunc();
      setComponent(module.default);
      return module.default;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [importFunc, component]);

  return {
    component,
    loading,
    error,
    loadComponent
  };
};

// React imports
// import React from 'react';