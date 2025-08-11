// /src/app/api/sheet-tabs/[sheetTabId]/sync/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  writeBatch,
  Timestamp,
  query,
  limit
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { google } from 'googleapis';

export const runtime = 'nodejs';

// ---- config ----
// If true, we check existence per doc (extra reads) to separate created/updated.
// For very large syncs, set to false to avoid extra reads.
const COUNT_CREATES_UPDATES = true;
const BATCH_SIZE = 500;

// ---- helpers ----
export function sanitizeHeaderForFirestore(header: string): string {
  try {
    return (header ?? '')
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  } catch {
    return 'field_unknown';
  }
}

function sanitizeId(value: unknown): string {
  let s = `${value ?? ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (s.length > 1500) s = s.slice(0, 1500);
  return s;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sheetTabId: string }> }
) {
  const { sheetTabId } = await params; // <-- important in Next 15

  try {
    if (!sheetTabId) {
      return NextResponse.json({ error: 'Sheet tab ID is required' }, { status: 400 });
    }

    // --- Load sheetTab config ---
    const sheetTabRef = doc(db, 'sheetTabs', sheetTabId);
    const sheetTabSnap = await getDoc(sheetTabRef);
    if (!sheetTabSnap.exists()) {
      return NextResponse.json({ error: `Sheet tab '${sheetTabId}' not found` }, { status: 404 });
    }
    const cfg = { id: sheetTabSnap.id, ...sheetTabSnap.data() } as any;

    const sheetName = (cfg.sheetName ?? '').toString().trim();
    const collectionName = (cfg.collectionName ?? '').toString().trim();
    const keyColumn = (cfg.keyColumn ?? '').toString().trim();
    const selectedColumns: string[] = Array.isArray(cfg.selectedHeaders) ? cfg.selectedHeaders : [];

    if (!sheetName || !collectionName || !keyColumn || selectedColumns.length === 0) {
      return NextResponse.json(
        { error: 'Invalid config: sheetName, collectionName, keyColumn, selectedHeaders are required' },
        { status: 400 }
      );
    }

    // --- Google Sheets auth ---
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const serviceAccountKeyEnv = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!spreadsheetId || !serviceAccountKeyEnv) {
      return NextResponse.json(
        { error: 'Missing GOOGLE_SPREADSHEET_ID or GOOGLE_SERVICE_ACCOUNT_KEY' },
        { status: 500 }
      );
    }

    let credentials: any;
    try {
      credentials = JSON.parse(serviceAccountKeyEnv);
      if (!credentials.client_email || !credentials.private_key) {
        return NextResponse.json({ error: 'Invalid service account key' }, { status: 500 });
      }
    } catch {
      return NextResponse.json({ error: 'Failed to parse service account key' }, { status: 500 });
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // --- Read sheet rows ---
    const range = `${sheetName}!A1:Z1000000`;
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = resp.data.values ?? [];
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No data found in sheet' }, { status: 400 });
    }

    const headers = rows[0] as string[];
    const dataRows = rows.slice(1);

    const keyIdx = headers.findIndex(
      (h) => (h ?? '').toString().toLowerCase() === keyColumn.toLowerCase()
    );
    if (keyIdx === -1) {
      return NextResponse.json(
        { error: `Key column '${keyColumn}' not found in headers` },
        { status: 400 }
      );
    }

    const selectedIdx = selectedColumns
      .map((c) => headers.findIndex((h) => (h ?? '').toString().toLowerCase() === c.toLowerCase()))
      .filter((i) => i !== -1);

    if (selectedIdx.length === 0) {
      return NextResponse.json({ error: 'None of the selected columns exist' }, { status: 400 });
    }

    // --- Build docs to write ---
    const targetColRef = collection(db, collectionName);

    type RowDoc = { id: string; data: Record<string, any> };
    const validRows: RowDoc[] = [];
    let skipped = 0;
    const skippedRows: string[] = [];

    for (let r = 0; r < dataRows.length; r++) {
      const row = dataRows[r] ?? [];
      const keyVal = row[keyIdx];
      if (keyVal === undefined || keyVal === null || `${keyVal}`.trim() === '') {
        skipped++;
        skippedRows.push(`Row ${r + 2}: empty key`);
        continue;
      }
      const id = sanitizeId(keyVal);
      if (!id) {
        skipped++;
        skippedRows.push(`Row ${r + 2}: invalid key after sanitize`);
        continue;
      }
      const docData: Record<string, any> = { syncedAt: new Date().toISOString() };
      for (const i of selectedIdx) {
        const headerName = headers[i];
        const field = sanitizeHeaderForFirestore(headerName);
        docData[field] = row[i] ?? '';
      }
      if (Object.keys(docData).length > 1) validRows.push({ id, data: docData });
      else {
        skipped++;
        skippedRows.push(`Row ${r + 2}: no usable fields`);
      }
    }

    const total = validRows.length;
    const startedAt = Date.now();
    let processed = 0;
    let created = 0;
    let updated = 0;

    // mark start
    await updateDoc(sheetTabRef, {
      syncStatus: 'running',
      progress: total === 0 ? 100 : 0,
      total,
      processed,
      created,
      updated,
      skippedRowCount: skipped,
      lastSyncSkipped: skippedRows.slice(0, 10),
      startedAt: Timestamp.fromMillis(startedAt),
      etaMs: 0,
      elapsedMs: 0
    });

    // (optional) quick smoke read to check access to collection (avoids silent perms issues)
    // await getDocs(query(targetColRef, limit(1)));

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const slice = validRows.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);

      let sliceCreated = 0;
      let sliceUpdated = 0;

      if (COUNT_CREATES_UPDATES) {
        // Check existence for this slice (parallel reads)
        const existence = await Promise.all(
          slice.map((item) => getDoc(doc(targetColRef, item.id)))
        );
        existence.forEach((snap, idx) => {
          const item = slice[idx];
          // We still use set(..., { merge: true }) to be idempotent
          batch.set(doc(targetColRef, item.id), item.data, { merge: true });
          if (snap.exists()) sliceUpdated++;
          else sliceCreated++;
        });
      } else {
        // No per-doc read; just write and don't split created/updated
        for (const item of slice) {
          batch.set(doc(targetColRef, item.id), item.data, { merge: true });
        }
      }

      await batch.commit();

      processed += slice.length;
      if (COUNT_CREATES_UPDATES) {
        created += sliceCreated;
        updated += sliceUpdated;
      }

      const elapsed = Date.now() - startedAt; // ms
      const rate = processed / Math.max(elapsed, 1); // rows per ms
      const remaining = total - processed;
      const etaMs = remaining / Math.max(rate, 0.000001);

      await updateDoc(sheetTabRef, {
        syncStatus: 'running',
        progress: Math.round((processed / Math.max(total, 1)) * 100),
        total,
        processed,
        created,
        updated,
        skippedRowCount: skipped,
        lastBatchIndex: Math.floor(i / BATCH_SIZE) + 1,
        elapsedMs: elapsed,
        etaMs: Math.max(0, Math.round(etaMs))
      });
    }

    // done
    const finalStatus = skipped > 0 ? 'completed_with_warnings' : 'completed';
    await updateDoc(sheetTabRef, {
      lastSyncAt: Timestamp.now(),
      recordCount: processed,
      syncStatus: finalStatus,
      originalHeaders: headers,
      selectedHeaders: selectedColumns,
      headerOrder: selectedColumns.map(sanitizeHeaderForFirestore).filter(Boolean)
    });

    return NextResponse.json({
      success: true,
      message:
        skipped > 0
          ? `Synced ${processed} records (${skipped} skipped)`
          : `Synced ${processed} records`,
      syncedCount: processed,
      created,
      updated,
      skippedCount: skipped,
      collectionName,
      sheetName
    });
  } catch (err: any) {
    // try to reflect failure in doc
    try {
      const { sheetTabId: sid } = await params;
      if (sid) {
        await updateDoc(doc(db, 'sheetTabs', sid), {
          syncStatus: 'failed',
          lastSyncAt: Timestamp.now(),
          lastSyncErrors: [err?.message ?? String(err)]
        });
      }
    } catch {
      // ignore
    }
    return NextResponse.json(
      { error: 'Failed to sync sheet tab', details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
