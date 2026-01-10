import React, { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

type MiniPlayerContextValue = {
  isVisible: boolean;
  show: () => void;
  hide: () => void;
};

const MiniPlayerContext = createContext<MiniPlayerContextValue | undefined>(undefined);

export const MiniPlayerVisibilityProvider = ({ children }: { children: ReactNode }) => {
  const [isVisible, setIsVisible] = useState(true);

  const show = useCallback(() => setIsVisible(true), []);
  const hide = useCallback(() => setIsVisible(false), []);

  return (
    <MiniPlayerContext.Provider value={{ isVisible, show, hide }}>
      {children}
    </MiniPlayerContext.Provider>
  );
};

export const useMiniPlayerVisibility = () => {
  const context = useContext(MiniPlayerContext);
  if (!context) {
    throw new Error('useMiniPlayerVisibility must be used within MiniPlayerVisibilityProvider');
  }
  return context;
};
