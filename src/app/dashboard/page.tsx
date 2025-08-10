'use client';

import { useState, useEffect, useRef } from 'react';
import { useAppState } from '@/app/state/AppStateProvider';
import { ArrowLeft, Plus, FileSpreadsheet, Users, Settings, Menu, X, Filter } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { companyService, CompanyData } from '@/lib/auth';

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

export default function Dashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const firstFilterFieldRef = useRef<HTMLSelectElement>(null);
  const { region, setRegion, allowedRegions } = useAppState();
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
    range: 'this_month' as 'this_month' | 'last_month' | 'this_year' | 'all',
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl mx-auto flex items-center justify-center mb-4">
            <span className="text-white font-bold text-2xl">W</span>
          </div>
          <p className="text-slate-600">Loading company data...</p>
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
              <button disabled={!allowedRegions.includes('saudi1')} className={`px-3 py-1 text-sm border-r border-slate-200 ${region==='saudi1' ? 'bg-green-100 text-green-700' : 'bg-white text-slate-800 hover:bg-slate-50'} ${allowedRegions.includes('saudi1') ? '' : 'opacity-50 cursor-not-allowed'}`} onClick={()=> setRegion('saudi1')}>Saudi</button>
              <button disabled={!allowedRegions.includes('egypt1')} className={`px-3 py-1 text-sm ${region==='egypt1' ? 'bg-green-100 text-green-700' : 'bg-white text-slate-800 hover:bg-slate-50'} ${allowedRegions.includes('egypt1') ? '' : 'opacity-50 cursor-not-allowed'}`} onClick={()=> setRegion('egypt1')}>Egypt</button>
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
              <div className="absolute top-16 right-4 mt-2 w-56 bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 py-2">
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
            <div className="absolute inset-0 bg-black/30" onClick={() => { setIsFiltersOpen(false); setTimeout(() => filterButtonRef.current?.focus(), 0); }}></div>
            {/* panel */}
            <div className="absolute top-0 right-0 h-full w-full sm:w-[520px] bg-white shadow-xl border-l border-slate-200 animate-[slideIn_.2s_ease-out]">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-2 text-slate-900 font-semibold"><Filter className="w-4 h-4" /> Filters</div>
              <button className="p-2 rounded-lg hover:bg-slate-100" onClick={() => { setIsFiltersOpen(false); setTimeout(() => filterButtonRef.current?.focus(), 0); }} aria-label="Close filters"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto">
              {/* Date */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-700 w-28">Date</span>
                <select ref={firstFilterFieldRef} value={filters.range} onChange={e => setFilters(prev => ({ ...prev, range: e.target.value as any }))} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white">
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
              <button onClick={() => setFilters({ range: 'this_month', location: '', bookedBy: '', receptionist: '', branchManager: '', artist: '', bookPlus: '' })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">Reset</button>
              <button onClick={() => { setIsFiltersOpen(false); setTimeout(() => filterButtonRef.current?.focus(), 0); }} className="ml-auto px-3 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-800">Apply</button>
            </div>
          </div>
          </div>
        )}
        {/* KPI Row */}
        {analytics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
            {/* Total Revenue Animated Rings by Location */}
            <div className="bg-gradient-to-b from-white to-slate-50 rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col items-center justify-center">
              <div className="w-full flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-slate-700">Total Sales (SAR)</span>
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
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="text-slate-500 text-sm">Unique Clients</div>
              <div className="text-2xl font-bold text-slate-900 mt-2">{analytics.kpis.uniqueClients}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="text-slate-500 text-sm">Total Locations</div>
              <div className="text-2xl font-bold text-slate-900 mt-2">{analytics.kpis.totalLocations}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="text-slate-500 text-sm">Channels</div>
              <div className="text-2xl font-bold text-slate-900 mt-2">{analytics.kpis.acquisitionChannels}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="text-slate-500 text-sm">Booking Types</div>
              <div className="text-2xl font-bold text-slate-900 mt-2">{analytics.kpis.bookingTypes}</div>
            </div>
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
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="text-slate-500 text-sm">Avg. Manager Rating</div>
              <div className="text-2xl font-bold text-slate-900 mt-2">{analytics.kpis.averageManagerRating.toFixed(2)}</div>
            </div>
          </div>
        )}

        {/* Company info removed as requested */}

        

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

            {/* Payment breakdown */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="text-slate-500 text-sm mb-2">Payment Breakdown</div>
              <div className="space-y-2">
                {Object.entries(analytics.distributions.paymentSums).map(([method, amount]) => (
                  <div key={method} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{method.replace(/_/g,' ')}</span>
                    <span className="text-slate-900 font-medium">{Math.round(Number(amount)).toLocaleString()} SAR</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Donuts and Bars */}
        {analytics && (
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Channels Donut */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="text-slate-900 font-semibold mb-4">Acquisition Channels</div>
              {(() => {
                const entries = Object.entries(analytics.distributions.channelCounts);
                const total = entries.reduce((s, [,v]) => s + v as number, 0);
                if (total === 0) return <div className="text-slate-500 text-sm">No data</div>;
                // Simple donut with cumulative arcs
                const size = 180; const radius = 70; const cx = size/2; const cy = size/2; const stroke = 24;
                let startAngle = -Math.PI / 2; // start at top
                const colors = ['#2563eb','#16a34a','#f59e0b','#ef4444','#06b6d4','#8b5cf6','#84cc16'];
                const arcs = entries.map(([label, value], i) => {
                  const angle = (Number(value)/total) * Math.PI * 2;
                  const endAngle = startAngle + angle;
                  const largeArc = angle > Math.PI ? 1 : 0;
                  const x1 = cx + radius * Math.cos(startAngle);
                  const y1 = cy + radius * Math.sin(startAngle);
                  const x2 = cx + radius * Math.cos(endAngle);
                  const y2 = cy + radius * Math.sin(endAngle);
                  const d = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
                  startAngle = endAngle;
                  return { d, color: colors[i % colors.length], label, value };
                });
                return (
                  <div className="flex items-center gap-6">
                    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                      <circle cx={cx} cy={cy} r={radius} stroke="#e5e7eb" strokeWidth={stroke} fill="none" />
                      {arcs.map((a, idx) => (
                        <path key={idx} d={a.d} stroke={a.color} strokeWidth={stroke} fill="none" strokeLinecap="butt" />
                      ))}
                      <circle cx={cx} cy={cy} r={radius - stroke/2} fill="white" />
                    </svg>
                    <div className="space-y-2 text-sm">
                      {arcs.map((a, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-sm" style={{ background: a.color }} />
                          <span className="text-slate-700">{a.label}</span>
                          <span className="ml-auto text-slate-900 font-medium">{Math.round((Number(a.value)/total)*100)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Booking Types Donut */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="text-slate-900 font-semibold mb-4">Booking Types</div>
              {(() => {
                const entries = Object.entries(analytics.distributions.typeCounts);
                const total = entries.reduce((s, [,v]) => s + v as number, 0);
                if (total === 0) return <div className="text-slate-500 text-sm">No data</div>;
                const size = 180; const radius = 70; const cx = size/2; const cy = size/2; const stroke = 24;
                let startAngle = -Math.PI / 2; const colors = ['#9333ea','#0ea5e9','#10b981','#f43f5e','#f59e0b','#22c55e'];
                const arcs = entries.map(([label, value], i) => {
                  const angle = (Number(value)/total) * Math.PI * 2;
                  const endAngle = startAngle + angle;
                  const largeArc = angle > Math.PI ? 1 : 0;
                  const x1 = cx + radius * Math.cos(startAngle);
                  const y1 = cy + radius * Math.sin(startAngle);
                  const x2 = cx + radius * Math.cos(endAngle);
                  const y2 = cy + radius * Math.sin(endAngle);
                  const d = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
                  startAngle = endAngle;
                  return { d, color: colors[i % colors.length], label, value };
                });
                return (
                  <div className="flex items-center gap-6">
                    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                      <circle cx={cx} cy={cy} r={radius} stroke="#e5e7eb" strokeWidth={stroke} fill="none" />
                      {arcs.map((a, idx) => (
                        <path key={idx} d={a.d} stroke={a.color} strokeWidth={stroke} fill="none" strokeLinecap="butt" />
                      ))}
                      <circle cx={cx} cy={cy} r={radius - stroke/2} fill="white" />
                    </svg>
                    <div className="space-y-2 text-sm">
                      {arcs.map((a, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-sm" style={{ background: a.color }} />
                          <span className="text-slate-700">{a.label}</span>
                          <span className="ml-auto text-slate-900 font-medium">{Math.round((Number(a.value)/total)*100)}%</span>
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
                const total = entries.reduce((s, [,v]) => s + v as number, 0);
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

            {/* Location-wise revenue horizontal bar */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="text-slate-900 font-semibold mb-4">Revenue by Location</div>
              {(() => {
                const entries = Object.entries(analytics.distributions.revenueByLocation).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,8);
                if (entries.length === 0) return <div className="text-slate-500 text-sm">No data</div>;
                const max = Math.max(...entries.map(([,v]) => Number(v)));
                return (
                  <div className="space-y-2">
                    {entries.map(([label, value]) => (
                      <div key={label} className="flex items-center gap-3">
                        <div className="text-sm text-slate-700 w-32 truncate" title={label}>{label}</div>
                        <div className="flex-1 h-3 rounded bg-slate-200 overflow-hidden">
                          <div className="h-3 bg-blue-600" style={{ width: `${(Number(value)/max)*100}%` }} />
                        </div>
                        <div className="text-sm text-slate-900 font-medium w-24 text-right">{Math.round(Number(value)).toLocaleString()} SAR</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Turnover Trend */}
        {analytics && (
          <div className="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="text-slate-900 font-semibold mb-4">Turnover Activity</div>
            <div className="w-full overflow-x-auto">
              <div className="min-w-[600px] h-40 relative">
                {/* Simple sparkline without external libs */}
                {(() => {
                  const series = analytics.turnoverSeries as Array<{date:string, value:number}>;
                  if (!series || series.length === 0) return <div className="text-slate-500 text-sm">No data</div>;
                  const max = Math.max(...series.map(p => p.value));
                  const width = 600; const height = 160; const step = Math.max(1, Math.floor(width / series.length));
                  const points = series.map((p, i) => {
                    const x = i * step;
                    const y = height - (max > 0 ? (p.value / max) * height : 0);
                    return `${x},${y}`;
                  }).join(' ');
                  return (
                    <svg width={width} height={height} className="text-blue-600">
                      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} />
                    </svg>
                  );
                })()}
              </div>
            </div>
        </div>
        )}
      </main>
    </div>
  );
}
