import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

function toNumber(value: any): number {
  if (value === null || value === undefined) return 0;
  const n = Number(String(value).toString().replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// GET /api/revenue
// Optional query params: startDate=YYYY-MM-DD&endDate=YYYY-MM-DD (on field trans_date)
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    // Main collection storing turnover records
    const col = collection(db, 'data');

    // Build two queries by type to avoid scanning everything
    const qWebsite = query(col, where('trans_type', '==', 'Website'));
    const qWholesale = query(col, where('trans_type', '==', 'Sales Order'));

    const [snapWeb, snapWhole] = await Promise.all([getDocs(qWebsite), getDocs(qWholesale)]);

    let online = 0;
    let wholesale = 0;

    const inRange = (rec: any) => {
      if (!startDate && !endDate) return true;
      const raw = rec?.trans_date;
      if (!raw) return false;
      const txt = String(raw);
      // Accept common formats
      const m = txt.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/) || txt.match(/^(\d{4})-(\d{2})-(\d{2})/);
      let iso = '';
      if (m) {
        if (m[3].length === 4) {
          // dd/mm/yyyy or mm-dd-yyyy captured; normalize best-effort
          const a = Number(m[1]);
          const b = Number(m[2]);
          const y = Number(m[3]);
          const mm = String(Math.min(12, Math.max(1, a))).padStart(2, '0');
          const dd = String(Math.min(31, Math.max(1, b))).padStart(2, '0');
          iso = `${y}-${mm}-${dd}`;
        } else {
          // yyyy-mm-dd
          iso = `${m[1]}-${m[2]}-${m[3]}`;
        }
      } else {
        return true; // unknown format – don't filter out
      }
      if (startDate && iso < startDate) return false;
      if (endDate && iso > endDate) return false;
      return true;
    };

    snapWeb.forEach(doc => {
      const d = doc.data();
      if (!inRange(d)) return;
      online += toNumber(d.amount);
    });

    snapWhole.forEach(doc => {
      const d = doc.data();
      if (!inRange(d)) return;
      wholesale += toNumber(d.amount);
    });

    const total = online + wholesale;
    const pctOnline = total > 0 ? (online / total) * 100 : 0;
    const pctWholesale = total > 0 ? (wholesale / total) * 100 : 0;

    return NextResponse.json({ online, wholesale, total, pctOnline, pctWholesale });
  } catch (e: any) {
    console.error('Revenue API error:', e);
    return NextResponse.json({ error: e?.message || 'Failed to compute revenue' }, { status: 500 });
  }
}


