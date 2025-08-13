import Link from 'next/link';
import { ReactNode } from 'react';
import { Home, BarChart3, PackageSearch, Users2, Database, Menu } from 'lucide-react';

export default function DashboardGroupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="grid grid-cols-12 gap-0">
        {/* Sidebar */}
        <aside className="col-span-12 md:col-span-2 bg-white border-r border-slate-200 sticky top-0 h-[100dvh] hidden md:flex flex-col">
          <div className="h-16 px-4 border-b border-slate-200 flex items-center gap-2 bg-[radial-gradient(800px_200px_at_100%_-10%,#c7d2fe,transparent),radial-gradient(800px_200px_at_0%_-10%,#99f6e4,transparent)]">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-400 to-teal-300 flex items-center justify-center text-white font-bold">RX</div>
            <div className="font-semibold">Architect</div>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            <SidebarLink href="/" icon={<Home className="w-4 h-4" />}>Home</SidebarLink>
            <SidebarLink href="/sales-analytics" icon={<BarChart3 className="w-4 h-4" />}>Sales Analytics</SidebarLink>
            <SidebarLink href="/inventory-analytics" icon={<PackageSearch className="w-4 h-4" />}>Inventory Analytics</SidebarLink>
            <SidebarLink href="/crm" icon={<Users2 className="w-4 h-4" />}>CRM</SidebarLink>
            <div className="h-px bg-slate-200 my-2" />
            <SidebarLink href="/databases" icon={<Database className="w-4 h-4" />}>Database</SidebarLink>
          </nav>
          <div className="p-4 text-xs text-slate-500 border-t">v0.1 • RebelX</div>
        </aside>

        {/* Main content */}
        <section className="col-span-12 md:col-span-10">
          {/* Topbar */}
          <div className="h-16 border-b border-slate-200 flex items-center justify-between px-4 md:px-6 sticky top-0 z-40 bg-[radial-gradient(1000px_400px_at_100%_-10%,#c7d2fe,transparent),radial-gradient(1000px_400px_at_0%_-10%,#99f6e4,transparent)]">
            <div className="flex items-center gap-3 md:hidden">
              <button className="p-2 rounded-md border border-slate-200">
                <Menu className="w-4 h-4" />
              </button>
              <div className="font-semibold">Architect</div>
            </div>
            <div className="hidden md:block font-medium">Home</div>
            <div className="flex items-center gap-2">
              <Link href="/auth" className="px-3 py-1.5 text-sm rounded-md border border-slate-200 bg-white/40 hover:bg-white/60">Auth</Link>
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
    <Link href={href} className="flex items-center gap-2 px-3 py-2 rounded-md text-slate-700 hover:bg-[radial-gradient(800px_200px_at_100%_-10%,#c7d2fe,transparent),radial-gradient(800px_200px_at_0%_-10%,#99f6e4,transparent)] hover:text-slate-900">
      <span className="text-slate-500">{icon}</span>
      <span className="text-sm font-medium">{children}</span>
    </Link>
  );
}


