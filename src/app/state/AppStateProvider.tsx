'use client';

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';

type AppState = {
  isLoading: boolean;
  refreshFromStorage: () => void;
};

const Ctx = createContext<AppState | null>(null);

// Helper function to get initial values from localStorage
const getStorageValues = () => ({}) as const;

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  // Region concept removed per requirement

  // Function to refresh state from localStorage
  const refreshFromStorage = useCallback(() => {
    getStorageValues();
    setIsLoading(false);
  }, []);

  // Initialize state from localStorage on mount
  useEffect(() => {
    refreshFromStorage();
  }, [refreshFromStorage]);

  // Listen for page visibility/focus only (region removed)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Page became visible, refresh from storage
        refreshFromStorage();
      }
    };

    const handleFocus = () => {
      // Window gained focus, refresh from storage
      refreshFromStorage();
    };

    // Listen for page visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);
    // Listen for window focus events
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [refreshFromStorage]);

  const value = useMemo(() => ({ isLoading, refreshFromStorage }), [isLoading, refreshFromStorage]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppStateProvider missing');
  return v;
}


