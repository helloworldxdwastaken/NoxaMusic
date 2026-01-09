import { useRef, useCallback } from 'react';

export interface SwipeConfig {
  threshold?: number; // Minimum distance to trigger swipe (default: 50px)
  velocityThreshold?: number; // Minimum velocity to trigger swipe (default: 0.3)
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

interface TouchState {
  startX: number;
  startY: number;
  startTime: number;
}

/**
 * Custom hook for detecting swipe gestures
 * Returns handlers to attach to touchable elements
 */
export function useSwipeGesture(config: SwipeConfig = {}) {
  const {
    threshold = 50,
    velocityThreshold = 0.3,
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
  } = config;

  const touchStateRef = useRef<TouchState | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
    };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStateRef.current) return;

    const touch = e.changedTouches[0];
    const { startX, startY, startTime } = touchStateRef.current;
    
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    const deltaTime = Date.now() - startTime;
    
    // Calculate velocity (px/ms)
    const velocityX = Math.abs(deltaX) / deltaTime;
    const velocityY = Math.abs(deltaY) / deltaTime;
    
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Determine if swipe was horizontal or vertical
    const isHorizontal = absX > absY;
    
    if (isHorizontal && absX >= threshold && velocityX >= velocityThreshold) {
      // Horizontal swipe
      if (deltaX > 0 && onSwipeRight) {
        onSwipeRight();
      } else if (deltaX < 0 && onSwipeLeft) {
        onSwipeLeft();
      }
    } else if (!isHorizontal && absY >= threshold && velocityY >= velocityThreshold) {
      // Vertical swipe
      if (deltaY > 0 && onSwipeDown) {
        onSwipeDown();
      } else if (deltaY < 0 && onSwipeUp) {
        onSwipeUp();
      }
    }

    touchStateRef.current = null;
  }, [threshold, velocityThreshold, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown]);

  const handleTouchCancel = useCallback(() => {
    touchStateRef.current = null;
  }, []);

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchCancel,
  };
}

/**
 * Hook for swipe-to-delete functionality on list items
 */
export function useSwipeToDelete(onDelete: () => void, threshold = 100) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const touchStateRef = useRef<{ startX: number; currentX: number } | null>(null);
  const isSwipingRef = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStateRef.current = {
      startX: touch.clientX,
      currentX: touch.clientX,
    };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStateRef.current || !elementRef.current) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStateRef.current.startX;
    
    // Only allow swiping left
    if (deltaX < 0) {
      isSwipingRef.current = true;
      touchStateRef.current.currentX = touch.clientX;
      
      // Apply transform
      const translateX = Math.max(deltaX, -threshold - 50);
      elementRef.current.style.transform = `translateX(${translateX}px)`;
      elementRef.current.style.transition = 'none';
    }
  }, [threshold]);

  const handleTouchEnd = useCallback(() => {
    if (!touchStateRef.current || !elementRef.current) return;

    const deltaX = touchStateRef.current.currentX - touchStateRef.current.startX;
    
    if (Math.abs(deltaX) >= threshold) {
      // Delete threshold reached
      elementRef.current.style.transform = 'translateX(-100%)';
      elementRef.current.style.transition = 'transform 0.2s ease';
      elementRef.current.style.opacity = '0';
      
      setTimeout(() => {
        onDelete();
      }, 200);
    } else {
      // Reset position
      elementRef.current.style.transform = 'translateX(0)';
      elementRef.current.style.transition = 'transform 0.2s ease';
    }

    touchStateRef.current = null;
    isSwipingRef.current = false;
  }, [threshold, onDelete]);

  const handleTouchCancel = useCallback(() => {
    if (elementRef.current) {
      elementRef.current.style.transform = 'translateX(0)';
      elementRef.current.style.transition = 'transform 0.2s ease';
    }
    touchStateRef.current = null;
    isSwipingRef.current = false;
  }, []);

  return {
    ref: elementRef,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchCancel,
    },
  };
}

export default useSwipeGesture;






