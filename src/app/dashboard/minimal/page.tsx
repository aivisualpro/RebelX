'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import KPICard from '@/components/KPICard';
import RevenueRings from '@/components/RevenueRings';

type Revenue = { online: number; wholesale: number; total: number };

export default function MinimalDashboardPage() {
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/revenue')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed'))))
      .then((d) => setRevenue({ online: d.online || 0, wholesale: d.wholesale || 0, total: d.total || 0 }))
      .catch(() => setRevenue({ online: 1200000, wholesale: 250000, total: 1450000 }))
      .finally(() => setLoading(false));
  }, []);

  const chartData = useMemo(() => {
    // Simple mock series for traffic sources
    const base = [
      { date: 'Jan 01', blog: 350, social: 12 },
      { date: 'Jan 02', blog: 620, social: 26 },
      { date: 'Jan 03', blog: 640, social: 18 },
      { date: 'Jan 04', blog: 300, social: 35 },
      { date: 'Jan 05', blog: 700, social: 10 },
      { date: 'Jan 06', blog: 280, social: 22 },
      { date: 'Jan 07', blog: 240, social: 29 },
      { date: 'Jan 08', blog: 760, social: 16 },
      { date: 'Jan 09', blog: 510, social: 20 },
      { date: 'Jan 10', blog: 330, social: 18 },
      { date: 'Jan 11', blog: 260, social: 15 },
      { date: 'Jan 12', blog: 180, social: 12 },
    ];
    return base;
  }, []);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="New Accounts" value="234%" subtitle="vs last period" trend={{ isPositive: true, value: 14 }} />
        <KPICard title="Total Expenses" value="71%" subtitle="of budget" trend={{ isPositive: false, value: -8 }} />
        <KPICard title="Company Value" value="$1.45M" subtitle="estimated" />
        <KPICard title="New Employees" value="34 hires" subtitle="this month" trend={{ isPositive: true, value: 6 }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Traffic Sources chart */}
        <Card className="lg:col-span-2 bg-white border-slate-200">
          <CardHeader className="border-b">
            <CardTitle>Traffic Sources</CardTitle>
            <CardDescription>Website Blog vs Social Media</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <ChartContainer config={{ blog: { label: 'Website Blog', color: 'hsl(221 83% 53%)' }, social: { label: 'Social Media', color: 'hsl(161 94% 30%)' } }} className="h-[320px]">
              <BarChart data={chartData} barSize={18}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Bar dataKey="blog" fill="var(--color-blog)" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="social" stroke="var(--color-social)" dot={false} strokeWidth={2} />
                <ChartTooltip content={<ChartTooltipContent />} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Income donut gauge */}
        <Card className="bg-white border-slate-200">
          <CardHeader className="border-b">
            <CardTitle>Income</CardTitle>
            <CardDescription>Breakdown</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {!loading && revenue ? (
              <div className="flex items-center justify-center">
                <RevenueRings online={revenue.online} wholesale={revenue.wholesale} variant="light" />
              </div>
            ) : (
              <div className="h-[320px] flex items-center justify-center text-slate-500">Loading…</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom summaries */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Income" value={`$${(revenue?.total ?? 5456).toLocaleString()}`} subtitle="+14%" />
        <KPICard title="Expenses" value="$4,764" subtitle="-8%" />
        <KPICard title="Spendings" value="$1.5M" subtitle="+15%" />
        <KPICard title="Totals" value="$31,564" subtitle="+76%" />
      </div>
    </div>
  );
}


