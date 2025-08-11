import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs, query, where, orderBy, doc, getDoc, limit as firestoreLimit } from 'firebase/firestore';
import { SheetTab } from '@/lib/types';
import { db } from '@/lib/firebase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sheetTabId: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const { sheetTabId } = await params;
    const limit = parseInt(searchParams.get('limit') || '100');

    if (!sheetTabId) {
      return NextResponse.json(
        { error: 'Sheet tab ID is required' },
        { status: 400 }
      );
    }

    console.log('Fetching records for sheet tab:', sheetTabId);

    // First, verify the sheet tab exists
    const sheetTabRef = doc(db, 'sheetTabs', sheetTabId);
    const sheetTabDoc = await getDoc(sheetTabRef);

    if (!sheetTabDoc.exists()) {
      return NextResponse.json(
        { error: 'Sheet tab not found' },
        { status: 404 }
      );
    }

    const sheetTabData: any = { id: sheetTabDoc.id, ...sheetTabDoc.data() };

    // Get records from the top-level collection named after the sheet tab
    const recordsCollectionRef = collection(db, sheetTabId);
    
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
      syncedAt: doc.data().syncedAt || new Date().toISOString(),
    }));

    console.log(`Found ${records.length} records for sheet tab:`, sheetTabId);

    return NextResponse.json({
      success: true,
      records,
      sheetTabInfo: {
        sheetName: sheetTabData.sheetName || sheetTabId,
        collectionName: sheetTabData.collectionName || sheetTabId,
        keyColumn: sheetTabData.keyColumn || '',
        recordCount: records.length,
        lastSyncAt: sheetTabData.lastSyncAt || new Date().toISOString(),
        originalHeaders: sheetTabData.originalHeaders || [],
        headerOrder: sheetTabData.headerOrder || [],
      },
      storagePath: `collections/${sheetTabId}/documents`,
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
