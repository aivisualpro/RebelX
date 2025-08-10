import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs, query, orderBy, limit as firestoreLimit, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sheetTabId: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const { sheetTabId } = await params;
    const clientId = searchParams.get('clientId');
    const connectionId = searchParams.get('connectionId');
    const limit = parseInt(searchParams.get('limit') || '100');

    if (!sheetTabId || !clientId || !connectionId) {
      return NextResponse.json(
        { error: 'Sheet tab ID, client ID, and connection ID are required' },
        { status: 400 }
      );
    }

    console.log('Fetching records for sheet tab:', sheetTabId);

    // First, verify the sheet tab exists
    const sheetTabRef = doc(db, 'clients', clientId, 'connections', connectionId, 'sheetTabs', sheetTabId);
    const sheetTabDoc = await getDoc(sheetTabRef);

    if (!sheetTabDoc.exists()) {
      return NextResponse.json(
        { error: 'Sheet tab not found' },
        { status: 404 }
      );
    }

    const sheetTabData = { id: sheetTabDoc.id, ...sheetTabDoc.data() } as any;

    // Get records from the nested collection
    const recordsCollectionRef = collection(db, 'clients', clientId, 'connections', connectionId, 'sheetTabs', sheetTabId, 'records');
    
    let recordsQuery = query(recordsCollectionRef);
    
    // Order by syncedAt (most recently synced first)
    recordsQuery = query(recordsQuery, orderBy('syncedAt', 'desc'));
    
    // Apply limit
    recordsQuery = query(recordsQuery, firestoreLimit(limit));

    const recordsSnapshot = await getDocs(recordsQuery);
    
    const records = recordsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      // Convert Firestore Timestamps to ISO strings for JSON serialization
      syncedAt: doc.data().syncedAt?.toDate?.()?.toISOString() || doc.data().syncedAt,
    }));

    console.log(`Found ${records.length} records for sheet tab:`, sheetTabData.sheetName);

    return NextResponse.json({
      success: true,
      records,
      sheetTabInfo: {
        sheetName: sheetTabData.sheetName,
        collectionName: sheetTabData.collectionName,
        keyColumn: sheetTabData.keyColumn,
        recordCount: sheetTabData.recordCount || 0,
        lastSyncAt: sheetTabData.lastSyncAt?.toDate?.()?.toISOString() || null,
        originalHeaders: sheetTabData.originalHeaders || [], // Include original headers
        headerOrder: sheetTabData.headerOrder || [], // Include sanitized header order
      },
      storagePath: `clients/${clientId}/connections/${connectionId}/sheetTabs/${sheetTabId}/records`,
      totalFound: records.length,
    });

  } catch (error) {
    console.error('Error fetching sheet tab records:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch sheet tab records', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
