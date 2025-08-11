/**
 * Consolidated Type Definitions for Rebel X
 * Single-client KPI Dashboard Platform
 */

import { ReactNode } from 'react';

// ============================================================================
// CORE DATABASE TYPES (Google Sheets + Firebase Integration)
// ============================================================================

export interface GoogleSheetTab {
  sheetId: number;
  sheetTitle: string;
  columns: {
    index: number;
    name: string;
  }[];
  hasData: boolean;
}

export interface DatabaseEntry {
  id: string;
  tabName: string;
  collectionName: string;
  keyColumn: string;
  selectedColumns: string[];
  createdAt: Date;
  lastSyncAt?: Date;
  syncStatus?: 'pending' | 'completed' | 'completed_with_errors' | 'failed';
  recordCount?: number;
  lastSyncErrors?: string[];
}

export interface ClientSheetTab {
  id: string;
  clientId: string;
  connectionId: string;
  sheetName: string;
  collectionName: string;
  keyColumn: string;
  selectedColumns?: string[];
  isActive: boolean;
  createdAt: any; // Firebase Timestamp
  lastSyncAt?: any; // Firebase Timestamp
  createdBy: string;
  recordCount?: number;
  syncStatus?: 'pending' | 'completed' | 'completed_with_errors' | 'failed';
  lastSyncErrors?: string[];
}

// ============================================================================
// ANALYTICS & KPI TYPES
// ============================================================================

export interface KPIMetrics {
  totalRevenue: number;
  totalPaid: number;
  totalDiscounts: number;
  totalOutstandingDue: number;
  uniqueArtists: number;
  paymentSuccessRate: number;
  averageOrderValue: number;
  cancellationRate: number;
  upsellSuccess: number;
  businessHealth: number;
}

export interface Distributions {
  revenueByLocation: Record<string, number>;
  paymentSums: Record<string, number>;
  statusCounts: Record<string, number>;
  channelCounts: Record<string, number>;
}

export interface FilterOptions {
  location: string[];
  bookedBy: string[];
  receptionist: string[];
  branchManager: string[];
  artist: string[];
  bookPlus: string[];
}

export interface TurnoverSeriesItem {
  date: string;
  value: number;
}

export interface AnalyticsData {
  kpis: KPIMetrics;
  distributions: Distributions;
  options: FilterOptions;
  turnoverSeries: TurnoverSeriesItem[];
}

export interface DashboardFilters {
  range: 'this_month' | 'last_month' | 'this_year' | 'last_6_months' | 'all';
  location: string;
  bookedBy: string;
  receptionist: string;
  branchManager: string;
  artist: string;
  bookPlus: string;
}

export interface SalesDataPoint {
  RebelX_Date: string;
  Total_Book: number;
}

export interface RevenueRingEntry {
  label: string;
  value: number;
  grad: [string, string];
}

export interface ChartSegment {
  label: string;
  value: number;
  percentage: number;
  color: {
    main: string;
    light: string;
    shadow: string;
    gradient?: string;
    glow?: string;
  };
  pathData?: string;
  angle?: number;
}

// ============================================================================
// COMPONENT PROPS TYPES
// ============================================================================

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

// ============================================================================
// HOMEPAGE & UI TYPES
// ============================================================================

export interface TopPerformer {
  name: string;
  score: number;
  department: string;
  avatar: string;
}

export interface ActivityItem {
  action: string;
  time: string;
  type: 'success' | 'warning' | 'info';
}

export interface AlertItem {
  message: string;
  type: 'warning' | 'success';
  urgent: boolean;
}

export interface CompanyHealthData {
  score: number;
  status: 'excellent' | 'good' | 'fair' | 'poor';
  trend: 'up' | 'down';
}

export interface KPIOverviewData {
  revenue: { value: string; change: string; trend: 'up' | 'down' };
  growth: { value: string; change: string; trend: 'up' | 'down' };
  targets: { achieved: number; total: number; percentage: number };
  users: { value: string; change: string; trend: 'up' | 'down' };
}

export interface HomepageData {
  companyHealth: CompanyHealthData;
  kpis: KPIOverviewData;
  topPerformers: TopPerformer[];
  recentActivity: ActivityItem[];
  alerts: AlertItem[];
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface SheetsApiResponse {
  success: boolean;
  spreadsheetName: string;
  sheets: GoogleSheetTab[];
}

export interface SyncResponse {
  success: boolean;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  errors?: string[];
}
