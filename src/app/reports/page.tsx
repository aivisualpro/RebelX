'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useAppState } from '@/app/state/AppStateProvider';
import { companyService, CompanyData } from '@/lib/auth';
import { LanguageProvider, useLanguage } from '@/contexts/LanguageContext';
import { Menu, X, Filter, Users, UserCheck, Palette } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DashboardFilters } from '@/types/analytics';


interface User {
  id: string;
  name: string;
  role: string;
  email?: string;
}

interface RoleData {
  title: string;
  icon: React.ReactNode;
  users: User[];
  color: string;
}

function ReportsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language, setLanguage } = useLanguage();
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userName, setUserName] = useState<string>('');
  const [roleData, setRoleData] = useState<Record<string, RoleData>>({});
  
  // Refs for click outside detection
  const menuRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);

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

  // Load company data
  useEffect(() => {
    const companyId = searchParams.get('companyId');
    
    if (companyId) {
      companyService.getCompanyData(companyId)
        .then(data => {
          setCompanyData(data);
        })
        .catch(error => {
          console.error('Error loading company data:', error);
        });
    } else {
      router.push('/auth');
    }
  }, [searchParams, router]);

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

  // Load role-based user data
  useEffect(() => {
    const loadRoleData = async () => {
      try {
        const companyId = searchParams.get('companyId') || 'booking-plus';
        
        // Fetch users from the user_manager sheet
        const response = await fetch(`/api/reports/users?clientId=${companyId}&connectionId=${region}`);
        const data = await response.json();
        
        if (data.users) {
          const salesOfficers = data.users.filter((user: User) => 
            user.role?.toLowerCase().includes('sales officer') || 
            user.role?.toLowerCase().includes('sales')
          );
          
          const artists = data.users.filter((user: User) => 
            user.role?.toLowerCase().includes('artist')
          );
          
          const receptionists = data.users.filter((user: User) => 
            user.role?.toLowerCase().includes('receptionist') ||
            user.role?.toLowerCase().includes('reception')
          );

          setRoleData({
            salesOfficers: {
              title: 'Sales Officers',
              icon: <UserCheck className="w-6 h-6" />,
              users: salesOfficers,
              color: 'bg-blue-500'
            },
            artists: {
              title: 'Artists',
              icon: <Palette className="w-6 h-6" />,
              users: artists,
              color: 'bg-purple-500'
            },
            receptionists: {
              title: 'Receptionists',
              icon: <Users className="w-6 h-6" />,
              users: receptionists,
              color: 'bg-green-500'
            }
          });
        }
      } catch (error) {
        console.error('Error loading role data:', error);
      }
    };

    if (!appStateLoading && region) {
      loadRoleData();
    }
  }, [searchParams, region, appStateLoading]);

  if (appStateLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading reports...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/dashboard?companyId=${searchParams.get('companyId')}`} className="text-lg font-semibold text-slate-900 hover:underline">
              {companyData?.companyName || 'Booking Plus'}
            </Link>
            <span className="text-slate-500">•</span>
            <h1 className="text-lg font-medium text-slate-700">Reports</h1>
          </div>
          
          <div className="flex items-center gap-3 relative">
            {/* Region Toggle */}
            <div className="hidden sm:flex items-center border border-slate-200 rounded-lg overflow-hidden">
              <button 
                disabled={!allowedRegions.includes('saudi1')} 
                className={`px-3 py-1 text-sm border-r border-slate-200 ${region==='saudi1' ? 'bg-green-100 text-green-700' : 'bg-white text-slate-800 hover:bg-slate-50'} ${allowedRegions.includes('saudi1') ? '' : 'opacity-50 cursor-not-allowed'}`} 
                onClick={()=> setRegion('saudi1')}
              >
                Saudi
              </button>
              <button 
                disabled={!allowedRegions.includes('egypt1')} 
                className={`px-3 py-1 text-sm ${region==='egypt1' ? 'bg-green-100 text-green-700' : 'bg-white text-slate-800 hover:bg-slate-50'} ${allowedRegions.includes('egypt1') ? '' : 'opacity-50 cursor-not-allowed'}`} 
                onClick={()=> setRegion('egypt1')}
              >
                Egypt
              </button>
            </div>

            {/* Filters Button */}
            <button 
              onClick={() => setIsFiltersOpen(!isFiltersOpen)} 
              className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50" 
              aria-label="filters"
            >
              <Filter className="w-5 h-5" />
            </button>

            {/* Menu Button */}
            <div className="relative" ref={menuRef}>
              <button 
                onClick={()=>setIsMenuOpen(!isMenuOpen)} 
                className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50" 
                aria-label="menu"
              >
                {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
              
              {isMenuOpen && (
                <div className="absolute top-10 right-0 w-56 bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 py-2">
                  <Link href={`/dashboard?companyId=${searchParams.get('companyId')}`} className="block px-4 py-2 hover:bg-slate-50">Dashboard</Link>
                  {isAdmin && (
                    <Link href={`/connections?companyId=${searchParams.get('companyId')}`} className="block px-4 py-2 hover:bg-slate-50">Connections</Link>
                  )}
                  <Link href={`/reports?companyId=${searchParams.get('companyId')}`} className="block px-4 py-2 hover:bg-slate-50 bg-slate-100">Reports</Link>
                  
                  {/* Language Selection */}
                  <div className="group relative">
                    <button className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between">
                      <span>Language: {language === 'English' ? 'EN' : language === 'Arabic' ? 'AR' : 'EG'}</span>
                      <span>›</span>
                    </button>
                    <div className="hidden group-hover:block absolute top-0 right-full mr-1 w-48 bg-white border border-slate-200 rounded-xl shadow-xl py-2">
                      <button onClick={() => setLanguage('English')} className="block w-full text-left px-4 py-2 hover:bg-slate-50">English</button>
                      <button onClick={() => setLanguage('Arabic')} className="block w-full text-left px-4 py-2 hover:bg-slate-50">العربية</button>
                      <button onClick={() => setLanguage('Egyptian')} className="block w-full text-left px-4 py-2 hover:bg-slate-50">المصرية</button>
                    </div>
                  </div>

                  <button 
                    onClick={()=>{ 
                      document.cookie = 'companyId=; Max-Age=0; path=/'; 
                      localStorage.removeItem('region'); 
                      localStorage.removeItem('allowedRegions'); 
                      localStorage.removeItem('userEmail');
                      location.href='/auth'; 
                    }} 
                    className="block w-full text-left px-4 py-2 hover:bg-slate-50"
                  >
                    Logout ({userName})
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Filters Popup */}
      {isFiltersOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div ref={filtersRef} className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-slate-900">Filter Reports</h2>
                <button onClick={() => setIsFiltersOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Date Range</label>
                  <select 
                    value={filters.range} 
                    onChange={(e) => setFilters({...filters, range: e.target.value as DashboardFilters['range']})}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Time</option>
                    <option value="this_month">This Month</option>
                    <option value="last_month">Last Month</option>
                    <option value="last_6_months">Last 6 Months</option>
                    <option value="this_year">This Year</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Location</label>
                  <input 
                    type="text" 
                    value={filters.location}
                    onChange={(e) => setFilters({...filters, location: e.target.value})}
                    placeholder="Filter by location"
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <button 
                  onClick={() => setFilters({ range: 'last_6_months', location: '', bookedBy: '', receptionist: '', branchManager: '', artist: '', bookPlus: '' })}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Reset
                </button>
                <button 
                  onClick={() => setIsFiltersOpen(false)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Team Reports</h1>
          <p className="text-slate-600">Overview of team members by role</p>
        </div>

        {/* Role Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link 
            href={`/reports/sales-officers?companyId=${searchParams.get('companyId') || 'booking-plus'}`}
            className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 text-center hover:shadow-xl transition-shadow cursor-pointer"
          >
            <div className="flex flex-col items-center">
              <Users className="w-8 h-8 text-blue-600 mb-3" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Sales Officers</h3>
              <div className="text-3xl font-bold text-blue-600">{roleData.salesOfficers?.users.length || 0}</div>
              <p className="text-sm text-slate-500 mt-1">Team Members</p>
            </div>
          </Link>
          
          <Link 
            href={`/reports/artists?companyId=${searchParams.get('companyId') || 'booking-plus'}`}
            className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 text-center hover:shadow-xl transition-shadow cursor-pointer"
          >
            <div className="flex flex-col items-center">
              <Palette className="w-8 h-8 text-purple-600 mb-3" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Artists</h3>
              <div className="text-3xl font-bold text-purple-600">{roleData.artists?.users.length || 0}</div>
              <p className="text-sm text-slate-500 mt-1">Team Members</p>
            </div>
          </Link>
          
          <Link 
            href={`/reports/receptionists?companyId=${searchParams.get('companyId') || 'booking-plus'}`}
            className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 text-center hover:shadow-xl transition-shadow cursor-pointer"
          >
            <div className="flex flex-col items-center">
              <UserCheck className="w-8 h-8 text-green-600 mb-3" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Receptionists</h3>
              <div className="text-3xl font-bold text-green-600">{roleData.receptionists?.users.length || 0}</div>
              <p className="text-sm text-slate-500 mt-1">Team Members</p>
            </div>
          </Link>
        </div>

        {/* Summary */}
        <div className="mt-8 bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Team Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{roleData.salesOfficers?.users.length || 0}</div>
              <div className="text-sm text-blue-800">Sales Officers</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{roleData.artists?.users.length || 0}</div>
              <div className="text-sm text-purple-800">Artists</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{roleData.receptionists?.users.length || 0}</div>
              <div className="text-sm text-green-800">Receptionists</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <LanguageProvider>
      <Suspense fallback={
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
          <div className="text-lg text-gray-600">Loading reports...</div>
        </div>
      }>
        <ReportsContent />
      </Suspense>
    </LanguageProvider>
  );
}
