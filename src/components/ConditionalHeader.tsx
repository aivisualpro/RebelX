'use client';

import { usePathname } from 'next/navigation';
import Header from './Header';

export default function ConditionalHeader() {
  const pathname = usePathname();
  
  // Don't show header on auth page or dashboard-like pages served by the grouped layout
  const hideExact = ['/', '/auth', '/sales-analytics', '/inventory-analytics', '/crm'];
  if (
    hideExact.includes(pathname || '') ||
    pathname?.startsWith('/databases')
  ) {
    return null;
  }
  
  return <Header />;
}
