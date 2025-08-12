'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Database, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useAppState } from '@/app/state/AppStateProvider';
import DatabaseManager from './components/DatabaseManager';

function ConnectionsContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string>('default');

  const [hasAccess, setHasAccess] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  
  // Modal states
  const [showManageDatabases, setShowManageDatabases] = useState(true);

  // Check access control - only allow adeel@grassrootsharvest.com
  useEffect(() => {
    const checkAccess = () => {
      try {
        const userEmail = localStorage.getItem('userEmail');
        const isAdmin = userEmail === 'adeel@grassrootsharvest.com';
        setHasAccess(isAdmin);
        setAccessChecked(true);
      } catch (error) {
        console.error('Error checking access:', error);
        setHasAccess(false);
        setAccessChecked(true);
      }
    };

    checkAccess();
  }, []);

  useEffect(() => {
    const urlCompanyId = searchParams.get('companyId');
    if (urlCompanyId) {
      setCompanyId(urlCompanyId);
    }
    setLoading(false);
  }, [searchParams]);

  // Show loading while checking access
  if (!accessChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-300">Checking access...</div>
        </div>
      </div>
    );
  }

  // Show access denied if user is not authorized
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center text-white">
        <div className="text-center max-w-md">
          <div className="mx-auto w-24 h-24 bg-red-900/30 border border-red-700/40 rounded-full flex items-center justify-center mb-6">
            <svg 
              className="w-12 h-12 text-red-400" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Access Restricted</h1>
          <p className="text-gray-300 mb-6">
            This page is only accessible to authorized administrators.
          </p>
          <Link 
            href="/dashboard" 
            className="inline-flex items-center px-4 py-2 text-blue-400 hover:text-blue-300 transition-colors"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-300">Loading connections...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-white mb-2">Databases</h1>
          </div>
          
        </div>

        {/* Database Manager */}
        {showManageDatabases && (
          <DatabaseManager />
        )}
      </div>
    </div>
  );
}

export default function ConnectionsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-300">Loading sheet tabs...</div>
        </div>
      </div>
    }>
      <ConnectionsContent />
    </Suspense>
  );
}
