import { NextRequest, NextResponse } from 'next/server';
import {
  collection,
  doc,
  getDoc,
  getCountFromServer,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  where,
  serverTimestamp,
  setDoc,
  startAfter,
  addDoc,
  updateDoc,
  deleteDoc,
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

// Build an indexed token set for fast search. Takes string fields, splits into words,
// and adds lowercased prefixes (2..10 chars) for each token.
function buildSearchTokens(record: Record<string, any>): string[] {
  const out = new Set<string>();
  const pushToken = (t: string) => {
    const s = t.trim().toLowerCase();
    if (!s) return;
    // add full token and prefixes
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
  return Array.from(out).slice(0, 2000); // cap to avoid oversized docs
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

/** GET /api/sheet-tabs/[sheetTabId]/records?page=&limit=&search=&sortBy=&sortOrder= */
export async function GET(request: NextRequest, { params }: { params: Promise<{ sheetTabId: string }> }) {
  try {
    const { sheetTabId } = await params;
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limitNum = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '25', 10)));
    const search = (url.searchParams.get('search') || '').trim();
    const sortBy = sanitize(url.searchParams.get('sortBy') || '');
    const sortOrder = (url.searchParams.get('sortOrder') || 'asc') === 'desc' ? 'desc' : 'asc';

    const { collectionName, keyField } = await getCollectionInfo(sheetTabId);
    const colRef = collection(db, collectionName);

    // Count total
    const totalSnap = await getCountFromServer(query(colRef));
    const total = totalSnap.data().count || 0;

    // Build base query
    let orderField = sortBy || keyField;
    let qBase = query(colRef, orderBy(orderField, sortOrder), fbLimit(limitNum));

    // Parse filters (format: filter=Column:Value) for server-side narrowing
    const filterParams = url.searchParams.getAll('filter');
    const parsedFilters: Array<{ field: string; value: string }> = [];
    for (const f of filterParams) {
      const idx = f.indexOf(':');
      if (idx > 0) {
        const human = f.slice(0, idx);
        const val = f.slice(idx + 1);
        const field = sanitize(human);
        if (val) parsedFilters.push({ field, value: val });
      }
    }

    // If searching, try FAST path using searchTokens index. Fallback to scan if not present.
    if (search) {
      const searchLower = search.toLowerCase();
      const firstTerm = searchLower.split(/\s+/g).filter(Boolean)[0] || searchLower;

      try {
        // Fast path: use array-contains-any on searchTokens with first term and its prefixes (2..10)
        const prefixes: string[] = [];
        for (let i = 2; i <= Math.min(10, firstTerm.length); i++) {
          prefixes.push(firstTerm.slice(0, i));
        }
        const candidates: any[] = [];
        // Firestore supports up to 10 values in array-contains-any
        const tokensBatch = prefixes.slice(0, 10);
        if (tokensBatch.length) {
          // Note: requires an index on searchTokens (array)
          const qFast = query(colRef, where('searchTokens', 'array-contains-any', tokensBatch), fbLimit(limitNum * 10));
          const fastSnap = await getDocs(qFast);
          fastSnap.forEach((d) => candidates.push({ id: d.id, ...d.data() }));

          // If no candidates (e.g., tokens missing), fall back to scan
          if (candidates.length === 0) {
            // continue to fallback below
          } else {
            // Apply filters and full-term check on candidates
            let records = candidates.filter((record) => {
              const passesFilters = parsedFilters.every(({ field, value }) => {
                const v = (record as any)[field];
                if (v == null) return false;
                if (typeof v === 'string') return v.toLowerCase().includes(value.toLowerCase());
                if (typeof v === 'number') return String(v).includes(value);
                return false;
              });
              if (!passesFilters) return false;
              return Object.values(record).some((v: any) => {
                if (typeof v === 'string') return v.toLowerCase().includes(searchLower);
                if (typeof v === 'number') return String(v).includes(searchLower);
                return false;
              });
            });

            const total = records.length;
            const start = (page - 1) * limitNum;
            const end = Math.min(start + limitNum, total);
            const pageSlice = start < total ? records.slice(start, end) : [];
            return NextResponse.json({ total, records: pageSlice });
          }
        }
      } catch (e) {
        // If searchTokens or index missing, fall back to scan
      }

      // Fallback: scan the collection in batches server-side
      const matches: any[] = [];
      const pageSize = 1000;
      const maxScans = 100000; // safety cap on scanned docs
      let scanned = 0;
      let cursor: any = null;

      while (true) {
        let qScan = query(colRef, orderBy(orderField, sortOrder), fbLimit(pageSize));
        if (cursor) qScan = query(colRef, orderBy(orderField, sortOrder), startAfter(cursor), fbLimit(pageSize));
        const batch = await getDocs(qScan);
        if (batch.empty) break;

        for (const d of batch.docs) {
          scanned++;
          const record: any = { id: d.id, ...d.data() };

          // Apply filters first (exact or includes match on primitive types)
          const passesFilters = parsedFilters.every(({ field, value }) => {
            const v = record[field];
            if (v == null) return false;
            if (typeof v === 'string') return v.toLowerCase().includes(value.toLowerCase());
            if (typeof v === 'number') return String(v).includes(value);
            return false;
          });
          if (!passesFilters) continue;

          // Full record contains search
          const has = Object.values(record).some((v: any) => {
            if (typeof v === 'string') return v.toLowerCase().includes(searchLower);
            if (typeof v === 'number') return String(v).includes(searchLower);
            return false;
          });
          if (has) matches.push(record);
        }

        cursor = batch.docs[batch.docs.length - 1];
        if (!cursor) break;
        if (scanned >= maxScans) break;
        // Optional: early stop if we already have enough for several pages
        if (matches.length >= limitNum * 10) {
          // Keep scanning a bit more if batch not empty to avoid bias, else break
          continue;
        }
      }

      // Paginate matches server-side
      const total = matches.length;
      const start = (page - 1) * limitNum;
      const end = Math.min(start + limitNum, total);
      const pageSlice = start < total ? matches.slice(start, end) : [];
      return NextResponse.json({ total, records: pageSlice });
    }

    // Pagination via cursor
    if (!search && page > 1) {
      const prevQ = query(colRef, orderBy(orderField, sortOrder), fbLimit((page - 1) * limitNum));
      const prevSnap = await getDocs(prevQ);
      const last = prevSnap.docs[prevSnap.docs.length - 1];
      if (last) {
        qBase = query(colRef, orderBy(orderField, sortOrder), startAfter(last), fbLimit(limitNum));
      }
    }

    const snap = await getDocs(qBase);
    let records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Apply filters in non-search path (server-side)
    if (parsedFilters.length) {
      records = records.filter((record) =>
        parsedFilters.every(({ field, value }) => {
          const v = (record as any)[field];
          if (v == null) return false;
          if (typeof v === 'string') return v.toLowerCase().includes(value.toLowerCase());
          if (typeof v === 'number') return String(v).includes(value);
          return false;
        })
      );
    }

    return NextResponse.json({ total, records });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch sheet tab records' },
      { status: 500 }
    );
  }
}

