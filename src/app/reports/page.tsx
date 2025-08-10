'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { companyService, CompanyData } from '@/lib/auth';
import { useAppState } from '@/app/state/AppStateProvider';

type RecordRow = { id: string } & Record<string, any>;

export default function ReportsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [users, setUsers] = useState<RecordRow[]>([]);
  const [services, setServices] = useState<RecordRow[]>([]);
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { region, setRegion, allowedRegions } = useAppState();
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Check if current user is admin
  useEffect(() => {
    const checkAdminStatus = () => {
      try {
        const userEmail = localStorage.getItem('userEmail');
        setIsAdmin(userEmail === 'admin@aivisualpro.com');
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      }
    };

    checkAdminStatus();
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError('');
        const usersRes = await fetch(`/api/reports/users?clientId=booking-plus&connectionId=${region}`, { cache: 'no-store' });
        const usersJson = await usersRes.json();
        setUsers(usersJson.records || []);
        const servicesRes = await fetch(`/api/reports/services?clientId=booking-plus&connectionId=${region}`, { cache: 'no-store' });
        const servicesJson = await servicesRes.json();
        setServices(servicesJson.records || []);
      } catch (e: any) {
        setError(e?.message || 'Failed to load reports');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [region]);

  useEffect(() => {
    const companyId = (document.cookie.match(/(?:^|; )companyId=([^;]+)/)?.[1] ?? 'booking-plus');
    companyService.getCompanyData(companyId).then(setCompanyData).catch(()=>{});
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-10">
      {/* Header copied pattern (simple) */}
      <header className="bg-white/80 backdrop-blur border border-slate-200 rounded-xl px-4 py-3 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
            {(companyData?.companyName || 'W')[0]}
          </div>
          <Link href="/dashboard" className="text-lg font-semibold text-slate-900 hover:underline">
            {companyData?.companyName || 'Reports'}
          </Link>
        </div>
        <div className="flex items-center gap-3 relative">
          <div className="hidden sm:flex items-center border border-slate-200 rounded-lg overflow-hidden">
            <button 
              className={`px-3 py-1 text-sm border-r border-slate-200 ${
                region === 'saudi1' ? 'bg-green-100 text-green-700' : 
                !allowedRegions.includes('saudi1') ? 'bg-slate-100 text-slate-400 cursor-not-allowed' :
                'bg-white text-slate-800 hover:bg-slate-50'
              }`} 
              onClick={() => setRegion('saudi1')}
              disabled={!allowedRegions.includes('saudi1')}
            >
              Saudi
            </button>
            <button 
              className={`px-3 py-1 text-sm ${
                region === 'egypt1' ? 'bg-green-100 text-green-700' : 
                !allowedRegions.includes('egypt1') ? 'bg-slate-100 text-slate-400 cursor-not-allowed' :
                'bg-white text-slate-800 hover:bg-slate-50'
              }`} 
              onClick={() => setRegion('egypt1')}
              disabled={!allowedRegions.includes('egypt1')}
            >
              Egypt
            </button>
          </div>
          <button onClick={()=>setIsMenuOpen(!isMenuOpen)} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50" aria-label="menu">
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          {isMenuOpen && (
            <div className="absolute top-10 right-0 w-56 bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 py-2">
              <Link href="/dashboard" className="block px-4 py-2 hover:bg-slate-50">Dashboard</Link>
              {isAdmin && (
                <Link href="/connections" className="block px-4 py-2 hover:bg-slate-50">Connections</Link>
              )}
              <div className="relative group">
                <Link href="/reports" className="block px-4 py-2 hover:bg-slate-50 flex items-center justify-between">
                  Reports
                  <svg className="w-4 h-4 -rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Link>
                <div className="absolute left-0 transform -translate-x-full top-0 w-48 bg-white shadow-xl rounded-xl border border-slate-200 py-2 hidden group-hover:block">
                  <a href="#users" className="block px-4 py-2 hover:bg-slate-50">Users</a>
                  <a href="#services" className="block px-4 py-2 hover:bg-slate-50">Services</a>
                </div>
              </div>

              <button 
                onClick={() => {
                  document.cookie = 'companyId=; Max-Age=0; path=/';
                  localStorage.removeItem('region');
                  localStorage.removeItem('allowedRegions');
                  router.push('/auth');
                }} 
                className="block w-full text-left px-4 py-2 hover:bg-slate-50 text-red-600 hover:text-red-700"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="space-y-10">

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}

      <section id="users" className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Users</h2>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-700">
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Sales</th>
              </tr>
            </thead>
            <tbody>
              {users.map((r) => (
                <tr key={r.id} className="border-t text-slate-900">
                  <td className="px-3 py-2">{r.name || r.full_name || ''}</td>
                  <td className="px-3 py-2">{r.role || r.Role || ''}</td>
                  <td className="px-3 py-2">{r.sales || r.Sales || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="services" className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Services</h2>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-3 py-2 text-left">Service</th>
                <th className="px-3 py-2 text-left">Price</th>
                <th className="px-3 py-2 text-left">Sales</th>
              </tr>
            </thead>
            <tbody>
              {services.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{r.service || r.Service || ''}</td>
                  <td className="px-3 py-2">{r.price || r.Price || ''}</td>
                  <td className="px-3 py-2">{r.sales || r.Sales || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </div>
    </div>
  );
}


