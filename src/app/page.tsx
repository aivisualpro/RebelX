'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check if user is already authenticated
    const checkAuth = () => {
      try {
        const companyId = localStorage.getItem('companyId');
        const allowedRegions = localStorage.getItem('allowedRegions');
        const userEmail = localStorage.getItem('userEmail');
        
        if (companyId && allowedRegions && userEmail) {
          // User is authenticated, redirect to homepage
          router.replace('/home');
        } else {
          // User is not authenticated, redirect to auth page
          router.replace('/auth');
        }
      } catch (error) {
        // If localStorage is not available or any error occurs, go to auth
        router.replace('/auth');
      } finally {
        setIsChecking(false);
      }
    };

    checkAuth();
  }, [router]);

  // Show a simple loading state while checking authentication
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  return null; // No need to show anything after redirect
}
