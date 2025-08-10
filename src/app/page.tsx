'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Immediate redirect to auth page
    router.replace('/auth');
  }, [router]);

  return null; // No need to show anything, just redirect
}
