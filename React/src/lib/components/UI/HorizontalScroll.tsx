import React, { useRef, useState, useEffect, useCallback } from 'react';
import './HorizontalScroll.css';

interface HorizontalScrollProps {
  children: React.ReactNode;
  className?: string;
}

export const HorizontalScroll: React.FC<HorizontalScrollProps> = ({ children, className = '' }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [totalDots, setTotalDots] = useState(0);
  const [isHovering, setIsHovering] = useState(false);

  // Handle mouse wheel scrolling horizontally when hovering
  const handleWheel = useCallback((e: WheelEvent) => {
    const container = scrollRef.current;
    if (!container || !isHovering) return;
    
    // Only intercept if there's horizontal overflow
    if (container.scrollWidth <= container.clientWidth) return;
    
    // Prevent vertical page scroll
    e.preventDefault();
    
    // Scroll horizontally (use deltaY for vertical wheel, multiply for speed)
    container.scrollLeft += e.deltaY * 2;
  }, [isHovering]);

  // Add wheel event listener
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    
    // Need to use native event listener for preventDefault to work
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const calculateDots = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    const scrollWidth = container.scrollWidth;
    const clientWidth = container.clientWidth;
    
    // Calculate number of "pages" based on visible width
    const pages = Math.max(1, Math.ceil(scrollWidth / clientWidth));
    setTotalDots(pages);
  }, []);

  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container || totalDots <= 1) return;

    const scrollLeft = container.scrollLeft;
    const scrollWidth = container.scrollWidth - container.clientWidth;
    
    // Calculate which dot should be active
    const progress = scrollLeft / scrollWidth;
    const index = Math.round(progress * (totalDots - 1));
    setActiveIndex(Math.min(index, totalDots - 1));
  }, [totalDots]);

  const scrollToIndex = (index: number) => {
    const container = scrollRef.current;
    if (!container || totalDots <= 1) return;

    const scrollWidth = container.scrollWidth - container.clientWidth;
    const targetScroll = (index / (totalDots - 1)) * scrollWidth;
    
    container.scrollTo({
      left: targetScroll,
      behavior: 'smooth',
    });
  };

  useEffect(() => {
    calculateDots();
    
    const handleResize = () => {
      calculateDots();
      handleScroll();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculateDots, handleScroll]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    // Recalculate when children change
    const observer = new MutationObserver(calculateDots);
    observer.observe(container, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [calculateDots]);

  return (
    <div 
      className={`horizontal-scroll-wrapper ${className}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div
        ref={scrollRef}
        className="horizontal-scroll-container hide-scrollbar"
        onScroll={handleScroll}
      >
        {children}
      </div>
      
      {totalDots > 1 && (
        <div className="scroll-indicators">
          {Array.from({ length: totalDots }).map((_, index) => (
            <button
              key={index}
              className={`scroll-dot ${index === activeIndex ? 'active' : ''}`}
              onClick={() => scrollToIndex(index)}
              aria-label={`Go to section ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default HorizontalScroll;


