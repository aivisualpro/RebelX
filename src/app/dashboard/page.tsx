'use client';

import { useState, useEffect, useRef } from 'react';
import { useAppState } from '@/app/state/AppStateProvider';
import { companyService, CompanyData } from '@/lib/auth';
import SalesAnalyticsChart from '@/components/SalesAnalyticsChart';
import { LanguageProvider, useLanguage } from '@/contexts/LanguageContext';
import { ArrowLeft, Plus, FileSpreadsheet, Users, Settings, Menu, X, Filter } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

// Mini component: animated multi-ring chart by location
function RevenueRings({ entries, total }: { entries: Array<{ label: string; value: number; grad: [string, string] }>; total: number }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const duration = 900;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [entries.map(e => e.value).join(',')]);

  const size = 200; const cx = size / 2; const cy = size / 2;
  const ringOuter = 78; const ringStroke = 12; const gapBetween = 8;
  const sum = entries.reduce((s, e) => s + e.value, 0) || 1;

  const rings = entries.map((e, i) => {
    const radius = Math.max(4, ringOuter - i * (ringStroke + gapBetween));
    const circumference = 2 * Math.PI * radius;
    const share = e.value / sum; // 0..1
    const dashTarget = Math.max(2, circumference * share);
    const dash = dashTarget * progress;
    const gap = circumference - dash;
    return { ...e, radius, dash, gap };
  });

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size}>
        <defs>
          {rings.map((r, idx) => (
            <linearGradient key={idx} id={`grad-${idx}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={r.grad[0]} />
              <stop offset="100%" stopColor={r.grad[1]} />
            </linearGradient>
          ))}
        </defs>
        {rings.map((r, idx) => (
          <g key={idx} transform={`rotate(-90 ${cx} ${cy})`}>
            <circle cx={cx} cy={cy} r={r.radius} stroke="#e5e7eb" strokeWidth={ringStroke} fill="none" />
            <circle
              cx={cx}
              cy={cy}
              r={r.radius}
              stroke={`url(#grad-${idx})`}
              strokeWidth={ringStroke}
              strokeDasharray={`${r.dash} ${r.gap}`}
              strokeLinecap="round"
              fill="none"
              style={{ transition: 'stroke-dasharray 0.3s ease-out' }}
            />
          </g>
        ))}
        <text x={cx} y={cy+4} textAnchor="middle" dominantBaseline="middle" className="fill-slate-900" style={{ fontSize: '20px', fontWeight: 800 }}>
          {Math.round(total * progress).toLocaleString()}
        </text>
      </svg>
      <div className="mt-3 w-full space-y-1">
        {rings.map((r, idx) => {
          const pct = sum > 0 ? (r.value / sum) * 100 : 0;
          return (
            <div key={idx} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded" style={{ background: `linear-gradient(90deg, ${r.grad[0]}, ${r.grad[1]})` }} />
                <span className="text-slate-700">{r.label}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-slate-900 font-semibold">{Math.round(r.value).toLocaleString()}</span>
                <span className="text-slate-500">{pct.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language, setLanguage, t } = useLanguage();
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  
  // Refs for click outside detection
  const menuRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);

  // Handle language change
  const handleLanguageChange = (newLanguage: 'English' | 'Arabic' | 'Egyptian') => {
    setLanguage(newLanguage);
    setIsMenuOpen(false);
  };
  const [analytics, setAnalytics] = useState<any | null>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const firstFilterFieldRef = useRef<HTMLSelectElement>(null);
  const { region, setRegion, allowedRegions, isLoading: stateLoading, refreshFromStorage } = useAppState();
  
  // Refresh state when component mounts to ensure latest data
  useEffect(() => {
    refreshFromStorage();
  }, [refreshFromStorage]);

  // Click outside to close menu and filters
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
        setIsFiltersOpen(false);
      }
    };

    if (isMenuOpen || isFiltersOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen, isFiltersOpen]);
  const analyticsCache = useRef<Record<string, any>>({});
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const companyId = searchParams.get('companyId');
    
    if (companyId) {
      // Load company data from the URL parameter
      companyService.getCompanyData(companyId)
        .then(data => {
          setCompanyData(data);
          setIsLoading(false);
        })
        .catch(error => {
          console.error('Error loading company data:', error);
          setIsLoading(false);
        });
    } else {
      // No company ID, redirect to auth
      router.push('/auth');
    }
  }, [searchParams, router]);

  // Filter state for the filter bar
  const [filters, setFilters] = useState({
    range: 'last_6_months' as 'this_month' | 'last_month' | 'last_6_months' | 'this_year' | 'all',
    location: '',
    bookedBy: '',
    receptionist: '',
    branchManager: '',
    artist: '',
    bookPlus: '' as '' | 'yes' | 'no',
  });

  useEffect(() => {
    const readCookie = (name: string) => {
      if (typeof document === 'undefined') return '';
      const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : '';
    };
    const companyId = searchParams.get('companyId') || readCookie('companyId') || 'booking-plus';
    if (!companyId) return;
    // Compute date range
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const format = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    let startDate = '';
    let endDate = '';
    if (filters.range === 'this_month') {
      const sd = new Date(now.getFullYear(), now.getMonth(), 1);
      const ed = new Date(now.getFullYear(), now.getMonth()+1, 0);
      startDate = format(sd); endDate = format(ed);
    } else if (filters.range === 'last_month') {
      const sd = new Date(now.getFullYear(), now.getMonth()-1, 1);
      const ed = new Date(now.getFullYear(), now.getMonth(), 0);
      startDate = format(sd); endDate = format(ed);
    } else if (filters.range === 'this_year') {
      const sd = new Date(now.getFullYear(), 0, 1);
      const ed = new Date(now.getFullYear(), 11, 31);
      startDate = format(sd); endDate = format(ed);
    }
    const params = new URLSearchParams({ clientId: companyId, connectionId: region, sheetTabId: 'booking_x' });
    if (filters.range !== 'all') { params.set('startDate', startDate); params.set('endDate', endDate); }
    if (filters.location) params.set('location', filters.location);
    if (filters.bookedBy) params.set('bookedBy', filters.bookedBy);
    if (filters.receptionist) params.set('receptionist', filters.receptionist);
    if (filters.branchManager) params.set('branchManager', filters.branchManager);
    if (filters.artist) params.set('artist', filters.artist);
    if (filters.bookPlus) params.set('bookPlus', filters.bookPlus);
    const cacheKey = `${region}|${filters.range}|${filters.location}|${filters.bookedBy}|${filters.receptionist}|${filters.branchManager}|${filters.artist}|${filters.bookPlus}`;
    if (analyticsCache.current[cacheKey]) {
      setAnalytics(analyticsCache.current[cacheKey]);
    }
    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetch(`/api/analytics?${params.toString()}`, { signal: controller.signal })
        .then(res => res.json())
        .then(data => {
          analyticsCache.current[cacheKey] = data;
          setAnalytics(data);
        })
        .catch(err => {
          if (err?.name !== 'AbortError') setAnalytics(null);
        });
    } catch {
      // ignore
    }
  }, [searchParams, filters, region]);

  // Keep URL query params in sync with filters for sharable/refresh persistence
  useEffect(() => {
    const companyId = searchParams.get('companyId');
    if (!companyId) return;
    const params = new URLSearchParams({ companyId });
    params.set('range', filters.range);
    if (filters.location) params.set('location', filters.location);
    if (filters.bookedBy) params.set('bookedBy', filters.bookedBy);
    if (filters.receptionist) params.set('receptionist', filters.receptionist);
    if (filters.branchManager) params.set('branchManager', filters.branchManager);
    if (filters.artist) params.set('artist', filters.artist);
    if (filters.bookPlus) params.set('bookPlus', filters.bookPlus);
    router.replace(`/dashboard?${params.toString()}`);
  }, [filters, router, searchParams]);

  // Helper: readable filter summary
  const getFilterSummary = () => {
    const parts: string[] = [];
    // derive date range like above
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const format = (d: Date) => `${pad(d.getMonth()+1)}/${pad(d.getDate())}/${d.getFullYear()}`;
    if (filters.range !== 'all') {
      let sd: Date, ed: Date;
      if (filters.range === 'this_month') { sd = new Date(now.getFullYear(), now.getMonth(), 1); ed = new Date(now.getFullYear(), now.getMonth()+1, 0); }
      else if (filters.range === 'last_6_months') { sd = new Date(now.getFullYear(), now.getMonth() - 6, 1); ed = new Date(now.getFullYear(), now.getMonth()+1, 0); }
      else if (filters.range === 'last_month') { sd = new Date(now.getFullYear(), now.getMonth()-1, 1); ed = new Date(now.getFullYear(), now.getMonth(), 0); }
      else { sd = new Date(now.getFullYear(), 0, 1); ed = new Date(now.getFullYear(), 11, 31); }
      parts.push(`${format(sd)} → ${format(ed)}`);
    }
    if (filters.location) parts.push(`Location: ${filters.location}`);
    if (filters.bookedBy) parts.push(`Booked By: ${filters.bookedBy}`);
    if (filters.receptionist) parts.push(`Receptionist: ${filters.receptionist}`);
    if (filters.branchManager) parts.push(`Manager: ${filters.branchManager}`);
    if (filters.artist) parts.push(`Artist: ${filters.artist}`);
    if (filters.bookPlus) parts.push(`Book Plus: ${filters.bookPlus}`);
    return parts.join(' • ');
  };

  const handleCreateAnother = () => {
    router.push('/auth');
  };

  if (isLoading || stateLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">
            {stateLoading ? 'Loading user preferences...' : 'Loading dashboard...'}
          </p>
        </div>
      </div>
    );
  }

  if (!companyData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Company Not Found</h1>
          <button 
            onClick={handleCreateAnother}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create a Company
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Top Header (Light) */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {companyData.logoUrl ? (
              <img src={companyData.logoUrl} alt={companyData.companyName} className="w-8 h-8 rounded" />
            ) : (
              <div className="w-8 h-8 rounded bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
                    {companyData.companyName.charAt(0)}
                </div>
              )}
            <Link href={`/dashboard?companyId=${searchParams.get('companyId')}`} className="text-lg font-semibold text-slate-900 hover:underline">{companyData.companyName}</Link>
          </div>
          {/* Business Health + Menu */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Business Health</span>
              <div className="w-24 h-2 rounded bg-slate-200 overflow-hidden">
                <div className="h-2 bg-green-500 rounded animate-[pulse_1.6s_ease-in-out_infinite]" style={{ width: '56%' }}></div>
              </div>
              <span className="text-sm font-semibold text-slate-900">56%</span>
            </div>
            {/* Region Toggle */}
            <div className="hidden sm:flex items-center border border-slate-200 rounded-lg overflow-hidden">
              <button 
                disabled={!allowedRegions.includes('saudi1')} 
                className={`px-3 py-1 text-sm border-r border-slate-200 transition-all duration-200 ${
                  region === 'saudi1' 
                    ? 'bg-green-100 text-green-700' 
                    : allowedRegions.includes('saudi1')
                      ? 'bg-white text-slate-800 hover:bg-slate-50' 
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`} 
                onClick={() => setRegion('saudi1')}
              >
                Saudi
              </button>
              <button 
                disabled={!allowedRegions.includes('egypt1')} 
                className={`px-3 py-1 text-sm transition-all duration-200 ${
                  region === 'egypt1' 
                    ? 'bg-green-100 text-green-700' 
                    : allowedRegions.includes('egypt1')
                      ? 'bg-white text-slate-800 hover:bg-slate-50' 
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`} 
                onClick={() => setRegion('egypt1')}
              >
                Egypt
              </button>
            </div>
            {/* Active filter summary (clickable) */}
            <button
              ref={filterButtonRef}
              onClick={(e)=>{ e.stopPropagation(); setIsFiltersOpen(true); setTimeout(()=>firstFilterFieldRef.current?.focus(),0); }}
              className="hidden sm:flex items-center max-w-[420px] truncate text-xs text-slate-700 gap-2 px-2 py-1 border border-slate-200 rounded-lg hover:bg-slate-50"
              title="Edit filters"
            >
              <Filter className="w-4 h-4" />
              <span className="truncate">{getFilterSummary() || 'No filters applied'}</span>
            </button>
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 rounded-lg hover:bg-slate-100 border border-slate-200"
                aria-label="Toggle menu"
              >
              {isMenuOpen ? <X className="w-6 h-6 text-slate-700" /> : <Menu className="w-6 h-6 text-slate-700" />}
              </button>
            {isMenuOpen && (
              <div 
                ref={menuRef}
                className="absolute top-16 right-4 mt-2 w-56 bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 py-2 animate-[slideDown_0.2s_ease-out] origin-top-right"
                style={{
                  animation: 'slideDown 0.2s ease-out',
                }}
              >
                <Link href={`/connections?companyId=${searchParams.get('companyId')}`} className="block px-4 py-2 hover:bg-slate-50">Connections</Link>
                <div className="group relative">
                  <button className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between">
                    <span>Reports</span>
                    <span>›</span>
                  </button>
                  <div className="hidden group-hover:block absolute top-0 right-full mr-1 w-48 bg-white border border-slate-200 rounded-xl shadow-xl py-2">
                    <Link href="/reports#users" className="block px-4 py-2 hover:bg-slate-50">Users</Link>
                    <Link href="/reports#services" className="block px-4 py-2 hover:bg-slate-50">Services</Link>
                  </div>
                </div>
                
                {/* Language Selection */}
                <div className="group relative">
                  <button className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between">
                    <span>{t('menu.language')}: {language}</span>
                    <span>›</span>
                  </button>
                  <div className="hidden group-hover:block absolute top-0 right-full mr-1 w-48 bg-white border border-slate-200 rounded-xl shadow-xl py-2">
                    <button
                      onClick={() => handleLanguageChange('English')}
                      className={`block w-full text-left px-4 py-2 hover:bg-slate-50 ${language === 'English' ? 'bg-blue-50 text-blue-600 font-medium' : ''}`}
                    >
                      English
                    </button>
                    <button
                      onClick={() => handleLanguageChange('Arabic')}
                      className={`block w-full text-left px-4 py-2 hover:bg-slate-50 ${language === 'Arabic' ? 'bg-blue-50 text-blue-600 font-medium' : ''}`}
                    >
                      العربية (Arabic)
                    </button>
                    <button
                      onClick={() => handleLanguageChange('Egyptian')}
                      className={`block w-full text-left px-4 py-2 hover:bg-slate-50 ${language === 'Egyptian' ? 'bg-blue-50 text-blue-600 font-medium' : ''}`}
                    >
                      مصري (Egyptian)
                    </button>
                  </div>
                </div>
                
                <Link href={`/account?companyId=${searchParams.get('companyId')}`} className="block px-4 py-2 hover:bg-slate-50">Account</Link>
                <button
                  onClick={() => { document.cookie = 'companyId=; Max-Age=0; path=/'; localStorage.removeItem('region'); router.push('/auth'); }}
                  className="block w-full text-left px-4 py-2 hover:bg-slate-50"
                >Logout</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Slide-over Filters Drawer */}
        {isFiltersOpen && (
          <div className="fixed inset-0 z-40">
            {/* overlay */}
            <div className="absolute inset-0 bg-black/30 animate-[fadeIn_0.2s_ease-out]" onClick={() => { setIsFiltersOpen(false); setTimeout(() => filterButtonRef.current?.focus(), 0); }}></div>
            {/* panel */}
            <div 
              ref={filtersRef}
              className="absolute top-0 right-0 h-full w-full sm:w-[520px] bg-white shadow-xl border-l border-slate-200 animate-[slideInRight_0.3s_ease-out]"
            >
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-2 text-slate-900 font-semibold"><Filter className="w-4 h-4" /> Filters</div>
              <button className="p-2 rounded-lg hover:bg-slate-100" onClick={() => { setIsFiltersOpen(false); setTimeout(() => filterButtonRef.current?.focus(), 0); }} aria-label="Close filters"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto">
              {/* Date */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-700 w-28">Date</span>
                <select ref={firstFilterFieldRef} value={filters.range} onChange={e => setFilters(prev => ({ ...prev, range: e.target.value as any }))} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white">
                  <option value="last_6_months">Last 6 Months</option>
                  <option value="this_month">This Month</option>
                  <option value="last_month">Last Month</option>
                  <option value="this_year">This Year</option>
                  <option value="all">All</option>
                </select>
              </div>
              {/* Location */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-700 w-28">Location</span>
                <select value={filters.location} onChange={e => setFilters(prev => ({ ...prev, location: e.target.value }))} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white">
                  <option value="">All</option>
                  {analytics?.options?.location?.map((v:string) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              {/* Booked By */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-700 w-28">Booked By</span>
                <select value={filters.bookedBy} onChange={e => setFilters(prev => ({ ...prev, bookedBy: e.target.value }))} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white">
                  <option value="">All</option>
                  {analytics?.options?.bookedBy?.map((v:string) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              {/* Receptionist */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-700 w-28">Receptionist</span>
                <select value={filters.receptionist} onChange={e => setFilters(prev => ({ ...prev, receptionist: e.target.value }))} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white">
                  <option value="">All</option>
                  {analytics?.options?.receptionist?.map((v:string) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              {/* Branch Manager */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-700 w-28">Branch Manager</span>
                <select value={filters.branchManager} onChange={e => setFilters(prev => ({ ...prev, branchManager: e.target.value }))} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white">
                  <option value="">All</option>
                  {analytics?.options?.branchManager?.map((v:string) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              {/* Artist */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-700 w-28">Artist</span>
                <select value={filters.artist} onChange={e => setFilters(prev => ({ ...prev, artist: e.target.value }))} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white">
                  <option value="">All</option>
                  {analytics?.options?.artist?.map((v:string) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              {/* Book Plus */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-700 w-28">Book Plus</span>
                <select value={filters.bookPlus} onChange={e => setFilters(prev => ({ ...prev, bookPlus: e.target.value as any }))} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white">
                  <option value="">All</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex items-center gap-3">
              <button onClick={() => setFilters({ range: 'last_6_months', location: '', bookedBy: '', receptionist: '', branchManager: '', artist: '', bookPlus: '' })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">Reset</button>
              <button onClick={() => { setIsFiltersOpen(false); setTimeout(() => filterButtonRef.current?.focus(), 0); }} className="ml-auto px-3 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-800">Apply</button>
            </div>
          </div>
          </div>
        )}
        {/* First Row: Total Sales (SAR) + Enhanced Sales Analytics Chart */}
        {analytics && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Total Revenue Animated Rings by Location */}
            <div className="bg-gradient-to-b from-white to-slate-50 rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col items-center justify-center">
              <div className="w-full flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-slate-700">{t('dashboard.totalSales')}</span>
              </div>
              {(() => {
                const total = Number(analytics?.kpis?.totalRevenue ?? 0);
                const entriesSorted = Object.entries(analytics?.distributions?.revenueByLocation ?? {})
                  .sort((a,b)=>Number(b[1])-Number(a[1]))
                  .slice(0,6);
                const gradients: Array<[string,string]> = [
                  ['#60a5fa','#3b82f6'],
                  ['#34d399','#10b981'],
                  ['#fbbf24','#f59e0b'],
                  ['#f472b6','#ec4899'],
                  ['#a78bfa','#8b5cf6'],
                  ['#22d3ee','#06b6d4'],
                ];
                const prepared = entriesSorted.map(([label, v], i) => ({ label, value: Number(v), grad: gradients[i % gradients.length] }));
                return <RevenueRings entries={prepared} total={total} />;
              })()}
            </div>

            {/* Enhanced Sales Analytics Chart - spans 2 columns */}
            <div className="lg:col-span-2">
              <SalesAnalyticsChart 
                data={(() => {
                  // Use real Total_Book data from analytics
                  const generateRealSalesData = () => {
                    const data = [];
                    
                    // Check if we have turnover series data (which should include Total_Book)
                    const turnoverSeries = analytics.turnoverSeries as Array<{date: string, value: number}>;
                    
                    if (turnoverSeries && turnoverSeries.length > 0) {
                      // Use real data from turnover series
                      return turnoverSeries.map(item => ({
                        date: item.date,
                        total: item.value,
                        locations: {} // Not needed for single line chart
                      }));
                    } else {
                      // No real sales data available - return empty data or minimal data points
                      // This prevents showing fake sales when there are none
                      const baseDate = new Date();
                      
                      // Create minimal data points with zero values to show empty chart
                      for (let i = 179; i >= 0; i--) {
                        const date = new Date(baseDate);
                        date.setDate(date.getDate() - i);
                        
                        data.push({
                          date: date.toISOString().split('T')[0],
                          total: 0, // Show zero sales when no real data exists
                          locations: {}
                        });
                      }
                      
                      return data;
                    }
                  };
                  
                  return generateRealSalesData();
                })()}
              />
            </div>
          </div>
        )}

        {/* Second Row: Other KPI Cards */}
        {analytics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="text-slate-500 text-sm">{t('dashboard.uniqueClients')}</div>
              <div className="text-2xl font-bold text-slate-900 mt-2">{analytics.kpis.uniqueClients}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="text-slate-500 text-sm">{t('dashboard.totalLocations')}</div>
              <div className="text-2xl font-bold text-slate-900 mt-2">{analytics.kpis.totalLocations}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="text-slate-500 text-sm">{t('dashboard.channels')}</div>
              <div className="text-2xl font-bold text-slate-900 mt-2">{analytics.kpis.acquisitionChannels}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="text-slate-500 text-sm">{t('dashboard.bookingTypes')}</div>
              <div className="text-2xl font-bold text-slate-900 mt-2">{analytics.kpis.bookingTypes}</div>
            </div>
          </div>
        )}

        {/* Third Row: Additional KPI Cards */}
        {analytics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="text-slate-500 text-sm">Total Paid</div>
              <div className="text-2xl font-bold text-slate-900 mt-2">{Math.round(analytics.kpis.totalPaid).toLocaleString()} SAR</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="text-slate-500 text-sm">Total Discounts</div>
              <div className="text-2xl font-bold text-slate-900 mt-2">{Math.round(analytics.kpis.totalDiscounts).toLocaleString()} SAR</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="text-slate-500 text-sm">Outstanding Due</div>
              <div className="text-2xl font-bold text-slate-900 mt-2">{Math.round(analytics.kpis.totalOutstandingDue).toLocaleString()} SAR</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="text-slate-500 text-sm">Artists</div>
              <div className="text-2xl font-bold text-slate-900 mt-2">{analytics.kpis.uniqueArtists}</div>
            </div>
          </div>
        )}

        {/* Fourth Row: Performance KPI Cards - Light Theme */}
        {analytics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Payment Success Rate */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-2xl shadow-sm border border-blue-200/60 p-6 relative overflow-hidden">
              <div className="absolute top-3 right-3">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-blue-900">Payment Success Rate</div>
                  <div className="text-xs text-blue-600">Target: {'>'}90%</div>
                </div>
              </div>
              <div className="text-3xl font-bold text-blue-900 mb-3">{analytics.kpis.paymentSuccessRate.toFixed(2)}%</div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-blue-700">
                  {analytics.kpis.paymentSuccessRate >= 90 ? 'Good' : analytics.kpis.paymentSuccessRate >= 80 ? 'Fair' : 'Needs Improvement'}
                </span>
              </div>
              <div className="w-full bg-blue-200/50 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${Math.min(analytics.kpis.paymentSuccessRate, 100)}%` }}
                ></div>
              </div>
            </div>

            {/* Average Order Value */}
            <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-2xl shadow-sm border border-amber-200/60 p-6 relative overflow-hidden">
              <div className="absolute top-3 right-3">
                <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-amber-900">Average Order Value</div>
                  <div className="text-xs text-amber-600">Target: {'>'}250 SAR</div>
                </div>
              </div>
              <div className="text-3xl font-bold text-amber-900 mb-3">{Math.round(analytics.kpis.averageOrderValue)} SAR</div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-amber-700">
                  {analytics.kpis.averageOrderValue >= 250 ? 'Good' : analytics.kpis.averageOrderValue >= 200 ? 'Fair' : 'Warning'}
                </span>
              </div>
              <div className="w-full bg-amber-200/50 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-amber-500 to-amber-600 h-2 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${Math.min((analytics.kpis.averageOrderValue / 500) * 100, 100)}%` }}
                ></div>
              </div>
            </div>

            {/* Cancellation Rate */}
            <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-2xl shadow-sm border border-slate-200/60 p-6 relative overflow-hidden">
              <div className="absolute top-3 right-3">
                <div className="w-3 h-3 bg-slate-500 rounded-full"></div>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-slate-500/10 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-900">Cancellation Rate</div>
                  <div className="text-xs text-slate-600">Target: {'<'}5%</div>
                </div>
              </div>
              <div className="text-3xl font-bold text-slate-900 mb-3">{analytics.kpis.cancellationRate.toFixed(2)}%</div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-700">
                  {analytics.kpis.cancellationRate <= 5 ? 'Good' : analytics.kpis.cancellationRate <= 10 ? 'Fair' : 'High'}
                </span>
              </div>
              <div className="w-full bg-slate-200/50 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-slate-500 to-slate-600 h-2 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${Math.min(analytics.kpis.cancellationRate * 2, 100)}%` }}
                ></div>
              </div>
            </div>

            {/* Up-selling Success */}
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-2xl shadow-sm border border-emerald-200/60 p-6 relative overflow-hidden">
              <div className="absolute top-3 right-3">
                <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-emerald-900">Up-selling Success</div>
                  <div className="text-xs text-emerald-600">Target: {'>'}25%</div>
                </div>
              </div>
              <div className="text-3xl font-bold text-emerald-900 mb-3">{analytics.kpis.upsellSuccess.toFixed(2)}%</div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-emerald-700">
                  {analytics.kpis.upsellSuccess >= 25 ? 'Good' : analytics.kpis.upsellSuccess >= 15 ? 'Fair' : 'Low'}
                </span>
              </div>
              <div className="w-full bg-emerald-200/50 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-2 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${Math.min((analytics.kpis.upsellSuccess / 50) * 100, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>
        )}



        {/* Analytics Blocks */}
        {analytics && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Payment Success vs Cancellation */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="text-slate-500 text-sm mb-2">Payment Success Rate</div>
              <div className="text-2xl font-bold text-slate-900">{analytics.kpis.paymentSuccessRate.toFixed(2)}%</div>
              <div className="mt-4 text-slate-500 text-sm">Cancellation Rate: <span className="font-semibold text-slate-900">{analytics.kpis.cancellationRate.toFixed(2)}%</span></div>
            </div>

            {/* Average Order Value & Upsell */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="text-slate-500 text-sm mb-2">Average Order Value</div>
              <div className="text-2xl font-bold text-slate-900">{Math.round(analytics.kpis.averageOrderValue).toLocaleString()} SAR</div>
              <div className="mt-4 text-slate-500 text-sm">Up-selling Success: <span className="font-semibold text-slate-900">{analytics.kpis.upsellSuccess.toFixed(2)}%</span></div>
            </div>

            {/* Payment Breakdown - Cool Pie Chart */}
            <div className="bg-gradient-to-br from-slate-50 to-white rounded-2xl shadow-lg border border-slate-200/60 p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>
              <div className="text-slate-900 font-semibold mb-6 flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                Payment Breakdown
              </div>
              {(() => {
                const entries = Object.entries(analytics.distributions.paymentSums);
                const total = entries.reduce((s, [,v]) => s + Number(v), 0);
                if (total === 0) return <div className="text-slate-500 text-sm">No payment data</div>;
                
                // Light, beautiful colors for payment methods
                const colors = [
                  { main: '#3b82f6', light: '#dbeafe', shadow: '#1e40af' }, // Blue - cash
                  { main: '#10b981', light: '#d1fae5', shadow: '#047857' }, // Emerald - mada
                  { main: '#f59e0b', light: '#fef3c7', shadow: '#d97706' }, // Amber - tabby
                  { main: '#ef4444', light: '#fee2e2', shadow: '#dc2626' }, // Red - tamara
                  { main: '#8b5cf6', light: '#ede9fe', shadow: '#7c3aed' }, // Violet - bank transfer
                  { main: '#06b6d4', light: '#cffafe', shadow: '#0891b2' }, // Cyan - other
                ];
                
                const size = 240;
                const radius = 90;
                const cx = size / 2;
                const cy = size / 2;
                const innerRadius = 35;
                
                let startAngle = -Math.PI / 2;
                const segments = entries.map(([method, amount], i) => {
                  const value = Number(amount);
                  const angle = (value / total) * Math.PI * 2;
                  const endAngle = startAngle + angle;
                  const percentage = (value / total) * 100;
                  
                  // Create 3D effect with multiple paths
                  const outerX1 = cx + radius * Math.cos(startAngle);
                  const outerY1 = cy + radius * Math.sin(startAngle);
                  const outerX2 = cx + radius * Math.cos(endAngle);
                  const outerY2 = cy + radius * Math.sin(endAngle);
                  
                  const innerX1 = cx + innerRadius * Math.cos(startAngle);
                  const innerY1 = cy + innerRadius * Math.sin(startAngle);
                  const innerX2 = cx + innerRadius * Math.cos(endAngle);
                  const innerY2 = cy + innerRadius * Math.sin(endAngle);
                  
                  const largeArc = angle > Math.PI ? 1 : 0;
                  
                  // Main segment path
                  const mainPath = [
                    `M ${innerX1} ${innerY1}`,
                    `L ${outerX1} ${outerY1}`,
                    `A ${radius} ${radius} 0 ${largeArc} 1 ${outerX2} ${outerY2}`,
                    `L ${innerX2} ${innerY2}`,
                    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerX1} ${innerY1}`,
                    'Z'
                  ].join(' ');
                  
                  // Shadow path (slightly offset)
                  const shadowOffset = 3;
                  const shadowPath = [
                    `M ${innerX1 + shadowOffset} ${innerY1 + shadowOffset}`,
                    `L ${outerX1 + shadowOffset} ${outerY1 + shadowOffset}`,
                    `A ${radius} ${radius} 0 ${largeArc} 1 ${outerX2 + shadowOffset} ${outerY2 + shadowOffset}`,
                    `L ${innerX2 + shadowOffset} ${innerY2 + shadowOffset}`,
                    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerX1 + shadowOffset} ${innerY1 + shadowOffset}`,
                    'Z'
                  ].join(' ');
                  
                  startAngle = endAngle;
                  
                  return {
                    method: method.replace(/_/g, ' '),
                    amount: value,
                    percentage,
                    color: colors[i % colors.length],
                    mainPath,
                    shadowPath
                  };
                });
                
                return (
                  <div className="flex items-center justify-center gap-8">
                    <div className="relative">
                      <svg width={size + 10} height={size + 10} viewBox={`0 0 ${size + 10} ${size + 10}`} className="drop-shadow-lg">
                        {/* Shadow segments */}
                        {segments.map((segment, idx) => (
                          <path
                            key={`shadow-${idx}`}
                            d={segment.shadowPath}
                            fill="rgba(0,0,0,0.1)"
                            className="blur-sm"
                          />
                        ))}
                        
                        {/* Main segments with gradient */}
                        {segments.map((segment, idx) => (
                          <g key={idx}>
                            <defs>
                              <radialGradient id={`gradient-${idx}`} cx="0.3" cy="0.3">
                                <stop offset="0%" stopColor={segment.color.light} />
                                <stop offset="70%" stopColor={segment.color.main} />
                                <stop offset="100%" stopColor={segment.color.shadow} />
                              </radialGradient>
                            </defs>
                            <path
                              d={segment.mainPath}
                              fill={`url(#gradient-${idx})`}
                              stroke="white"
                              strokeWidth="2"
                              className="transition-all duration-300 hover:scale-105 hover:brightness-110 cursor-pointer"
                              style={{
                                filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.15))',
                                transformOrigin: `${cx}px ${cy}px`
                              }}
                            />
                          </g>
                        ))}
                        
                        {/* Center circle with gradient */}
                        <defs>
                          <radialGradient id="centerGradient">
                            <stop offset="0%" stopColor="#ffffff" />
                            <stop offset="100%" stopColor="#f8fafc" />
                          </radialGradient>
                        </defs>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={innerRadius}
                          fill="url(#centerGradient)"
                          stroke="#e2e8f0"
                          strokeWidth="2"
                          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}
                        />
                        
                        {/* Center text */}
                        <text x={cx} y={cy - 5} textAnchor="middle" className="fill-slate-600 text-xs font-medium">
                          Total
                        </text>
                        <text x={cx} y={cy + 8} textAnchor="middle" className="fill-slate-900 text-sm font-bold">
                          {Math.round(total).toLocaleString()}
                        </text>
                        <text x={cx} y={cy + 20} textAnchor="middle" className="fill-slate-500 text-xs">
                          SAR
                        </text>
                      </svg>
                    </div>
                    
                    {/* Legend with enhanced styling */}
                    <div className="space-y-3">
                      {segments.map((segment, idx) => (
                        <div key={idx} className="flex items-center gap-3 group cursor-pointer hover:bg-slate-50 rounded-lg p-2 transition-all duration-200">
                          <div 
                            className="w-4 h-4 rounded-full shadow-sm border-2 border-white"
                            style={{ 
                              background: `linear-gradient(135deg, ${segment.color.light} 0%, ${segment.color.main} 50%, ${segment.color.shadow} 100%)`,
                              boxShadow: `0 2px 4px ${segment.color.main}40`
                            }}
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-slate-700 capitalize group-hover:text-slate-900 transition-colors">
                              {segment.method}
                            </div>
                            <div className="text-xs text-slate-500">
                              {segment.percentage.toFixed(1)}%
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-slate-900">
                              {Math.round(segment.amount).toLocaleString()}
                            </div>
                            <div className="text-xs text-slate-500">SAR</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Donuts and Bars */}
        {analytics && (
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Acquisition Channels - Cool 3D Pie Chart */}
            <div className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl shadow-lg border border-emerald-200/60 p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500"></div>
              <div className="text-slate-900 font-semibold mb-6 flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                Acquisition Channels
              </div>
              {(() => {
                const entries = Object.entries(analytics.distributions.channelCounts);
                const total = entries.reduce((s, [,v]) => s + (v as number), 0);
                if (total === 0) return <div className="text-slate-500 text-sm">No data</div>;
                
                // Beautiful light colors with 3D effect
                const colors = [
                  { main: '#10b981', light: '#a7f3d0', shadow: '#047857', glow: '#10b98140' }, // Emerald
                  { main: '#3b82f6', light: '#bfdbfe', shadow: '#1e40af', glow: '#3b82f640' }, // Blue  
                  { main: '#f59e0b', light: '#fed7aa', shadow: '#d97706', glow: '#f59e0b40' }, // Amber
                  { main: '#ef4444', light: '#fecaca', shadow: '#dc2626', glow: '#ef444440' }, // Red
                  { main: '#8b5cf6', light: '#ddd6fe', shadow: '#7c3aed', glow: '#8b5cf640' }, // Violet
                  { main: '#06b6d4', light: '#a5f3fc', shadow: '#0891b2', glow: '#06b6d440' }, // Cyan
                  { main: '#84cc16', light: '#d9f99d', shadow: '#65a30d', glow: '#84cc1640' }, // Lime
                ];
                
                const size = 280;
                const radius = 100;
                const cx = size / 2;
                const cy = size / 2;
                const innerRadius = 40;
                const depth = 8; // 3D depth effect
                
                let startAngle = -Math.PI / 2;
                const segments = entries.map(([label, value], i) => {
                  const numValue = Number(value);
                  const angle = (numValue / total) * Math.PI * 2;
                  const endAngle = startAngle + angle;
                  const percentage = (numValue / total) * 100;
                  
                  // Calculate points for 3D effect
                  const outerX1 = cx + radius * Math.cos(startAngle);
                  const outerY1 = cy + radius * Math.sin(startAngle);
                  const outerX2 = cx + radius * Math.cos(endAngle);
                  const outerY2 = cy + radius * Math.sin(endAngle);
                  
                  const innerX1 = cx + innerRadius * Math.cos(startAngle);
                  const innerY1 = cy + innerRadius * Math.sin(startAngle);
                  const innerX2 = cx + innerRadius * Math.cos(endAngle);
                  const innerY2 = cy + innerRadius * Math.sin(endAngle);
                  
                  const largeArc = angle > Math.PI ? 1 : 0;
                  
                  // Top surface path
                  const topPath = [
                    `M ${innerX1} ${innerY1}`,
                    `L ${outerX1} ${outerY1}`,
                    `A ${radius} ${radius} 0 ${largeArc} 1 ${outerX2} ${outerY2}`,
                    `L ${innerX2} ${innerY2}`,
                    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerX1} ${innerY1}`,
                    'Z'
                  ].join(' ');
                  
                  // Side surface paths for 3D effect
                  const sideOuterPath = [
                    `M ${outerX1} ${outerY1}`,
                    `L ${outerX1} ${outerY1 + depth}`,
                    `A ${radius} ${radius} 0 ${largeArc} 1 ${outerX2} ${outerY2 + depth}`,
                    `L ${outerX2} ${outerY2}`,
                    `A ${radius} ${radius} 0 ${largeArc} 0 ${outerX1} ${outerY1}`,
                    'Z'
                  ].join(' ');
                  
                  const sideInnerPath = [
                    `M ${innerX1} ${innerY1}`,
                    `L ${innerX1} ${innerY1 + depth}`,
                    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${innerX2} ${innerY2 + depth}`,
                    `L ${innerX2} ${innerY2}`,
                    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerX1} ${innerY1}`,
                    'Z'
                  ].join(' ');
                  
                  startAngle = endAngle;
                  
                  return {
                    label,
                    value: numValue,
                    percentage,
                    color: colors[i % colors.length],
                    topPath,
                    sideOuterPath,
                    sideInnerPath
                  };
                });
                
                return (
                  <div className="flex items-center justify-center gap-8">
                    <div className="relative">
                      <svg width={size + 20} height={size + 20} viewBox={`0 0 ${size + 20} ${size + 20}`} className="drop-shadow-2xl">
                        {/* Glow effect */}
                        <defs>
                          <filter id="glow">
                            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                            <feMerge> 
                              <feMergeNode in="coloredBlur"/>
                              <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                          </filter>
                        </defs>
                        
                        {/* Bottom shadow */}
                        <ellipse 
                          cx={cx + 10} 
                          cy={cy + depth + 15} 
                          rx={radius + 5} 
                          ry={20} 
                          fill="rgba(0,0,0,0.1)" 
                          className="blur-sm"
                        />
                        
                        {/* 3D side surfaces (darker) */}
                        {segments.map((segment, idx) => (
                          <g key={`side-${idx}`}>
                            <path
                              d={segment.sideOuterPath}
                              fill={segment.color.shadow}
                              opacity="0.8"
                            />
                            <path
                              d={segment.sideInnerPath}
                              fill={segment.color.shadow}
                              opacity="0.6"
                            />
                          </g>
                        ))}
                        
                        {/* Top surfaces with gradients and glow */}
                        {segments.map((segment, idx) => (
                          <g key={`top-${idx}`}>
                            <defs>
                              <radialGradient id={`channel-gradient-${idx}`} cx="0.3" cy="0.3">
                                <stop offset="0%" stopColor={segment.color.light} />
                                <stop offset="50%" stopColor={segment.color.main} />
                                <stop offset="100%" stopColor={segment.color.shadow} />
                              </radialGradient>
                              <filter id={`channel-glow-${idx}`}>
                                <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={segment.color.glow}/>
                              </filter>
                            </defs>
                            <path
                              d={segment.topPath}
                              fill={`url(#channel-gradient-${idx})`}
                              stroke="white"
                              strokeWidth="2"
                              filter={`url(#channel-glow-${idx})`}
                              className="transition-all duration-500 hover:scale-105 hover:brightness-110 cursor-pointer"
                              style={{
                                transformOrigin: `${cx}px ${cy}px`,
                              }}
                            />
                          </g>
                        ))}
                        
                        {/* Center circle with 3D effect */}
                        <defs>
                          <radialGradient id="centerGradient3D">
                            <stop offset="0%" stopColor="#ffffff" />
                            <stop offset="70%" stopColor="#f1f5f9" />
                            <stop offset="100%" stopColor="#e2e8f0" />
                          </radialGradient>
                        </defs>
                        
                        {/* Center shadow */}
                        <ellipse
                          cx={cx}
                          cy={cy + depth}
                          rx={innerRadius}
                          ry={innerRadius}
                          fill="rgba(0,0,0,0.2)"
                        />
                        
                        {/* Center circle */}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={innerRadius}
                          fill="url(#centerGradient3D)"
                          stroke="#cbd5e1"
                          strokeWidth="2"
                          style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.15))' }}
                        />
                        
                        {/* Center text */}
                        <text x={cx} y={cy - 8} textAnchor="middle" className="fill-slate-600 text-xs font-medium">
                          Total
                        </text>
                        <text x={cx} y={cy + 4} textAnchor="middle" className="fill-slate-900 text-lg font-bold">
                          {total.toLocaleString()}
                        </text>
                        <text x={cx} y={cy + 18} textAnchor="middle" className="fill-slate-500 text-xs">
                          Channels
                        </text>
                      </svg>
                    </div>
                    
                    {/* Enhanced Legend */}
                    <div className="space-y-3">
                      {segments.map((segment, idx) => (
                        <div key={idx} className="flex items-center gap-3 group cursor-pointer hover:bg-white/60 rounded-xl p-3 transition-all duration-300 hover:shadow-md">
                          <div 
                            className="w-5 h-5 rounded-lg shadow-lg border-2 border-white relative"
                            style={{ 
                              background: `linear-gradient(135deg, ${segment.color.light} 0%, ${segment.color.main} 50%, ${segment.color.shadow} 100%)`,
                              boxShadow: `0 4px 8px ${segment.color.glow}, inset 0 1px 0 rgba(255,255,255,0.3)`
                            }}
                          >
                            <div 
                              className="absolute inset-0 rounded-lg"
                              style={{
                                background: `linear-gradient(145deg, transparent 40%, ${segment.color.shadow}20 100%)`
                              }}
                            />
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-slate-800 group-hover:text-slate-900 transition-colors capitalize">
                              {segment.label}
                            </div>
                            <div className="text-xs text-slate-500 font-medium">
                              {segment.percentage.toFixed(1)}% • {segment.value.toLocaleString()} users
                            </div>
                          </div>
                          <div className="w-8 h-1 rounded-full" style={{ backgroundColor: segment.color.main }} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Status segmented bar & Location revenues */}
        {analytics && (
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status segmented bar */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="text-slate-900 font-semibold mb-4">Booking Status</div>
              {(() => {
                const entries = Object.entries(analytics.distributions.statusCounts);
                const total = entries.reduce((s, [,v]) => s + (v as number), 0);
                if (total === 0) return <div className="text-slate-500 text-sm">No data</div>;
                const colors = ['#16a34a','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#06b6d4'];
                return (
                  <div>
                    <div className="h-6 w-full rounded bg-slate-200 overflow-hidden flex">
                      {entries.map(([label, value], i) => (
                        <div key={label} style={{ width: `${(Number(value)/total)*100}%`, background: colors[i % colors.length] }} />
                      ))}
                    </div>
                    <div className="mt-3 space-y-1 text-sm">
                      {entries.map(([label, value], i) => (
                        <div key={label} className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-sm" style={{ background: colors[i % colors.length] }} />
                          <span className="text-slate-700">{label}</span>
                          <span className="ml-auto text-slate-900 font-medium">{value as number}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            
          </div>
        )}
      </main>
    </div>
  );
}

export default function Dashboard() {
  return (
    <LanguageProvider>
      <DashboardContent />
    </LanguageProvider>
  );
}
