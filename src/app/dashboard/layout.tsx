import Link from 'next/link';
import { ReactNode } from 'react';
import { BarChart3, LayoutDashboard, PieChart, Settings, Users, Files, Menu } from 'lucide-react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="grid grid-cols-12 gap-0">
        {/* Sidebar */}
        <aside className="col-span-12 md:col-span-2 lg:col-span-2 xl:col-span-2 bg-white border-r border-slate-200 sticky top-0 h-[100dvh] hidden md:flex flex-col">
          <div className="h-16 px-4 border-b border-slate-200 flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">RX</div>
            <div className="font-semibold">Architect</div>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            <SidebarLink href="/dashboard/minimal" icon={<LayoutDashboard className="w-4 h-4" />}>Minimal</SidebarLink>
            <SidebarLink href="/dashboard/analytics" icon={<BarChart3 className="w-4 h-4" />}>Analytics</SidebarLink>
            <SidebarLink href="/dashboard/reports" icon={<Files className="w-4 h-4" />}>Reports</SidebarLink>
            <SidebarLink href="/dashboard/segments" icon={<Users className="w-4 h-4" />}>Segments</SidebarLink>
            <SidebarLink href="/dashboard/charts" icon={<PieChart className="w-4 h-4" />}>Charts</SidebarLink>
            <div className="h-px bg-slate-200 my-2" />
            <SidebarLink href="/databases" icon={<Settings className="w-4 h-4" />}>Settings</SidebarLink>
          </nav>
          <div className="p-4 text-xs text-slate-500 border-t">v0.1 • RebelX</div>
        </aside>

        {/* Main content */}
        <section className="col-span-12 md:col-span-10">
          {/* Topbar */}
          <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 sticky top-0 z-40">
            <div className="flex items-center gap-3 md:hidden">
              <button className="p-2 rounded-md border border-slate-200">
                <Menu className="w-4 h-4" />
              </button>
              <div className="font-semibold">Architect</div>
            </div>
            <div className="hidden md:block font-medium">Minimal Dashboard</div>
            <div className="flex items-center gap-2">
              <Link href="/home" className="px-3 py-1.5 text-sm rounded-md border border-slate-200 hover:bg-slate-50">Home</Link>
            </div>
          </div>

          <div className="p-4 md:p-6">{children}</div>
        </section>
      </div>
    </div>
  );
}

function SidebarLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-2 px-3 py-2 rounded-md text-slate-700 hover:bg-slate-100 hover:text-slate-900">
      <span className="text-slate-500">{icon}</span>
      <span className="text-sm font-medium">{children}</span>
    </Link>
  );
}


