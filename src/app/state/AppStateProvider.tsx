'use client';

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';

type AppState = {
  region: 'saudi1' | 'egypt1';
  setRegion: (r: 'saudi1' | 'egypt1') => void;
  allowedRegions: Array<'saudi1' | 'egypt1'>;
  isLoading: boolean;
  refreshFromStorage: () => void;
};

const Ctx = createContext<AppState | null>(null);

// Helper function to get initial values from localStorage
const getStorageValues = () => {
  if (typeof window === 'undefined') {
    return { allowedRegions: [], region: 'saudi1' as const };
  }
  
  try {
    const allowedRegionsRaw = localStorage.getItem('allowedRegions');
    const allowedRegions = allowedRegionsRaw ? (JSON.parse(allowedRegionsRaw) as Array<'saudi1' | 'egypt1'>) : [];
    const savedRegion = localStorage.getItem('region') as 'saudi1' | 'egypt1';
    
    // Determine the correct region
    let region: 'saudi1' | 'egypt1';
    if (savedRegion && allowedRegions.includes(savedRegion)) {
      region = savedRegion;
    } else {
      region = allowedRegions[0] || 'saudi1';
    }
    
    return { allowedRegions, region };
  } catch {
    return { allowedRegions: [], region: 'saudi1' as const };
  }
};

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [allowedRegions, setAllowedRegions] = useState<Array<'saudi1' | 'egypt1'>>([]);
  const [region, setRegionState] = useState<'saudi1' | 'egypt1'>('saudi1');

  // Function to refresh state from localStorage
  const refreshFromStorage = useCallback(() => {
    const { allowedRegions: newAllowedRegions, region: newRegion } = getStorageValues();
    setAllowedRegions(newAllowedRegions);
    setRegionState(newRegion);
    setIsLoading(false);
  }, []);

  // Initialize state from localStorage on mount
  useEffect(() => {
    refreshFromStorage();
  }, [refreshFromStorage]);

  // Listen for localStorage changes and page visibility changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'allowedRegions' || e.key === 'region') {
        refreshFromStorage();
      }
    };

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

    // Listen for storage events from other tabs
    window.addEventListener('storage', handleStorageChange);
    // Listen for page visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);
    // Listen for window focus events
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [refreshFromStorage]);

  // Persist region changes to localStorage
  useEffect(() => {
    if (!isLoading) {
      try {
        localStorage.setItem('region', region);
      } catch {}
    }
  }, [region, isLoading]);

  // If current region becomes invalid, switch to first allowed region
  useEffect(() => {
    if (!isLoading && allowedRegions.length > 0 && !allowedRegions.includes(region)) {
      setRegionState(allowedRegions[0]);
    }
  }, [allowedRegions, region, isLoading]);

  // Enhanced setRegion function that immediately updates localStorage
  const setRegion = useCallback((r: 'saudi1' | 'egypt1') => {
    setRegionState(r);
    try {
      localStorage.setItem('region', r);
    } catch {}
  }, []);

  const value = useMemo(() => ({ 
    region, 
    setRegion, 
    allowedRegions, 
    isLoading,
    refreshFromStorage 
  }), [region, allowedRegions, isLoading, setRegion, refreshFromStorage]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppStateProvider missing');
  return v;
}


