import { NextRequest, NextResponse } from 'next/server';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * POST /api/sheet-tabs
 * Creates/merges sheet tab configs in top-level `sheetTabs` collection.
 * Doc id = collectionName. Persists keyColumn, labelColumn (optional), selectedColumns.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sheetTabs: sheetTabData, createdBy } = body;

    const clientId = body.clientId || 'default';
    const connectionId = body.connectionId || 'default';

    if (!sheetTabData || !createdBy) {
      return NextResponse.json(
        { error: 'Missing required fields: sheetTabs and createdBy are required' },
        { status: 400 }
      );
    }
    if (!Array.isArray(sheetTabData) || sheetTabData.length === 0) {
      return NextResponse.json({ error: 'No sheet tabs to create' }, { status: 400 });
    }

    const collectionsCreated: Array<{
      id: string;
      sheetName: string;
      collectionName: string;
    }> = [];

    for (const sheetTab of sheetTabData) {
      if (!sheetTab.keyColumn || !sheetTab.sheetName) {
        return NextResponse.json(
          { error: `Missing keyColumn or sheetName for sheet: ${sheetTab.sheetName || 'unknown'}` },
          { status: 400 }
        );
      }

      const collectionName =
        sheetTab.collectionName ||
        sheetTab.sheetName.toLowerCase().replace(/\s+/g, '_');

      // normalize + ensure key column included
      const incomingSelected: string[] = Array.isArray(sheetTab.selectedColumns)
        ? sheetTab.selectedColumns.filter(
            (c: unknown) => typeof c === 'string' && c.trim().length > 0
          )
        : [];
      const selectedColumnsSet = new Set(incomingSelected.map((c) => c.toString()));
      if (!selectedColumnsSet.has(sheetTab.keyColumn)) {
        selectedColumnsSet.add(sheetTab.keyColumn);
      }

      const labelColumn =
        typeof sheetTab.labelColumn === 'string' && sheetTab.labelColumn.trim().length
          ? sheetTab.labelColumn
          : null;

      // sanitize columnDefinitions (optional object of per-column settings)
      const columnDefinitions =
        sheetTab.columnDefinitions && typeof sheetTab.columnDefinitions === 'object'
          ? sheetTab.columnDefinitions
          : {};

      const sheetTabDoc = {
        clientId,
        connectionId,
        sheetName: sheetTab.sheetName,
        collectionName,
        keyColumn: sheetTab.keyColumn,
        labelColumn, // persisted
        headerRow: sheetTab.headerRow || 1,
        isActive: sheetTab.enabled !== false,
        syncStatus: 'pending',
        recordCount: 0,
        createdAt: Timestamp.now(),
        createdBy,
        lastSyncAt: null,
        selectedColumns: Array.from(selectedColumnsSet), // persisted
        columnDefinitions, // persisted
      };

      const sheetTabsCol = collection(db, 'sheetTabs');
      const ref = doc(sheetTabsCol, collectionName);
      await setDoc(ref, sheetTabDoc, { merge: true });

      collectionsCreated.push({
        id: collectionName,
        sheetName: sheetTabDoc.sheetName,
        collectionName,
      });
    }

    return NextResponse.json({
      success: true,
      collectionsCreated,
      notice:
        'Saved/updated sheet tab config. keyColumn/labelColumn/selectedColumns are persisted.',
    });
  } catch (error) {
    console.error('Error creating sheet tabs:', error);
    return NextResponse.json(
      {
        error: 'Failed to create sheet tabs',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sheet-tabs
 * Returns all active sheet tab configs, including labelColumn & selectedColumns.
 */
export async function GET(request: NextRequest) {
  try {
    // We accept these for compatibility but don’t filter in this simple setup
    const { searchParams } = new URL(request.url);
    void searchParams.get('companyId');
    void searchParams.get('clientId');
    void searchParams.get('connectionId');

    const sheetTabsCol = collection(db, 'sheetTabs');
    const snapshot = await getDocs(sheetTabsCol);

    const sheetTabs = snapshot.docs
      .map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          sheetName: data.sheetName || d.id,
          sheetTitle: data.sheetName || d.id,
          collectionName: data.collectionName || d.id,
          keyColumn: data.keyColumn || 'id',
          labelColumn: data.labelColumn ?? null,
          selectedColumns: Array.isArray(data.selectedColumns) ? data.selectedColumns : [],
          originalHeaders: Array.isArray(data.originalHeaders) ? data.originalHeaders : [],
          columnDefinitions: data.columnDefinitions && typeof data.columnDefinitions === 'object' ? data.columnDefinitions : {},
          recordCount: typeof data.recordCount === 'number' ? data.recordCount : 0,
          isActive: data.isActive !== false,
          createdAt: data.createdAt?.toDate
            ? data.createdAt.toDate().toISOString()
            : new Date().toISOString(),
          lastSyncAt: data.lastSyncAt?.toDate
            ? data.lastSyncAt.toDate().toISOString()
            : null,
        };
      })
      .filter((tab) => tab.isActive !== false)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ success: true, sheetTabs });
  } catch (error) {
    console.error('Error fetching sheet tabs:', error);
    return NextResponse.json({ error: 'Failed to fetch sheet tabs' }, { status: 500 });
  }
}
