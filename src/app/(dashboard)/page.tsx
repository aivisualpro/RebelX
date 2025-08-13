'use client';

function InsightCard({ title, description, metricLabel, metricValue }: { title: string; description: string; metricLabel: string; metricValue: string }) {
  return (
    <div className="rounded-xl border bg-white/70 backdrop-blur p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">{title}</h3>
        <span className="text-xs text-slate-600">{metricLabel}</span>
      </div>
      <div className="text-2xl font-bold tracking-tight">{metricValue}</div>
      <p className="text-slate-600 text-sm mt-2">{description}</p>
    </div>
  );
}

import * as React from 'react';
import { AreaChart, Area, CartesianGrid, XAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

export default function HomeDashboardPage() {
  // Load insights from /api/insights using the active sheetTab (first DB tab by default)
  const [loading, setLoading] = React.useState(true);
  const [insights, setInsights] = React.useState<any>(null);
  const [error, setError] = React.useState<string>('');
  const [sheetTabId, setSheetTabId] = React.useState<string>('');
  const [agg, setAgg] = React.useState<{ cards: any[]; messages: any[] } | null>(null);
  const [cardIdx, setCardIdx] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => setCardIdx((i) => (i + 1) % Math.max(1, (agg?.cards?.length || 1))), 4000);
    return () => clearInterval(id);
  }, [agg?.cards?.length]);

  React.useEffect(() => {
    let cancelled = false;
    const load = async (id: string) => {
      try {
        setLoading(true); setError('');
        const res = await fetch(`/api/insights?sheetTabId=${encodeURIComponent(id)}&limit=1000`);
        if (!res.ok) throw new Error((await res.text()) || res.statusText);
        const data = await res.json();
        if (!cancelled) setInsights(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load insights');
      } finally { if (!cancelled) setLoading(false); }
    };

    (async () => {
      // Prefer previously selected sheet tab id
      const saved = typeof window !== 'undefined' ? localStorage.getItem('lastSheetTabId') || '' : '';
      if (saved) {
        setSheetTabId(saved);
        await load(saved);
        try { const r = await fetch('/api/insights/aggregate'); if (r.ok) setAgg(await r.json()); } catch {}
        return;
      }
      // Otherwise, pick the first active sheetTab from API
      try {
        const res = await fetch('/api/sheet-tabs');
        if (res.ok) {
          const json = await res.json();
          const first = json?.sheetTabs?.[0]?.id;
          if (first) {
            setSheetTabId(first);
            localStorage.setItem('lastSheetTabId', first);
            await load(first);
            try { const r = await fetch('/api/insights/aggregate'); if (r.ok) setAgg(await r.json()); } catch {}
            return;
          }
        }
      } catch {}
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-10">
      {/* AI Suggestions Section */}
      <section id="ai" className="relative rounded-2xl overflow-hidden border bg-white">
        <div className="absolute inset-0 bg-[radial-gradient(1000px_400px_at_100%_-10%,#c7d2fe,transparent),radial-gradient(1000px_400px_at_0%_-10%,#99f6e4,transparent)] opacity-40" />
        <div className="relative p-6 md:p-8">
          <div className="flex items-baseline justify-between mb-4">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">AI Generative Insights</h1>
          </div>

          {loading ? (
            <div className="h-32 flex items-center justify-center text-slate-600">Loading insights…</div>
          ) : error ? (
            <div className="h-32 flex items-center justify-center text-red-600">{error}</div>
          ) : insights ? (
            <>
              {sheetTabId && (
                <div className="mb-4 text-xs text-slate-600">Source tab: <code className="px-1.5 py-0.5 bg-black/5 rounded">{sheetTabId}</code></div>
              )}
              {agg && agg.cards?.length ? (
                <div className="mb-6 grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {/* Rotating hero card */}
                  <div className="relative overflow-hidden rounded-2xl border bg-white">
                    <div className="absolute inset-0 bg-[radial-gradient(800px_300px_at_100%_-10%,#c7d2fe,transparent),radial-gradient(800px_300px_at_0%_-10%,#99f6e4,transparent)] opacity-50" />
                    <div className="relative p-5 min-h-[140px] flex items-center justify-between gap-6">
                      <div className="transition-all duration-500">
                        <div className="text-xs text-slate-600">{agg.cards[cardIdx]?.title}</div>
                        <div className="text-3xl font-extrabold tracking-tight">{agg.cards[cardIdx]?.metric}</div>
                        {agg.cards[cardIdx]?.delta && (
                          <div className={`text-xs mt-1 ${String(agg.cards[cardIdx].delta).startsWith('+') ? 'text-emerald-600' : 'text-rose-600'}`}>{agg.cards[cardIdx].delta}</div>
                        )}
                        {agg.cards[cardIdx]?.description && (
                          <div className="text-xs text-slate-600 mt-1">{agg.cards[cardIdx].description}</div>
                        )}
                      </div>
                      {/* Tiny sparkline if we have trend */}
                      {insights?.trend?.length ? (
                        <ChartContainer config={{ v: { label: 'Revenue', color: 'hsl(221 83% 53%)' } }} className="w-[180px] h-[80px]">
                          <AreaChart data={insights.trend}>
                            <defs>
                              <linearGradient id="miniFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--color-v)" stopOpacity={0.6} />
                                <stop offset="95%" stopColor="var(--color-v)" stopOpacity={0.05} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="date" hide tickLine={false} axisLine={false} />
                            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                            <Area dataKey="value" type="monotone" stroke="var(--color-v)" fill="url(#miniFill)" strokeWidth={2} />
                          </AreaChart>
                        </ChartContainer>
                      ) : null}
                    </div>
                  </div>

                  {/* Two quick metric cards */}
                  {(agg.cards || []).slice(0, 2).map((c, idx) => (
                    <div key={idx} className="rounded-2xl border bg-white p-4">
                      <div className="text-xs text-slate-600">{c.title}</div>
                      <div className="text-2xl font-bold">{c.metric}</div>
                      {c.delta && <div className={`text-xs ${String(c.delta).startsWith('+') ? 'text-emerald-600' : 'text-rose-600'}`}>{c.delta}</div>}
                      {c.description && <div className="text-xs text-slate-500 mt-1">{c.description}</div>}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {insights.topLocations?.[0] && (
                  <InsightCard title="Top location" description={`${insights.topLocations[0].name} leads revenue`} metricLabel="Revenue" metricValue={`$${Math.round(insights.topLocations[0].value).toLocaleString()}`} />
                )}
                {insights.topCustomers?.[0] && (
                  <InsightCard title="Best customer" description={`${insights.topCustomers[0].name} spent the most`} metricLabel="Value" metricValue={`$${Math.round(insights.topCustomers[0].value).toLocaleString()}`} />
                )}
                {insights.kpis && (
                  <InsightCard title="AOV" description="Average order value across recent records" metricLabel="Avg" metricValue={`$${Math.round(insights.kpis.averageOrderValue).toLocaleString()}`} />
                )}
              </div>

              <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl border bg-white/70 backdrop-blur p-5">
                  <h3 className="font-semibold mb-2">Revenue by top locations</h3>
                  <ul className="text-sm text-slate-700 space-y-1">
                    {(insights.topLocations || []).map((i: any) => (
                      <li key={i.name} className="flex justify-between"><span>{i.name}</span><span className="font-semibold">${Math.round(i.value).toLocaleString()}</span></li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border bg-white/70 backdrop-blur p-5">
                  <h3 className="font-semibold mb-2">Customers with outstanding balance</h3>
                  <ul className="text-sm text-slate-700 space-y-1">
                    {(insights.riskCustomers || []).map((i: any) => (
                      <li key={i.name} className="flex justify-between"><span>{i.name}</span><span className="font-semibold">${Math.round(i.value).toLocaleString()}</span></li>
                    ))}
                  </ul>
                </div>
              </div>

              {agg?.messages?.length ? (
                <div className="mt-6">
                  <div className="relative overflow-hidden rounded-xl border bg-white/60">
                    <div className="flex gap-6 whitespace-nowrap animate-[scroll_25s_linear_infinite] px-4 py-3">
                      {agg.messages.concat(agg.messages).map((m, i) => (
                        <span key={i} className={`px-3 py-1.5 rounded-full text-sm ${m.type==='success'?'bg-emerald-100 text-emerald-700':m.type==='warning'?'bg-amber-100 text-amber-700':'bg-sky-100 text-sky-700'}`}>
                          {m.text}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-6 flex items-center gap-3">
                <button onClick={() => window.location.reload()} className="px-4 py-2.5 rounded-md bg-slate-900 text-white text-sm font-medium">Refresh insights</button>
                <button onClick={() => { localStorage.removeItem('lastSheetTabId'); window.location.reload(); }} className="px-4 py-2.5 rounded-md border text-sm font-medium">Change data source</button>
              </div>
            </>
          ) : (
            <div className="h-32 flex items-center justify-center text-slate-600">No data yet. Open a tab in <a href="/databases" className="underline">/databases</a> to set a data source.</div>
          )}
        </div>
      </section>

    </div>
  );
}


