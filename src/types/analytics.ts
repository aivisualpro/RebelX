/**
 * Analytics and Dashboard Type Definitions for Booking Plus
 */

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
  Booking_Date: string;
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
