import { NextRequest, NextResponse } from 'next/server';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  startAfter,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

function sanitize(header: string): string {
  return (header ?? '')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

async function getCollectionInfo(sheetTabId: string) {
  const ref = doc(db, 'sheetTabs', sheetTabId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Sheet tab not found');
  const data = snap.data() as any;
  if (!data.collectionName) throw new Error('collectionName missing on sheet tab');
  const keyHuman = data.keyColumn || 'id';
  const keyField = sanitize(keyHuman);
  return { collectionName: data.collectionName as string, keyField };
}

function buildSearchTokens(record: Record<string, any>): string[] {
  const out = new Set<string>();
  const pushToken = (t: string) => {
    const s = t.trim().toLowerCase();
    if (!s) return;
    out.add(s);
    for (let i = 2; i <= Math.min(10, s.length); i++) out.add(s.slice(0, i));
  };
  const visit = (v: any) => {
    if (typeof v === 'string') {
      v
        .split(/[^a-zA-Z0-9]+/g)
        .filter(Boolean)
        .forEach(pushToken);
    } else if (typeof v === 'number') {
      pushToken(String(v));
    }
  };
  Object.values(record || {}).forEach(visit);
  return Array.from(out).slice(0, 2000);
}

/**
 * POST /api/sheet-tabs/[sheetTabId]/backfill-search-tokens
 * body: { batchSize?: number, maxDocs?: number, overwrite?: boolean }
 * Scans the collection in batches and writes searchTokens to docs missing them (or all if overwrite).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ sheetTabId: string }> }) {
  try {
    const { sheetTabId } = await params;
    const body = await request.json().catch(() => ({}));
    const batchSize = Math.max(1, Math.min(2000, parseInt(String(body?.batchSize ?? '1000'), 10)));
    const maxDocs = Math.max(1, parseInt(String(body?.maxDocs ?? '100000'), 10));
    const overwrite = Boolean(body?.overwrite ?? false);

    const { collectionName, keyField } = await getCollectionInfo(sheetTabId);
    const colRef = collection(db, collectionName);

    let cursor: any = null;
    let processed = 0;
    let updated = 0;

    while (processed < maxDocs) {
      let qScan = query(colRef, orderBy(keyField), fbLimit(Math.min(batchSize, maxDocs - processed)));
      if (cursor) qScan = query(colRef, orderBy(keyField), startAfter(cursor), fbLimit(Math.min(batchSize, maxDocs - processed)));

      const snap = await getDocs(qScan);
      if (snap.empty) break;

      for (const d of snap.docs) {
        processed++;
        const data = d.data() as any;
        if (!overwrite && Array.isArray(data.searchTokens) && data.searchTokens.length > 0) {
          continue;
        }
        const tokens = buildSearchTokens(data);
        await updateDoc(d.ref, { searchTokens: tokens });
        updated++;
        if (processed >= maxDocs) break;
      }

      cursor = snap.docs[snap.docs.length - 1];
      if (!cursor) break;
    }

    return NextResponse.json({ ok: true, processed, updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Backfill failed' }, { status: 500 });
  }
}