/** POST /api/sheet-tabs/[sheetTabId]/records  body: { data: {...} } */
export async function POST(request: NextRequest, { params }: { params: Promise<{ sheetTabId: string }> }) {
  try {
    const { sheetTabId } = await params;
    const body = await request.json().catch(() => ({}));
    const payload = (body?.data || {}) as Record<string, any>;

    const { collectionName, keyField } = await getCollectionInfo(sheetTabId);
    const colRef = collection(db, collectionName);

    const providedKey =
      typeof payload[keyField] === 'string' && payload[keyField].trim().length > 0
        ? sanitize(payload[keyField])
        : '';

    // Build/attach searchTokens for fast indexed search
    const withTokens = { ...payload, searchTokens: buildSearchTokens(payload) };

    if (providedKey) {
      const docRef = doc(colRef, providedKey);
      await setDoc(
        docRef,
        { ...withTokens, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
        { merge: true }
      );
      return NextResponse.json({ ok: true, id: docRef.id });
    } else {
      const newRef = await addDoc(colRef, {
        ...withTokens,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return NextResponse.json({ ok: true, id: newRef.id });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Create failed' }, { status: 500 });
  }
}

/** PATCH /api/sheet-tabs/[sheetTabId]/records?id=RECORD_ID  body: { data: {...} } */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ sheetTabId: string }> }) {
  try {
    const { sheetTabId } = await params;
    const url = new URL(request.url);
    const recordId = url.searchParams.get('id');
    if (!recordId) return NextResponse.json({ error: 'id query param required' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const payload = (body?.data || {}) as Record<string, any>;

    const { collectionName } = await getCollectionInfo(sheetTabId);
    const docRef = doc(collection(db, collectionName), recordId);
    const existingSnap = await getDoc(docRef);
    const existing = existingSnap.exists() ? (existingSnap.data() as any) : {};
    const merged = { ...existing, ...payload };
    const withTokens = { ...payload, searchTokens: buildSearchTokens(merged) };
    await updateDoc(docRef, { ...withTokens, updatedAt: serverTimestamp() });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Update failed' }, { status: 500 });
  }
}

/** DELETE /api/sheet-tabs/[sheetTabId]/records?id=RECORD_ID */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ sheetTabId: string }> }) {
  try {
    const { sheetTabId } = await params;
    const url = new URL(request.url);
    const recordId = url.searchParams.get('id');
    if (!recordId) return NextResponse.json({ error: 'id query param required' }, { status: 400 });

    const { collectionName } = await getCollectionInfo(sheetTabId);
    const docRef = doc(collection(db, collectionName), recordId);
    await deleteDoc(docRef);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Delete failed' }, { status: 500 });
  }
}
