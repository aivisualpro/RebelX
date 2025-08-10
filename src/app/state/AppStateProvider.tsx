'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

type AppState = {
  region: 'saudi1' | 'egypt1';
  setRegion: (r: 'saudi1' | 'egypt1') => void;
  allowedRegions: Array<'saudi1' | 'egypt1'>;
};

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  // First get allowedRegions
  const [allowedRegions, setAllowed] = useState<Array<'saudi1' | 'egypt1'>>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem('allowedRegions');
      return raw ? (JSON.parse(raw) as Array<'saudi1' | 'egypt1'>) : [];
    } catch { return []; }
  });

  // Then initialize region based on allowedRegions
  const [region, setRegionState] = useState<'saudi1' | 'egypt1'>(() => {
    if (typeof window === 'undefined') return 'saudi1';
    try {
      const savedRegion = localStorage.getItem('region') as 'saudi1' | 'egypt1';
      // If saved region exists and is allowed, use it
      if (savedRegion && allowedRegions.includes(savedRegion)) {
        return savedRegion;
      }
      // Otherwise use first allowed region or saudi1 as fallback
      return allowedRegions[0] || 'saudi1';
    } catch {
      return allowedRegions[0] || 'saudi1';
    }
  });

  // Persist region changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('region', region);
    } catch {}
  }, [region]);

  // If current region becomes invalid, switch to first allowed region
  useEffect(() => {
    if (allowedRegions.length > 0 && !allowedRegions.includes(region)) {
      setRegionState(allowedRegions[0]);
    }
  }, [allowedRegions, region]);
  const setRegion = (r: 'saudi1' | 'egypt1') => setRegionState(r);
  const value = useMemo(() => ({ region, setRegion, allowedRegions }), [region, allowedRegions]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppStateProvider missing');
  return v;
}


