/**
 * Date utility functions for Booking Plus
 */

import { DashboardFilters } from '@/types/analytics';

export const pad = (n: number): string => (n < 10 ? '0' + n : String(n));

export const formatDate = (d: Date): string => {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const formatDateTime = (d: Date): string => {
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export const getDateRange = (days: number): { startDate: Date; endDate: Date } => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);
  
  return { startDate, endDate };
};

export const isDateInRange = (date: Date, startDate: Date, endDate: Date): boolean => {
  return date >= startDate && date <= endDate;
};

export const readCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  
  return null;
};

export const getFilterSummary = (filters: DashboardFilters): string => {
  const parts: string[] = [];
  const now = new Date();
  
  if (filters.range !== 'all') {
    let startDate: Date, endDate: Date;
    
    switch (filters.range) {
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'last_6_months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'last_month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      default: // this_year
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
        break;
    }
    
    const formatDateForDisplay = (d: Date): string => 
      `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
    
    parts.push(`${formatDateForDisplay(startDate)} → ${formatDateForDisplay(endDate)}`);
  }
  
  if (filters.location) parts.push(`Location: ${filters.location}`);
  if (filters.bookedBy) parts.push(`Booked By: ${filters.bookedBy}`);
  if (filters.receptionist) parts.push(`Receptionist: ${filters.receptionist}`);
  if (filters.branchManager) parts.push(`Manager: ${filters.branchManager}`);
  if (filters.artist) parts.push(`Artist: ${filters.artist}`);
  if (filters.bookPlus) parts.push(`Book Plus: ${filters.bookPlus}`);
  
  return parts.join(' • ') || 'All time';
};
