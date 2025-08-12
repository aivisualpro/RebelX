import { NextRequest, NextResponse } from 'next/server';
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * PATCH /api/sheet-tabs/[sheetTabId]
 * Allows updating:
 *  - selectedHeaders  (preferred going forward)
 *  - selectedColumns  (kept in sync for backward compatibility)
 *  - keyColumn
 *  - labelColumn      (optional, for display in foreign-key dropdowns)
 *
 * Also guarantees the keyColumn is included in selectedHeaders.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sheetTabId: string }> }
) {
  try {
    const { sheetTabId } = await params;
    if (!sheetTabId) {
      return NextResponse.json({ error: 'sheetTabId is required' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const {
      selectedHeaders,
      selectedColumns,
      keyColumn,
      labelColumn,
      columnDefinitions,
    }: {
      selectedHeaders?: string[];
      selectedColumns?: string[];
      keyColumn?: string;
      labelColumn?: string;
      columnDefinitions?: Record<string, any>;
    } = body || {};

    const tabRef = doc(db, 'sheetTabs', sheetTabId);
    const snap = await getDoc(tabRef);
    if (!snap.exists()) {
      return NextResponse.json({ error: 'Sheet tab not found' }, { status: 404 });
    }

    const current = snap.data() as any;
    const updates: Record<string, any> = {};

    // Normalize headers: prefer selectedHeaders from body, else fall back to selectedColumns.
    let headers: string[] | undefined;

    if (Array.isArray(selectedHeaders)) {
      headers = selectedHeaders;
    } else if (Array.isArray(selectedColumns)) {
      headers = selectedColumns;
    }

    if (headers) {
      const clean = headers
        .map((h) => (typeof h === 'string' ? h.trim() : ''))
        .filter(Boolean);

      const finalKey =
        typeof keyColumn === 'string' && keyColumn.trim()
          ? keyColumn.trim()
          : (current.keyColumn as string | undefined);

      // Ensure keyColumn is part of the selected headers
      if (finalKey && !clean.includes(finalKey)) clean.push(finalKey);

      // Write both fields to keep old code working
      updates.selectedHeaders = clean;
      updates.selectedColumns = clean;

      // Optional: keep a consistent order field used by some UIs
      updates.headerOrder = clean;
    }

    if (typeof keyColumn === 'string' && keyColumn.trim()) {
      updates.keyColumn = keyColumn.trim();
    }

    if (typeof labelColumn === 'string') {
      // allow empty string to clear it if needed
      updates.labelColumn = labelColumn;
    }

    if (columnDefinitions && typeof columnDefinitions === 'object') {
      updates.columnDefinitions = columnDefinitions;
    }

    await updateDoc(tabRef, updates);

    return NextResponse.json({ success: true, updates });
  } catch (err) {
    console.error('Error updating sheet tab:', err);
    return NextResponse.json({ error: 'Failed to update sheet tab' }, { status: 500 });
  }
}

/**
 * DELETE /api/sheet-tabs/[sheetTabId]
 * Deletes the sheetTab doc and all docs from its target collection.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { sheetTabId: string } }
) {
  try {
    const { sheetTabId } = params;
    if (!sheetTabId) {
      return NextResponse.json({ error: 'sheetTabId is required' }, { status: 400 });
    }

    // 1) Read the tab to discover its collection
    const tabRef = doc(db, 'sheetTabs', sheetTabId);
    const snap = await getDoc(tabRef);
    if (!snap.exists()) {
      return NextResponse.json({ error: 'Sheet tab not found' }, { status: 404 });
    }

    const { collectionName } = snap.data() as any;

    // 2) Delete all docs in that collection (batched)
    let deletedRecordsCount = 0;
    if (collectionName) {
      const colRef = collection(db, collectionName);
      const all = await getDocs(colRef);

      deletedRecordsCount = all.docs.length;
      const BATCH_SIZE = 500;
      const batches = Math.ceil(all.docs.length / BATCH_SIZE);

      for (let i = 0; i < batches; i++) {
        const batch = writeBatch(db);
        const start = i * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, all.docs.length);
        for (let j = start; j < end; j++) batch.delete(all.docs[j].ref);
        await batch.commit();
      }
    }

    // 3) Delete the sheetTab doc
    await deleteDoc(tabRef);

    return NextResponse.json({
      success: true,
      deletedRecords: deletedRecordsCount,
      collectionName,
    });
  } catch (err) {
    console.error('Error deleting sheet tab:', err);
    return NextResponse.json(
      { error: 'Failed to delete sheet tab' },
      { status: 500 }
    );
  }
}
