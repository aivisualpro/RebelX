// src/app/api/sheet-tabs/[sheetTabId]/sync/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  collection,
  doc,
  getDoc,
  writeBatch,
  updateDoc,
  Timestamp,
  Firestore,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { google } from 'googleapis';
import { upsertBatchWithCounters, UpsertRow } from '@/lib/upsert-with-counters';

/* ---------------------------- helpers / utilities --------------------------- */

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Optimized backoff wrapper for Sheets read with shorter delays.
 * Returns the 2D array of values (rows).
 */
async function getSheetValuesWithRetry(opts: {
  sheets: any; // google.sheets('v4') client
  spreadsheetId: string;
  range: string;
  quotaUser?: string;
  maxAttempts?: number; // default 3 (reduced from 5)
}) {
  const { sheets, spreadsheetId, range, quotaUser, maxAttempts = 3 } = opts;

  let attempt = 0;
  // Optimized backoff: ~1s, 3s, 6s (much shorter than before)
  while (true) {
    try {
      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        quotaUser,
        // Add request options to reduce quota usage
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
      });
      return resp?.data?.values || [];
    } catch (err: any) {
      const code = err?.code || err?.response?.status;
      const msg = String(err?.message || '');

      const isQuota =
        code === 429 ||
        code === 403 ||
        msg.toLowerCase().includes('quota') ||
        msg.toLowerCase().includes('user rate limit') ||
        msg.toLowerCase().includes('rate');

      attempt++;

      if (isQuota && attempt < maxAttempts) {
        // Shorter, linear backoff: 1s, 3s, 6s instead of exponential
        const delay = Math.min(6000, 1000 + (attempt * 2000) + Math.random() * 500);
        console.warn(
          `[Sheets quota] Attempt ${attempt}/${maxAttempts} failed – retrying in ~${Math.round(
            delay
          )}ms`
        );
        await sleep(delay);
        continue;
      }

      // Better error handling for quota exhaustion
      if (isQuota) {
        console.error(`[Sheets quota] Exhausted after ${maxAttempts} attempts. Consider reducing sync frequency.`);
        throw new Error(`Google Sheets quota exhausted. Please try again in a few minutes.`);
      }

      throw err; // give up
    }
  }
}

