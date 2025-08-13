import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, limit as fbLimit, orderBy, query } from 'firebase/firestore';

type FieldGuess = {
  revenue?: string;
  paid?: string;
  due?: string;
  discount?: string;
  date?: string;
  location?: string;
  channel?: string;
  customer?: string;
  rating?: string;
};

function sanitizeKey(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function toNumber(v: any): number {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function isLikelyDateKey(k: string) {
  return /(date|created|updated|trans|booking|order)/i.test(k);
}

function isLikelyLocationKey(k: string) {
  return /(location|branch|store|city|region)/i.test(k);
}

function isLikelyChannelKey(k: string) {
  return /(channel|source|acquisition|how.*know)/i.test(k);
}

function isLikelyCustomerKey(k: string) {
  return /(client|customer|name|email|phone)/i.test(k);
}

function guessFields(records: any[]): FieldGuess {
  const scores: Record<string, number> = {};
  const allKeys = new Set<string>();
  records.slice(0, 50).forEach((r) => Object.keys(r).forEach((k) => allKeys.add(k)));
  const keys = Array.from(allKeys);
  const lower = (s: string) => s.toLowerCase();

  const g: FieldGuess = {};

  // Revenue-like
  let bestRev = '';
  let bestScore = -1;
  for (const k of keys) {
    const lk = lower(k);
    let s = 0;
    if (/(total|amount|revenue|sales|turnover|price)/.test(lk)) s += 3;
    // numeric presence
    const nSum = records.slice(0, 50).reduce((acc, r) => acc + (typeof r[k] === 'number' ? 1 : /[0-9]/.test(String(r[k] || '')) ? 1 : 0), 0);
    s += nSum;
    scores[k] = s;
    if (s > bestScore) { bestScore = s; bestRev = k; }
  }
  if (bestRev) g.revenue = bestRev;

  // Paid / Due / Discount / Rating
  for (const k of keys) {
    const lk = lower(k);
    if (!g.paid && /(paid|payment|received)/.test(lk)) g.paid = k;
    if (!g.due && /(due|outstanding|balance)/.test(lk)) g.due = k;
    if (!g.discount && /(discount|promo)/.test(lk)) g.discount = k;
    if (!g.rating && /(rating|score)/.test(lk)) g.rating = k;
  }

  // Date / Location / Channel / Customer
  for (const k of keys) {
    const lk = lower(k);
    if (!g.date && isLikelyDateKey(lk)) g.date = k;
    if (!g.location && isLikelyLocationKey(lk)) g.location = k;
    if (!g.channel && isLikelyChannelKey(lk)) g.channel = k;
    if (!g.customer && isLikelyCustomerKey(lk)) g.customer = k;
  }
  return g;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sheetTabId = url.searchParams.get('sheetTabId');
    const limitNum = Math.min(2000, Math.max(50, parseInt(url.searchParams.get('limit') || '800', 10)));

    if (!sheetTabId) {
      return NextResponse.json({ error: 'sheetTabId is required' }, { status: 400 });
    }

    // Resolve collection name from sheetTabs meta
    const tabRef = doc(db, 'sheetTabs', sheetTabId);
    const tabSnap = await getDoc(tabRef);
    if (!tabSnap.exists()) {
      return NextResponse.json({ error: 'sheetTab not found' }, { status: 404 });
    }
    const tab = tabSnap.data() as any;
    const collectionName = String(tab.collectionName || '').trim();
    if (!collectionName) {
      return NextResponse.json({ error: 'sheetTab has no collectionName' }, { status: 400 });
    }

    const colRef = collection(db, collectionName);
    // Try to order by a likely timestamp field; if unknown, just limit
    let q = query(colRef, fbLimit(limitNum));
    const tryOrderKeys = ['updatedAt', 'createdAt', 'date', 'trans_date', 'booking_date'];
    for (const k of tryOrderKeys) {
      try {
        q = query(colRef, orderBy(k as any, 'desc'), fbLimit(limitNum));
        break;
      } catch {
        // ignore and fallback
      }
    }

    const snap = await getDocs(q);
    const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!records.length) {
      return NextResponse.json({ kpis: {}, insights: [], trend: [], fields: {} });
    }

    const guess = guessFields(records);
    let revKey = guess.revenue;
    const paidKey = guess.paid;
    const dueKey = guess.due;
    const discKey = guess.discount;
    const dateKey = guess.date;
    const locKey = guess.location;
    const custKey = guess.customer;

    // KPIs
    let totalRevenue = 0, totalPaid = 0, totalDue = 0, totalDiscounts = 0;
    const revenueByLocation: Record<string, number> = {};
    const revenueByCustomer: Record<string, number> = {};
    const riskByCustomer: Record<string, number> = {};
    const trendMap: Record<string, number> = {};

    // Revenue fallback: if no clear revenue field, try any key that looks like amount/total/price/value
    const allKeys = new Set<string>();
    records.slice(0, 50).forEach((rec) => Object.keys(rec).forEach((k) => allKeys.add(k)));
    const candidateRevKeys = Array.from(allKeys).filter((k) => /(total|amount|revenue|sales|turnover|price|value)/i.test(k));
    if (!revKey && candidateRevKeys.length) {
      // choose the key with the highest numeric sum across a small sample
      let best = '';
      let bestSum = -1;
      for (const k of candidateRevKeys) {
        const s = records.slice(0, 200).reduce((acc, rec) => acc + toNumber((rec as any)[k]), 0);
        if (s > bestSum) { bestSum = s; best = k; }
      }
      revKey = best || revKey;
    }

    for (const r of records) {
      const rev = revKey ? toNumber(r[revKey]) : 0;
      const paid = paidKey ? toNumber(r[paidKey]) : 0;
      const due = dueKey ? toNumber(r[dueKey]) : 0;
      const disc = discKey ? toNumber(r[discKey]) : 0;

      totalRevenue += rev;
      totalPaid += paid;
      totalDue += due;
      totalDiscounts += disc;

      if (locKey) {
        const loc = String(r[locKey] ?? 'Unknown');
        revenueByLocation[loc] = (revenueByLocation[loc] || 0) + rev;
      }
      if (custKey) {
        const c = String(r[custKey] ?? 'Unknown');
        revenueByCustomer[c] = (revenueByCustomer[c] || 0) + rev;
        if (due > 0) riskByCustomer[c] = (riskByCustomer[c] || 0) + due;
      }
      if (dateKey) {
        const raw = r[dateKey];
        const d = String(raw || '').slice(0, 10);
        if (d) trendMap[d] = (trendMap[d] || 0) + rev;
      }
    }

    const topLocations = Object.entries(revenueByLocation)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));
    const topCustomers = Object.entries(revenueByCustomer)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));
    const riskCustomers = Object.entries(riskByCustomer)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));

    const trend = Object.entries(trendMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, value]) => ({ date, value }));

    const insights: Array<{ title: string; detail: string; value?: string }> = [];
    if (topLocations.length) {
      const [first] = topLocations;
      insights.push({ title: 'Top location', detail: `${first.name} leads revenue`, value: `$${Math.round(first.value).toLocaleString()}` });
    }
    if (topCustomers.length) {
      const [first] = topCustomers;
      insights.push({ title: 'Best customer', detail: `${first.name} spent the most`, value: `$${Math.round(first.value).toLocaleString()}` });
    }
    if (riskCustomers.length) {
      const dueSum = riskCustomers.reduce((s, c) => s + c.value, 0);
      insights.push({ title: 'Payment risk', detail: 'Follow up on high outstanding balances', value: `$${Math.round(dueSum).toLocaleString()}` });
    }

    const avg = records.length ? totalRevenue / records.length : 0;
    const safeAvg = Number.isFinite(avg) ? avg : 0;

    return NextResponse.json({
      fields: guess,
      kpis: {
        totalRevenue,
        totalPaid,
        totalDue,
        totalDiscounts,
        averageOrderValue: safeAvg,
        recordCount: records.length,
      },
      topLocations,
      topCustomers,
      riskCustomers,
      trend,
      insights,
    });
  } catch (e: any) {
    console.error('Insights error', e);
    return NextResponse.json({ error: e?.message || 'Failed to compute insights' }, { status: 500 });
  }
}


