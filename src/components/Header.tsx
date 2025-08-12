'use client';

import { useRouter, usePathname } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  Crown,
  Home,
  BarChart3,
  FileText,
  Lightbulb,
  Settings,
  Bell,
  User,
  LogOut,
  ChevronDown,
  UserCircle
} from 'lucide-react';

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Get user email from localStorage
    const email = localStorage.getItem('userEmail');
    if (email) {
      setUserEmail(email);
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogoClick = () => {
    router.push('/home');
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      
      // Sign out from Firebase
      await signOut(auth);
      
      // Clear localStorage
      localStorage.removeItem('allowedRegions');
      localStorage.removeItem('region');
      localStorage.removeItem('companyId');
      localStorage.removeItem('userEmail');
      
      // Redirect to auth page
      router.replace('/auth');
    } catch (error) {
      console.error('Logout error:', error);
      setIsLoggingOut(false);
    }
  };

  const isActiveLink = (href: string) => {
    return pathname === href;
  };

  return (
    <nav className="bg-black/80 backdrop-blur-xl border-b border-gray-700/50 sticky top-0 z-50 shadow-xl shadow-black/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <button
              onClick={handleLogoClick}
              className="flex items-center space-x-3 hover:scale-105 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:ring-offset-2 focus:ring-offset-black rounded-lg p-2 group"
            >
              <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-yellow-500/25 transition-all duration-300">
                <Crown className="w-6 h-6 text-white drop-shadow-sm" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-yellow-400 via-orange-300 to-yellow-200 bg-clip-text text-transparent drop-shadow-sm">
                  REBEL X
                </h1>
              </div>
            </button>
          </div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-1">
            <Link 
              href="/home" 
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-300 ${
                isActiveLink('/home') 
                  ? 'text-yellow-400 bg-yellow-500/20' 
                  : 'text-gray-300 hover:text-white hover:bg-gray-700/50'
              }`}
            >
              <Home className="w-4 h-4" />
              <span className="font-medium">Home</span>
            </Link>
            <Link 
              href="/kpis" 
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-300 ${
                isActiveLink('/kpis') 
                  ? 'text-yellow-400 bg-yellow-500/20' 
                  : 'text-gray-300 hover:text-white hover:bg-gray-700/50'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span className="font-medium">KPIs</span>
            </Link>
            <Link 
              href="/reports" 
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-300 ${
                isActiveLink('/reports') 
                  ? 'text-yellow-400 bg-yellow-500/20' 
                  : 'text-gray-300 hover:text-white hover:bg-gray-700/50'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span className="font-medium">Reports</span>
            </Link>
            <Link 
              href="/insights" 
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-300 ${
                isActiveLink('/insights') 
                  ? 'text-yellow-400 bg-yellow-500/20' 
                  : 'text-gray-300 hover:text-white hover:bg-gray-700/50'
              }`}
            >
              <Lightbulb className="w-4 h-4" />
              <span className="font-medium">Insights</span>
            </Link>
            <Link 
              href="/databases" 
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-300 ${
                isActiveLink('/databases') 
                  ? 'text-yellow-400 bg-yellow-500/20' 
                  : 'text-gray-300 hover:text-white hover:bg-gray-700/50'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span className="font-medium">Databases</span>
            </Link>
          </div>

          {/* User Profile & Actions */}
          <div className="flex items-center space-x-4">
            {/* Notification Bell */}
            <button className="relative p-3 text-gray-300 hover:text-white hover:bg-gray-700/50 rounded-lg transition-all duration-300 group">
              <Bell className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-red-500 to-pink-500 rounded-full animate-pulse"></span>
            </button>
            
            {/* User Profile Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600/50 hover:border-gray-500/50 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 group"
              >
                <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 rounded-lg flex items-center justify-center transition-all duration-300">
                  <UserCircle className="w-5 h-5 text-white" />
                </div>
                <span className="text-sm font-medium text-white hidden sm:block">
                  {userEmail ? userEmail.split('@')[0] : 'User'}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-gray-900/95 backdrop-blur-xl rounded-lg shadow-2xl border border-gray-700/50 py-2 z-50 animate-in slide-in-from-top-2 duration-200">
                  <div className="px-4 py-2 border-b border-gray-700/50">
                    <div className="text-sm font-medium text-white">
                      {userEmail ? userEmail.split('@')[0] : 'User'}
                    </div>
                    <div className="text-xs text-gray-400 truncate">
                      {userEmail || 'user@example.com'}
                    </div>
                  </div>
                  
                  <button
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="w-full flex items-center px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-red-500/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    {isLoggingOut ? (
                      <>
                        <svg className="animate-spin w-4 h-4 mr-3 text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Logging out...</span>
                      </>
                    ) : (
                      <>
                        <LogOut className="w-4 h-4 mr-3 text-red-400 group-hover:text-red-300" />
                        <span>Sign out</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
