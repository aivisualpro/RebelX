import { NextRequest, NextResponse } from 'next/server';
import { collection, addDoc, getDocs, query, where, orderBy, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // For direct sheet tab creation, we'll use default IDs since we're not using client connections
    const { sheetTabs: sheetTabData, createdBy } = body;
    const clientId = body.clientId || 'default';
    const connectionId = body.connectionId || 'default';

    console.log('Received sheet tabs creation request:', { 
      clientId, 
      connectionId,
      sheetTabCount: sheetTabData?.length,
      createdBy
    });

    // Validate required fields
    if (!sheetTabData || !createdBy) {
      return NextResponse.json(
        { error: 'Missing required fields: sheetTabs and createdBy are required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(sheetTabData) || sheetTabData.length === 0) {
      return NextResponse.json(
        { error: 'No sheet tabs to create' },
        { status: 400 }
      );
    }

    // Validate that each sheet tab has a keyColumn
    for (const sheetTab of sheetTabData) {
      if (!sheetTab.keyColumn || !sheetTab.sheetName) {
        return NextResponse.json(
          { error: `Missing keyColumn or sheetName for sheet: ${sheetTab.sheetName || 'unknown'}. Key column is required to sync with Firebase document IDs.` },
          { status: 400 }
        );
      }
    }

    const collectionsCreated = [];

    // Create each sheet tab as a top-level collection in Firebase
    for (const sheetTab of sheetTabData) {
      // Normalize and ensure selected columns include the key column
      const incomingSelected: string[] = Array.isArray(sheetTab.selectedColumns)
        ? sheetTab.selectedColumns.filter((c: string) => typeof c === 'string' && c.trim().length > 0)
        : [];
      const selectedColumnsSet = new Set(
        incomingSelected.map((c: string) => c.toString())
      );
      if (sheetTab.keyColumn && !selectedColumnsSet.has(sheetTab.keyColumn)) {
        selectedColumnsSet.add(sheetTab.keyColumn);
      }

      const sheetTabDoc = {
        clientId,
        connectionId,
        // companyId is no longer needed for direct sheet tab creation
        sheetName: sheetTab.sheetName,
        collectionName: sheetTab.collectionName || sheetTab.sheetName.toLowerCase().replace(/\s+/g, '_'),
        keyColumn: sheetTab.keyColumn, // CRITICAL: This column must contain values that match Firebase document IDs
        headerRow: sheetTab.headerRow || 1,
        isActive: sheetTab.enabled !== false, // Default to true
        syncStatus: 'pending',
        recordCount: 0,
        createdAt: Timestamp.now(),
        createdBy,
        lastSyncAt: null,
        selectedColumns: Array.from(selectedColumnsSet),
      };

      // Add sheet tab to Firestore as a top-level collection
      // Use collectionName as the document ID so path becomes sheetTabs/{collectionName}
      const sheetTabsCollectionRef = collection(db, 'sheetTabs');
      const sheetTabRef = doc(sheetTabsCollectionRef, sheetTabDoc.collectionName);
      await setDoc(sheetTabRef, sheetTabDoc, { merge: true });

      collectionsCreated.push({
        id: sheetTabDoc.collectionName,
        sheetName: sheetTabDoc.sheetName,
        collectionName: sheetTabDoc.collectionName,
      });

      console.log('Created sheet tab as top-level collection:', sheetTabDoc.sheetName, '→', sheetTabDoc.collectionName);
    }

    return NextResponse.json({ 
      success: true, 
      collectionsCreated,
      notice: 'Each sheet will sync with Firebase collection using the specified key column as document IDs'
    });

  } catch (error) {
    console.error('Error creating sheet tabs:', error);
    
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    return NextResponse.json(
      { error: 'Failed to create sheet tabs', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const clientId = searchParams.get('clientId') || 'default';
    const connectionId = searchParams.get('connectionId') || 'default';

    console.log('Fetching sheet tabs for:', { companyId, clientId, connectionId });

    // Get sheet tabs as top-level collections
    const sheetTabsCollectionRef = collection(db, 'sheetTabs');
    const snapshot = await getDocs(sheetTabsCollectionRef);
    
    const sheetTabs = snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        sheetName: d.sheetName || doc.id,
        sheetTitle: d.sheetName || doc.id,
        collectionName: d.collectionName,
        keyColumn: d.keyColumn,
        recordCount: typeof d.recordCount === 'number' ? d.recordCount : 0,
        isActive: d.isActive !== false,
        createdAt: d.createdAt?.toDate().toISOString(),
        lastSyncAt: d.lastSyncAt?.toDate().toISOString() || null,
      } as any;
    });

    // Filter active tabs and sort by created date
    const filteredSheetTabs = sheetTabs
      .filter((tab: any) => tab.isActive !== false) // Filter active tabs
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); // Sort by created date desc

    console.log('Found sheet tabs:', filteredSheetTabs.length);

    return NextResponse.json({ 
      success: true,
      sheetTabs: filteredSheetTabs 
    });

  } catch (error) {
    console.error('Error fetching sheet tabs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sheet tabs' },
      { status: 500 }
    );
  }
}
