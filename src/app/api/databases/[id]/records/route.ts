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
  serverTimestamp,
  setDoc,
  startAfter,
  addDoc,
  updateDoc,
  deleteDoc,
  where,
  startAt,
  endAt,
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

/** GET /api/databases/[id]/records?page=&limit=&search=&sortBy=&sortOrder= */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limitNum = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '25', 10)));
    const search = (url.searchParams.get('search') || '').trim();
    const sortBy = sanitize(url.searchParams.get('sortBy') || '');
    const sortOrder = (url.searchParams.get('sortOrder') || 'asc') === 'desc' ? 'desc' : 'asc';

    const { collectionName, keyField } = await getCollectionInfo(id);
    const colRef = collection(db, collectionName);

    // Count total (fast server aggregation)
    const totalSnap = await getCountFromServer(query(colRef));
    const total = totalSnap.data().count || 0;

    // Build base query
    let orderField = sortBy || keyField;
    let qBase = query(colRef, orderBy(orderField, sortOrder), fbLimit(limitNum));

    // If searching, we need to fetch more records and filter client-side
    // since Firestore doesn't support full-text search across multiple fields
    let searchLimit = limitNum;
    if (search) {
      // Increase limit when searching to account for client-side filtering
      searchLimit = Math.min(1000, limitNum * 10);
      qBase = query(colRef, orderBy(orderField, sortOrder), fbLimit(searchLimit));
    }

    // Pagination via cursor (compute cursor by reading previous page window)
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

    // Client-side filtering for search across all fields
    if (search) {
      const searchLower = search.toLowerCase();
      records = records.filter((record) => {
        // Search across all string fields in the record
        return Object.values(record).some((value: any) => {
          if (typeof value === 'string') {
            return value.toLowerCase().includes(searchLower);
          }
          if (typeof value === 'number') {
            return value.toString().includes(searchLower);
          }
          return false;
        });
      });

      // Limit results after filtering
      records = records.slice(0, limitNum);
    }

    return NextResponse.json({ total: search ? records.length : total, records });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch records' }, { status: 500 });
  }
}

/** POST /api/databases/[id]/records  body: { data: {...} } */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const payload = (body?.data || {}) as Record<string, any>;

    const { collectionName, keyField } = await getCollectionInfo(id);
    const colRef = collection(db, collectionName);

    const providedKey =
      typeof payload[keyField] === 'string' && payload[keyField].trim().length > 0
        ? sanitize(payload[keyField])
        : '';

    if (providedKey) {
      const docRef = doc(colRef, providedKey);
      await setDoc(
        docRef,
        { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
        { merge: true }
      );
      return NextResponse.json({ ok: true, id: docRef.id });
    } else {
      const newRef = await addDoc(colRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return NextResponse.json({ ok: true, id: newRef.id });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Create failed' }, { status: 500 });
  }
}

/** PATCH /api/databases/[id]/records?id=RECORD_ID  body: { data: {...} } */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const recordId = url.searchParams.get('id');
    if (!recordId) return NextResponse.json({ error: 'id query param required' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const payload = (body?.data || {}) as Record<string, any>;

    const { collectionName } = await getCollectionInfo(id);
    const docRef = doc(collection(db, collectionName), recordId);
    await updateDoc(docRef, { ...payload, updatedAt: serverTimestamp() });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Update failed' }, { status: 500 });
  }
}

/** DELETE /api/databases/[id]/records?id=RECORD_ID */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const recordId = url.searchParams.get('id');
    if (!recordId) return NextResponse.json({ error: 'id query param required' }, { status: 400 });

    const { collectionName } = await getCollectionInfo(id);
    const docRef = doc(collection(db, collectionName), recordId);
    await deleteDoc(docRef);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Delete failed' }, { status: 500 });
  }
}
