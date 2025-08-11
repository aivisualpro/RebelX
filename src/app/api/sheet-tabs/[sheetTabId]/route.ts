import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc, updateDoc, deleteDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Update sheet tab configuration (e.g., selected columns, key column)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { sheetTabId: string } }
) {
  try {
    const { sheetTabId } = params;
    const body = await request.json();
    // For direct sheet tab management, we'll use default IDs
    const { selectedColumns, keyColumn } = body as {
      selectedColumns?: string[];
      keyColumn?: string;
    };
    const clientId = body.clientId || 'default';
    const connectionId = body.connectionId || 'default';

    if (!sheetTabId) {
      return NextResponse.json(
        { error: 'sheetTabId is required' },
        { status: 400 }
      );
    }

    // Reference sheet tab as top-level collection
    const tabRef = doc(db, 'sheetTabs', sheetTabId);
    const tabSnap = await getDoc(tabRef);
    if (!tabSnap.exists()) {
      return NextResponse.json({ error: 'Sheet tab not found' }, { status: 404 });
    }

    const updates: Record<string, any> = {};
    if (Array.isArray(selectedColumns)) {
      const clean = selectedColumns
        .filter((c) => typeof c === 'string' && c.trim().length > 0)
        .map((c) => c.toString());
      const finalSet = new Set(clean);
      const currentKey = (keyColumn || (tabSnap.data() as any).keyColumn) as string;
      if (currentKey && !finalSet.has(currentKey)) finalSet.add(currentKey);
      updates.selectedColumns = Array.from(finalSet);
      // headerOrder/selectedHeaders will be regenerated on next sync
      updates.headerOrder = null;
      updates.selectedHeaders = null;
    }
    if (typeof keyColumn === 'string' && keyColumn.trim().length > 0) {
      updates.keyColumn = keyColumn;
    }

    await updateDoc(tabRef, updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating sheet tab:', error);
    return NextResponse.json({ error: 'Failed to update sheet tab' }, { status: 500 });
  }
}

// Delete a sheet tab configuration and all related records
export async function DELETE(
  request: NextRequest,
  { params }: { params: { sheetTabId: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const { sheetTabId } = params;
    // For direct sheet tab management, we'll use default IDs
    const clientId = searchParams.get('clientId') || 'default';
    const connectionId = searchParams.get('connectionId') || 'default';

    if (!sheetTabId) {
      return NextResponse.json(
        { error: 'sheetTabId is required' },
        { status: 400 }
      );
    }

    console.log('Starting delete process for sheet tab:', sheetTabId);

    // Step 1: Get the sheet tab configuration to find the collection name
    const tabRef = doc(db, 'sheetTabs', sheetTabId);
    const tabSnap = await getDoc(tabRef);
    
    if (!tabSnap.exists()) {
      return NextResponse.json({ error: 'Sheet tab not found' }, { status: 404 });
    }

    const tabData = tabSnap.data();
    const collectionName = tabData.collectionName;
    
    console.log('Found sheet tab with collection:', collectionName);

    // Step 2: Delete all records in the associated Firebase collection
    let deletedRecordsCount = 0;
    if (collectionName) {
      const collectionRef = collection(db, collectionName);
      const snapshot = await getDocs(collectionRef);
      
      console.log(`Found ${snapshot.docs.length} records to delete in collection: ${collectionName}`);
      deletedRecordsCount = snapshot.docs.length;

      if (snapshot.docs.length > 0) {
        // Delete records in batches (Firebase supports up to 500 operations per batch)
        const BATCH_SIZE = 500;
        const batches = Math.ceil(snapshot.docs.length / BATCH_SIZE);
        
        for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
          const batch = writeBatch(db);
          const startIndex = batchIndex * BATCH_SIZE;
          const endIndex = Math.min(startIndex + BATCH_SIZE, snapshot.docs.length);
          
          console.log(`Deleting batch ${batchIndex + 1}/${batches} (records ${startIndex + 1}-${endIndex})...`);
          
          for (let i = startIndex; i < endIndex; i++) {
            batch.delete(snapshot.docs[i].ref);
          }
          
          await batch.commit();
          console.log(`Batch ${batchIndex + 1} completed: ${endIndex - startIndex} records deleted`);
        }
        
        console.log(`Successfully deleted all ${snapshot.docs.length} records from collection: ${collectionName}`);
      }
    }

    // Step 3: Delete the sheet tab configuration
    await deleteDoc(tabRef);
    console.log('Sheet tab configuration deleted');

    return NextResponse.json({ 
      success: true,
      message: `Database deleted successfully. Removed ${deletedRecordsCount} records from collection '${collectionName}'.`,
      deletedRecords: deletedRecordsCount,
      collectionName
    });
  } catch (error) {
    console.error('Error deleting sheet tab:', error);
    return NextResponse.json({ 
      error: 'Failed to delete sheet tab', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}