function sanitizeFieldName(input: string) {
  return input
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function sanitizeDocId(input: string) {
  const s = input
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return s.slice(0, 1500); // Firestore doc id hard cap
}

/* ----------------------------------- POST ---------------------------------- */
/**
 * Start a sync for a given sheetTabId.
 * - Reads sheetTabs/{sheetTabId} to get: sheetName, collectionName, keyColumn, selected headers
 * - Reads Google Sheet (with backoff/throttle)
 * - Writes to Firestore in batches of 500
 * - Updates sheetTabs/{sheetTabId} with progress so the client can subscribe
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sheetTabId: string }> }
) {
  const { sheetTabId } = await params;

  if (!db || !(db instanceof Firestore)) {
    console.error('Invalid Firestore instance');
    return NextResponse.json({ error: 'Server DB not ready' }, { status: 500 });
  }

  if (!sheetTabId) {
    return NextResponse.json({ error: 'sheetTabId is required' }, { status: 400 });
  }

  const sheetTabRef = doc(db, 'sheetTabs', sheetTabId);
  const startAt = Date.now();

  // Check if sync should be cancelled before starting
  const currentDoc = await getDoc(sheetTabRef);
  const currentData = currentDoc.data();
  if (currentData?.syncStatus === 'cancelled') {
    return NextResponse.json({ message: 'Sync was cancelled' }, { status: 200 });
  }

  // Mark as running
  try {
    await updateDoc(sheetTabRef, {
      syncStatus: 'running',
      lastSyncAt: Timestamp.now(),
      processed: 0,
      created: 0,
      updated: 0,
      skippedRowCount: 0,
      lastBatchIndex: 0,
      total: 0,
      elapsedMs: 0,
      etaMs: null,
      lastError: null,
    });
  } catch (e) {
    // non-fatal
    console.warn('Could not set running status:', e);
  }

  try {
    /* --------------------------- load tab configuration -------------------------- */
    const tabSnap = await getDoc(sheetTabRef);
    if (!tabSnap.exists()) {
      return NextResponse.json({ error: 'Sheet tab not found' }, { status: 404 });
    }

    const tab = tabSnap.data() as any;
    const sheetName: string = tab.sheetName || tab.tabName;
    const collectionName: string = tab.collectionName;
    const keyColumn: string = tab.keyColumn;
    const selectedHeaders: string[] =
      Array.isArray(tab.selectedHeaders) && tab.selectedHeaders.length > 0
        ? tab.selectedHeaders
        : Array.isArray(tab.selectedColumns) && tab.selectedColumns.length > 0
        ? tab.selectedColumns
        : [];

    if (!sheetName || !collectionName || !keyColumn) {
      return NextResponse.json(
        { error: 'Invalid config: sheetName, collectionName, keyColumn are required' },
        { status: 400 }
      );
    }

    /* -------------------------- create sheets api client ------------------------- */
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const keyEnv = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

    if (!spreadsheetId || !keyEnv) {
      return NextResponse.json(
        { error: 'Google Sheets env vars not set' },
        { status: 500 }
      );
    }

    let credentials: any;
    try {
      credentials = JSON.parse(keyEnv);
    } catch (e) {
      console.error('Bad GOOGLE_SERVICE_ACCOUNT_KEY JSON:', e);
      return NextResponse.json(
        { error: 'Invalid GOOGLE_SERVICE_ACCOUNT_KEY' },
        { status: 500 }
      );
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ 
      version: 'v4', 
      auth,
      // Add quota management options
      params: {
        quotaUser: `sync_${sheetTabId.slice(0, 40)}`, // Distribute quota per sync
      }
    });

    /* ------------------------------- read the sheet ------------------------------ */
    // Optimize range - read only what we need instead of entire sheet
    // Use a much larger range to capture all records (1M rows should be sufficient for most use cases)
    const range = selectedHeaders.length > 0 
      ? `${sheetName}!A1:${String.fromCharCode(65 + Math.max(25, selectedHeaders.length + 5))}1000000`
      : `${sheetName}!A1:Z1000000`; // Increased back to 1M rows to capture all records

    let rows: any[] = [];
    try {
      console.log(`[Sync] Reading sheet range: ${range}`);
      rows = await getSheetValuesWithRetry({
        sheets,
        spreadsheetId,
        range,
        quotaUser: `sync_${sheetTabId.slice(0, 40)}`, // helps distribute per-user minute quota
        maxAttempts: 3, // Reduced from 5 to fail faster
      });
    } catch (error: any) {
      console.error('Error reading sheet:', error);

      // Update status with error
      try {
        await updateDoc(sheetTabRef, {
          syncStatus: 'error',
          lastError: String(error?.message || ''),
          elapsedMs: Date.now() - startAt,
          // Add quota-specific error handling
          isQuotaError: String(error?.message || '').toLowerCase().includes('quota') || String(error?.message || '').toLowerCase().includes('rate'),
        });
      } catch (updateErr) {
        console.warn('Could not update error status:', updateErr);
      }

      // Return more specific error codes for quota issues
      const isQuotaError = String(error?.message || '').toLowerCase().includes('quota') || String(error?.message || '').toLowerCase().includes('rate');
      return NextResponse.json(
        { 
          error: isQuotaError ? 'Google Sheets quota exceeded. Please try again in a few minutes.' : String(error?.message || ''),
          isQuotaError 
        }, 
        { status: isQuotaError ? 429 : 500 }
      );
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      await updateDoc(sheetTabRef, {
        syncStatus: 'completed',
        total: 0,
        processed: 0,
        created: 0,
        updated: 0,
        skippedRowCount: 0,
        elapsedMs: Date.now() - startAt,
        etaMs: 0,
        lastError: null,
      });

      return NextResponse.json({
        success: true,
        message: 'No data found in sheet',
        syncedCount: 0,
        errorCount: 0,
        skippedCount: 0,
        totalRecords: 0,
      });
    }

    const headers = rows[0] as string[];
    const dataRows = rows.slice(1);

    // Map selected headers → indices (fallback to all headers if none selected)
    const effectiveHeaders =
      Array.isArray(selectedHeaders) && selectedHeaders.length > 0
        ? selectedHeaders
        : headers.filter(Boolean);

    const headerIndexMap: Record<string, number> = {};
    headers.forEach((h, i) => {
      if (typeof h === 'string' && h.trim()) {
        headerIndexMap[h.trim().toLowerCase()] = i;
      }
    });

    const selectedIndices = effectiveHeaders
      .map((h) => headerIndexMap[h?.toString().trim().toLowerCase()])
      .filter((i) => Number.isInteger(i));

    // locate key column index
    const keyIndex =
      headerIndexMap[keyColumn?.toString().trim().toLowerCase() as string] ?? -1;

    if (keyIndex < 0) {
      return NextResponse.json(
        { error: `Key column '${keyColumn}' not found in sheet headers` },
        { status: 400 }
      );
    }

    // Progress scaffold
    const total = dataRows.length;
    let processed = 0;
    let created = 0; // we don't distinguish created vs updated to avoid extra reads
    let updated = 0;
    let skipped = 0;

    await updateDoc(sheetTabRef, {
      syncStatus: 'running',
      total,
      processed,
      created,
      updated,
      skippedRowCount: skipped,
      lastBatchIndex: 0,
      elapsedMs: 0,
      etaMs: null,
      lastError: null,
    });

    /* ------------------------------- prepare upsert data ------------------------------- */
    const targetCol = collection(db, collectionName);
    const upsertRows: UpsertRow[] = [];

    // Process all rows and prepare upsert data
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      if (!row || row.length === 0) {
        skipped++;
        continue;
      }

      // key value
      const rawKey = row[keyIndex];
      if (rawKey === undefined || rawKey === null || String(rawKey).trim() === '') {
        skipped++;
        continue;
      }

      const docId = sanitizeDocId(String(rawKey));
      if (!docId) {
        skipped++;
        continue;
      }

      const documentData: Record<string, any> = {
        _syncedAt: Timestamp.now(),
      };

      // copy only selected columns (sanitized field names)
      selectedIndices.forEach((colIdx) => {
        if (colIdx < 0 || colIdx >= headers.length) return;
        const headerName = headers[colIdx];
        if (!headerName) return;

        const fieldName = sanitizeFieldName(String(headerName));
        const value = row[colIdx] ?? '';
        documentData[fieldName] = typeof value === 'string' ? value.trim() : String(value);
      });

      // Only add to upsert if we actually have fields (besides _syncedAt)
      if (Object.keys(documentData).length > 1) {
        upsertRows.push({
          id: docId,
          data: documentData,
        });
      } else {
        skipped++;
      }
    }

    /* ------------------------------- upsert with proper counters ------------------------------- */
    const { created: actualCreated, updated: actualUpdated } = await upsertBatchWithCounters(
      targetCol,
      upsertRows,
      async (progress) => {
        // Check for cancellation before updating progress
        try {
          const currentDoc = await getDoc(sheetTabRef);
          const currentData = currentDoc.data();
          if (currentData?.syncStatus === 'cancelled') {
            throw new Error('Sync cancelled by user');
          }
        } catch (error) {
          if (error instanceof Error && error.message === 'Sync cancelled by user') {
            throw error;
          }
          // Ignore other errors during cancellation check
        }

        // Update progress in real-time
        const elapsedMs = Date.now() - startAt;
        const rps = elapsedMs > 0 ? progress.processed / (elapsedMs / 1000) : 0;
        const remaining = Math.max(0, upsertRows.length - progress.processed);
        const etaMs = rps > 0 ? Math.round((remaining / rps) * 1000) : null;

        updateDoc(sheetTabRef, {
          processed: progress.processed,
          created: progress.created,
          updated: progress.updated,
          skippedRowCount: skipped,
          elapsedMs,
          etaMs,
          syncStatus: 'running',
        }).catch(console.warn); // Don't block on progress updates
      }
    );

    // Final counts
    created = actualCreated;
    updated = actualUpdated;
    processed = upsertRows.length;

    // done
    await updateDoc(sheetTabRef, {
      syncStatus: skipped > 0 ? 'completed_with_warnings' : 'completed',
      lastSyncAt: Timestamp.now(),
      recordCount: processed,
      elapsedMs: Date.now() - startAt,
      etaMs: 0,
      lastError: null,
      originalHeaders: headers,
      selectedHeaders: effectiveHeaders,
      headerOrder: effectiveHeaders.map(sanitizeFieldName),
    });

    return NextResponse.json({
      success: true,
      message:
        skipped > 0
          ? `Synced ${processed} records with ${skipped} skipped rows`
          : `Synced ${processed} records`,
      syncedCount: processed,
      skippedCount: skipped,
      errorCount: 0,
      totalRecords: total,
    });
  } catch (error: any) {
    const msg = String(error?.message || '');
    const isQuota =
      error?.code === 429 ||
      error?.code === 403 ||
      msg.toLowerCase().includes('quota') ||
      msg.toLowerCase().includes('rate');

    // best-effort progress update
    try {
      await updateDoc(doc(db, 'sheetTabs', sheetTabId), {
        syncStatus: isQuota ? 'throttled' : 'failed',
        lastError: msg,
        elapsedMs: Date.now() - startAt,
        etaMs: null,
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json(
      {
        error: 'Failed to sync sheet tab',
        details: msg,
        retryAfterMs: isQuota ? 60000 : undefined,
      },
      { status: isQuota ? 429 : 500 }
    );
  }
}

/* ----------------------------------- DELETE ---------------------------------- */
/**
 * Cancel a running sync for a given sheetTabId.
 * Sets the syncStatus to 'cancelled' which will stop the sync process.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sheetTabId: string }> }
) {
  const { sheetTabId } = await params;

  if (!db || !(db instanceof Firestore)) {
    console.error('Invalid Firestore instance');
    return NextResponse.json({ error: 'Server DB not ready' }, { status: 500 });
  }

  if (!sheetTabId) {
    return NextResponse.json({ error: 'sheetTabId is required' }, { status: 400 });
  }

  try {
    const sheetTabRef = doc(db, 'sheetTabs', sheetTabId);
    
    // Check current status
    const currentDoc = await getDoc(sheetTabRef);
    const currentData = currentDoc.data();
    
    if (!currentData) {
      return NextResponse.json({ error: 'Sheet tab not found' }, { status: 404 });
    }

    // Only cancel if sync is running
    if (currentData.syncStatus === 'running' || currentData.syncStatus === 'initializing') {
      await updateDoc(sheetTabRef, {
        syncStatus: 'cancelled',
        lastError: 'Sync cancelled by user',
        elapsedMs: Date.now() - (currentData.lastSyncAt?.toMillis() || Date.now()),
        etaMs: null,
      });

      return NextResponse.json({
        success: true,
        message: 'Sync cancelled successfully',
      });
    } else {
      return NextResponse.json({
        success: false,
        message: `Cannot cancel sync with status: ${currentData.syncStatus}`,
      });
    }
  } catch (error: any) {
    console.error('Error cancelling sync:', error);
    return NextResponse.json(
      {
        error: 'Failed to cancel sync',
        details: error?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
