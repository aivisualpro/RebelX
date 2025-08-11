'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useAppState } from '@/app/state/AppStateProvider';

import { LanguageProvider, useLanguage } from '@/contexts/LanguageContext';
import { Menu, X, Filter } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnalyticsData, DashboardFilters } from '@/types/analytics';
import { getDateRangeForFilter } from '@/utils/dateUtils';

interface User {
  id: string;
  name: string;
  role: string;
  email?: string;
}

function ReceptionistsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setLanguage } = useLanguage();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userName, setUserName] = useState<string>('');
  const [users, setUsers] = useState<User[]>([]);
  
  // Refs for click outside detection
  const menuRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);


  const { region, setRegion, allowedRegions, isLoading: appStateLoading } = useAppState();

  // Filter state for the filter bar
  const [filters, setFilters] = useState<DashboardFilters>({ 
    range: 'last_6_months', 
    location: '', 
    bookedBy: '', 
    receptionist: '', 
    branchManager: '', 
    artist: '', 
    bookPlus: '' 
  });

  // Analytics data for filter options
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  // Click outside detection
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
        setIsFiltersOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen, isFiltersOpen]);

  // Fetch analytics data for filter options
  useEffect(() => {
    const companyId = searchParams.get('companyId') || 'booking-plus';
    
    const fetchAnalytics = async () => {
      try {
        const params = new URLSearchParams({ 
          clientId: companyId, 
          connectionId: region, 
          sheetTabId: 'booking_x' 
        });
        
        const response = await fetch(`/api/analytics?${params.toString()}`);
        const data = await response.json();
        setAnalytics(data);
      } catch (error) {
        console.error('Error fetching analytics data:', error);
      }
    };

    fetchAnalytics();
  }, [region, searchParams]);



  // Load user data and check admin status
  useEffect(() => {
    const userEmail = localStorage.getItem('userEmail');
    if (userEmail) {
      setIsAdmin(userEmail === 'admin@aivisualpro.com');
      
      // Fetch user name
      fetch(`/api/user-name?email=${encodeURIComponent(userEmail)}&region=${region}`)
        .then(res => res.json())
        .then(data => setUserName(data.name || userEmail.split('@')[0]))
        .catch(() => setUserName(userEmail.split('@')[0]));
    }
  }, [region]);

  // Load receptionists data
  useEffect(() => {
    const loadReceptionists = async () => {
      try {
        const companyId = searchParams.get('companyId') || 'booking-plus';
        
        // Build params with filters
        const params = new URLSearchParams({ 
          clientId: companyId, 
          connectionId: region 
        });
        
        // Apply filters to the API call
        if (filters.range !== 'all') {
          // Compute date range using utility function
          const { startDate, endDate } = getDateRangeForFilter(filters.range);
          if (startDate && endDate) { 
            params.set('startDate', startDate); 
            params.set('endDate', endDate); 
          }
        }
        if (filters.location) params.set('location', filters.location);
        if (filters.bookedBy) params.set('bookedBy', filters.bookedBy);
        if (filters.receptionist) params.set('receptionist', filters.receptionist);
        if (filters.branchManager) params.set('branchManager', filters.branchManager);
        if (filters.artist) params.set('artist', filters.artist);
        if (filters.bookPlus) params.set('bookPlus', filters.bookPlus);
        
        // Fetch users from the user_manager sheet with filters
        const response = await fetch(`/api/reports/users?${params.toString()}`);
        const data = await response.json();
        
        if (data.users) {
          const receptionists = data.users.filter((user: User) => 
            user.role?.toLowerCase().includes('receptionist')
          );
          setUsers(receptionists);
        }
      } catch (error) {
        console.error('Error loading receptionists data:', error);
      }
    };

    if (!appStateLoading && searchParams.get('companyId')) {
      loadReceptionists();
    }
  }, [searchParams, region, appStateLoading, filters]);

  // Handle language change
  const handleLanguageChange = (newLanguage: 'English' | 'Arabic' | 'Egyptian') => {
    setLanguage(newLanguage);
    setIsMenuOpen(false);
  };

  // Handle region change
  const handleRegionChange = (newRegion: 'saudi1' | 'egypt1') => {
    setRegion(newRegion);
    setIsMenuOpen(false);
  };

  // Handle filter change
  const handleFilterChange = (key: keyof DashboardFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // Reset filters to default
  const resetFilters = () => {
    setFilters({ 
      range: 'last_6_months', 
      location: '', 
      bookedBy: '', 
      receptionist: '', 
      branchManager: '', 
      artist: '', 
      bookPlus: '' 
    });
  };

  if (appStateLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading receptionists...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-xl font-bold text-slate-900">
              Booking Plus
            </Link>
            <span className="text-slate-500">|</span>
            <span className="text-slate-700 font-medium">Receptionists</span>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Region Toggle */}
            <div className="flex items-center bg-white rounded-lg border border-slate-300 overflow-hidden">
              <button
                onClick={() => handleRegionChange('saudi1')}
                className={`px-3 py-1 text-sm font-medium transition-colors ${
                  region === 'saudi1' 
                    ? 'bg-blue-600 text-white' 
                    : allowedRegions.includes('saudi1') 
                      ? 'text-slate-700 hover:bg-slate-50' 
                      : 'text-slate-400 cursor-not-allowed'
                }`}
                disabled={!allowedRegions.includes('saudi1')}
              >
                Saudi
              </button>
              <button
                onClick={() => handleRegionChange('egypt1')}
                className={`px-3 py-1 text-sm font-medium transition-colors ${
                  region === 'egypt1' 
                    ? 'bg-blue-600 text-white' 
                    : allowedRegions.includes('egypt1') 
                      ? 'text-slate-700 hover:bg-slate-50' 
                      : 'text-slate-400 cursor-not-allowed'
                }`}
                disabled={!allowedRegions.includes('egypt1')}
              >
                Egypt
              </button>
            </div>
            
            {/* Filter Button */}
            <button
              ref={filterButtonRef}
              onClick={() => setIsFiltersOpen(!isFiltersOpen)}
              className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors"
            >
              <Filter className="w-4 h-4" />
              Filters
            </button>
            
            {/* Menu Button */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 rounded-lg hover:bg-white transition-colors"
              >
                {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
              
              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-sm text-slate-500">Signed in as</p>
                    <p className="font-medium text-slate-900">{userName}</p>
                  </div>
                  
                  <button 
                    onClick={() => handleLanguageChange('English')}
                    className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    English
                  </button>
                  <button 
                    onClick={() => handleLanguageChange('Arabic')}
                    className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    Arabic
                  </button>
                  <button 
                    onClick={() => handleLanguageChange('Egyptian')}
                    className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    Egyptian
                  </button>
                  
                  <div className="border-t border-slate-100 mt-2 pt-2">
                    <Link 
                      href="/dashboard" 
                      className="block px-4 py-2 text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      Dashboard
                    </Link>
                    <Link 
                      href="/reports" 
                      className="block px-4 py-2 text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      Reports
                    </Link>
                    {isAdmin && (
                      <Link 
                        href="/connections" 
                        className="block px-4 py-2 text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        Connections
                      </Link>
                    )}
                    <button 
                      onClick={() => {
                        localStorage.removeItem('userEmail');
                        router.push('/auth');
                      }}
                      className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Filter Popup */}
      {isFiltersOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-40 pt-24" ref={filtersRef}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Filter Options</h3>
              
              <div className="space-y-4">
                {/* Date Range Filter */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Date Range</label>
                  <select
                    value={filters.range}
                    onChange={(e) => handleFilterChange('range', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="last_6_months">Last 6 Months</option>
                    <option value="last_3_months">Last 3 Months</option>
                    <option value="last_30_days">Last 30 Days</option>
                    <option value="last_7_days">Last 7 Days</option>
                    <option value="last_24_hours">Last 24 Hours</option>
                  </select>
                </div>
                
                {/* Location Filter */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Location</label>
                  <select
                    value={filters.location}
                    onChange={(e) => handleFilterChange('location', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Locations</option>
                    {analytics?.options?.location?.map((location: string) => (
                      <option key={location} value={location}>{location}</option>
                    ))}
                  </select>
                </div>
                
                {/* Booked By Filter */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Booked By</label>
                  <select
                    value={filters.bookedBy}
                    onChange={(e) => handleFilterChange('bookedBy', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Booked By</option>
                    {analytics?.options?.bookedBy?.map((bookedBy: string) => (
                      <option key={bookedBy} value={bookedBy}>{bookedBy}</option>
                    ))}
                  </select>
                </div>
                
                {/* Receptionist Filter */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Receptionist</label>
                  <select
                    value={filters.receptionist}
                    onChange={(e) => handleFilterChange('receptionist', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Receptionists</option>
                    {analytics?.options?.receptionist?.map((receptionist: string) => (
                      <option key={receptionist} value={receptionist}>{receptionist}</option>
                    ))}
                  </select>
                </div>
                
                {/* Branch Manager Filter */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Branch Manager</label>
                  <select
                    value={filters.branchManager}
                    onChange={(e) => handleFilterChange('branchManager', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Branch Managers</option>
                    {analytics?.options?.branchManager?.map((branchManager: string) => (
                      <option key={branchManager} value={branchManager}>{branchManager}</option>
                    ))}
                  </select>
                </div>
                
                {/* Artist Filter */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Artist</label>
                  <select
                    value={filters.artist}
                    onChange={(e) => handleFilterChange('artist', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Artists</option>
                    {analytics?.options?.artist?.map((artist: string) => (
                      <option key={artist} value={artist}>{artist}</option>
                    ))}
                  </select>
                </div>
                
                {/* Book+ Filter */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Book+</label>
                  <select
                    value={filters.bookPlus}
                    onChange={(e) => handleFilterChange('bookPlus', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Book+</option>
                    {analytics?.options?.bookPlus?.map((bookPlus: string) => (
                      <option key={bookPlus} value={bookPlus}>{bookPlus}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="flex justify-between gap-3 mt-6">
                <button 
                  onClick={resetFilters}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Reset
                </button>
                <button 
                  onClick={() => setIsFiltersOpen(false)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Receptionists</h1>
          <p className="text-slate-600">Detailed view of all receptionists</p>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Role
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {users.length > 0 ? (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                        {user.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {user.email || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {user.role}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-center text-sm text-slate-500">
                      No receptionists found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReceptionistsPage() {
  return (
    <LanguageProvider>
      <Suspense fallback={
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
          <div className="text-lg text-gray-600">Loading receptionists...</div>
        </div>
      }>
        <ReceptionistsContent />
      </Suspense>
    </LanguageProvider>
  );
}
