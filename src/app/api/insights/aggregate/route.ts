import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, limit as fbLimit, orderBy, query } from 'firebase/firestore';

const DEFAULT_IDS = ['data','skus','activity_tracking','clients','users'];

function sanitize(v: any) {
  return (v ?? '').toString().toLowerCase();
}
function toNumber(v: any) {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function isDateKey(k: string) { return /(date|created|updated|trans|booking|order)/i.test(k); }
function isLocationKey(k: string) { return /(location|branch|store|city|region)/i.test(k); }
function isCustomerKey(k: string) { return /(client|customer|name|email|phone)/i.test(k); }
function isChannelKey(k: string) { return /(channel|source|acquisition|how.*know)/i.test(k); }
function isRevenueKey(k: string) { return /(total|amount|revenue|sales|turnover|price|value)/i.test(k); }
function isStockKey(k: string) { return /(stock|qty|quantity|on_hand|onhand|available)/i.test(k); }

async function loadRecordsForTab(tabId: string, limitNum: number) {
  try {
    const tabRef = doc(db, 'sheetTabs', tabId);
    const snap = await getDoc(tabRef);
    if (!snap.exists()) return { id: tabId, records: [] as any[] };
    const tab = snap.data() as any;
    const colName = String(tab.collectionName || '').trim();
    if (!colName) return { id: tabId, records: [] as any[] };
    const col = collection(db, colName);
    let q = query(col, fbLimit(limitNum));
    for (const k of ['updatedAt','createdAt','date','trans_date','booking_date']) {
      try { q = query(col, orderBy(k as any,'desc'), fbLimit(limitNum)); break; } catch {}
    }
    const res = await getDocs(q);
    return { id: tabId, records: res.docs.map((d) => ({ id: d.id, ...d.data() })) };
  } catch {
    return { id: tabId, records: [] as any[] };
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const idsParam = url.searchParams.get('ids');
    const limitNum = Math.min(3000, Math.max(100, parseInt(url.searchParams.get('limit') || '1200', 10)));
    const ids = (idsParam ? idsParam.split(',') : DEFAULT_IDS).map((s) => s.trim()).filter(Boolean);

    const results = await Promise.all(ids.map((id) => loadRecordsForTab(id, limitNum)));

    const all: Record<string, any[]> = Object.fromEntries(results.map((r) => [r.id, r.records]));

    // Aggregate insights
    const messages: Array<{ type: 'success'|'warning'|'info'; text: string }> = [];
    const cards: Array<{ title: string; metric: string; delta?: string; description?: string }> = [];

    // SALES-like dataset (try 'data' first, else any dataset with revenue-like keys)
    let salesRecs: any[] = all['data'] || [];
    if (!salesRecs.length) {
      const firstWithRevenue = results.find((r) => r.records.some((rec) => Object.keys(rec).some((k) => isRevenueKey(k))));
      if (firstWithRevenue) salesRecs = firstWithRevenue.records;
    }
    if (salesRecs.length) {
      const keys = new Set<string>(); salesRecs.slice(0,50).forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
      const dateKey = Array.from(keys).find((k) => isDateKey(k));
      const revKey = Array.from(keys).find((k) => isRevenueKey(k));
      const locKey = Array.from(keys).find((k) => isLocationKey(k));
      let totalRev = 0; const trend: Record<string, number> = {}; const byLoc: Record<string, number> = {};
      for (const r of salesRecs) {
        const rev = revKey ? toNumber(r[revKey]) : 0; totalRev += rev;
        if (dateKey) { const d = String(r[dateKey] || '').slice(0,10); if (d) trend[d] = (trend[d]||0) + rev; }
        if (locKey) { const l = String(r[locKey] || 'Unknown'); byLoc[l] = (byLoc[l]||0) + rev; }
      }
      const trendArr = Object.entries(trend).sort((a,b)=>a[0].localeCompare(b[0])).map(([date,value])=>({date,value}));
      const last7 = trendArr.slice(-7).reduce((s, d)=>s + d.value,0);
      const prev7 = trendArr.slice(-14,-7).reduce((s, d)=>s + d.value,0);
      const delta = prev7>0 ? ((last7 - prev7)/prev7)*100 : 0;
      cards.push({ title: 'Total Revenue', metric: `$${Math.round(totalRev).toLocaleString()}`, delta: `${delta>=0?'+':''}${delta.toFixed(1)}%`, description: '7‑day vs previous 7‑day window' });
      const topLoc = Object.entries(byLoc).sort((a,b)=>b[1]-a[1]).slice(0,1)[0];
      if (topLoc) messages.push({ type: 'success', text: `Top location: ${topLoc[0]} — $${Math.round(topLoc[1]).toLocaleString()}` });
    }

    // INVENTORY from skus
    const skuRecs: any[] = all['skus'] || [];
    if (skuRecs.length) {
      const low: Array<{name: string; qty: number}> = [];
      for (const r of skuRecs) {
        const key = Object.keys(r).find((k) => isStockKey(k));
        if (!key) continue;
        const qty = toNumber(r[key]);
        if (qty <= 5) {
          const name = String(r.name || r.title || r.sku || r.id || 'SKU');
          low.push({ name, qty });
        }
      }
      if (low.length) {
        low.sort((a,b)=>a.qty-b.qty);
        messages.push({ type: 'warning', text: `Low stock on ${low.length} items. Worst: ${low.slice(0,3).map(l=>`${l.name} (${l.qty})`).join(', ')}` });
        cards.push({ title: 'Low Stock Items', metric: String(low.length), description: '≤ 5 units remaining' });
      }
    }

    // CLIENTS
    const clientRecs: any[] = all['clients'] || [];
    if (clientRecs.length) {
      const dateKey = Object.keys(clientRecs[0]||{}).find((k)=>isDateKey(k));
      const totalClients = clientRecs.length;
      cards.push({ title: 'Clients', metric: totalClients.toLocaleString(), description: 'Total in CRM' });
      if (dateKey) {
        const thisMonth = clientRecs.filter((r)=>String(r[dateKey]||'').slice(0,7)===new Date().toISOString().slice(0,7)).length;
        messages.push({ type: 'info', text: `${thisMonth} new clients added this month` });
      }
    }

    // USERS
    const userRecs: any[] = all['users'] || [];
    if (userRecs.length) {
      cards.push({ title: 'Team Members', metric: userRecs.length.toLocaleString(), description: 'Active staff accounts' });
    }

    // ACTIVITY
    const act: any[] = all['activity_tracking'] || [];
    if (act.length) {
      const actionKey = Object.keys(act[0]).find((k)=>/(action|event|type|status)/i.test(k));
      if (actionKey) {
        const counts: Record<string, number> = {};
        act.forEach((r)=>{ const a = String(r[actionKey] || ''); if (a) counts[a] = (counts[a]||0)+1; });
        const top = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
        if (top) messages.push({ type: 'info', text: `Most frequent activity: ${top[0]} (${top[1]})` });
      }
    }

    return NextResponse.json({ cards, messages });
  } catch (e: any) {
    console.error('Aggregate insights error', e);
    return NextResponse.json({ error: e?.message || 'Failed to aggregate insights' }, { status: 500 });
  }
}


