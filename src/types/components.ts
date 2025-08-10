/**
 * Component Props Type Definitions for Booking Plus
 */

import { ReactNode } from 'react';
import { RevenueRingEntry, SalesDataPoint } from './analytics';

export interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  className?: string;
  icon?: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

export interface RevenueRingsProps {
  entries: RevenueRingEntry[];
  total: number;
}

export interface SalesAnalyticsChartProps {
  data: SalesDataPoint[];
  className?: string;
}

export interface LanguageContextType {
  language: string;
  setLanguage: (language: string) => void;
  t: (key: string) => string;
}

export interface AppStateContextType {
  region: 'saudi1' | 'egypt1';
  setRegion: (region: 'saudi1' | 'egypt1') => void;
  allowedRegions: Array<'saudi1' | 'egypt1'>;
  isLoading: boolean;
  refreshFromStorage: () => void;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  message?: string;
}
