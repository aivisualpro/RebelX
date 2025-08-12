'use client';

import { usePathname } from 'next/navigation';
import Header from './Header';

export default function ConditionalHeader() {
  const pathname = usePathname();
  
  // Don't show header on auth page
  if (pathname === '/auth') {
    return null;
  }
  
  return <Header />;
}
