import { NextRequest, NextResponse } from 'next/server';
import { collection, addDoc, getDocs, query, where, orderBy, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clientId, connectionId, sheetTabs: sheetTabData, createdBy } = body;

    console.log('Received sheet tabs creation request:', { 
      clientId, 
      connectionId,
      sheetTabCount: sheetTabData?.length,
      createdBy
    });

    // Validate required fields
    if (!clientId || !connectionId || !sheetTabData || !createdBy) {
      return NextResponse.json(
        { error: 'Missing required fields: clientId, connectionId, sheetTabs, and createdBy are all required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(sheetTabData) || sheetTabData.length === 0) {
      return NextResponse.json(
        { error: 'No sheet tabs to create' },
        { status: 400 }
      );
    }

    // Verify that the client exists, create if it doesn't
    const clientRef = doc(db, 'clients', clientId);
    const clientDoc = await getDoc(clientRef);
    
    let clientData;
    if (!clientDoc.exists()) {
      // Create the client on-the-fly if it doesn't exist
      console.log('Client not found, creating client record for:', clientId);
      clientData = {
        companyId: clientId, // Use clientId as companyId for proper mapping
        name: 'Auto-created Client',
        adminEmail: `${clientId}@example.com`,
        adminPassword: 'temp',
        createdAt: Timestamp.now(),
        createdBy: 'system-auto',
        status: 'active'
      };
      await setDoc(clientRef, clientData);
    } else {
      clientData = clientDoc.data();
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

    // Create each sheet tab in Firebase under the connection
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
        companyId: clientData.companyId || clientId, // Fallback to clientId if companyId is undefined
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

      // Add sheet tab to Firestore under the nested path: clients/{clientId}/connections/{connectionId}/sheetTabs
      // Use collectionName as the document ID so path becomes .../sheetTabs/{collectionName}
      const sheetTabsCollectionRef = collection(db, 'clients', clientId, 'connections', connectionId, 'sheetTabs');
      const sheetTabRef = doc(sheetTabsCollectionRef, sheetTabDoc.collectionName);
      await setDoc(sheetTabRef, sheetTabDoc, { merge: true });

      collectionsCreated.push({
        id: sheetTabRef.id,
        collectionName: sheetTabDoc.collectionName,
        sheetName: sheetTabDoc.sheetName,
        keyColumn: sheetTabDoc.keyColumn,
        message: `Collection '${sheetTabDoc.collectionName}' ready for sync. Key column '${sheetTabDoc.keyColumn}' will be used as document ID.`
      });

      console.log('Sheet tab created successfully:', sheetTabRef.id);
    }

    console.log('Created sheet tabs successfully:', collectionsCreated.length);

    return NextResponse.json({
      message: 'Sheet tabs created successfully',
      count: collectionsCreated.length,
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
    const clientId = searchParams.get('clientId');
    const connectionId = searchParams.get('connectionId');

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
    }

    console.log('Fetching sheet tabs for:', { companyId, clientId, connectionId });

    interface SheetTabData {
      id: string;
      sheetTitle: string;
      sheetId: number;
      isActive?: boolean;
      createdAt: any;
      lastSyncAt?: any;
    }

    let sheetTabs: SheetTabData[] = [];

    if (connectionId) {
      // Get sheet tabs for a specific connection
      const sheetTabsCollectionRef = collection(db, 'clients', clientId, 'connections', connectionId, 'sheetTabs');
      const snapshot = await getDocs(sheetTabsCollectionRef);
      
      sheetTabs = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          // Provide both sheetName and sheetTitle for backward compatibility
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
    } else {
      // Get sheet tabs for all connections under a client
      const connectionsRef = collection(db, 'clients', clientId, 'connections');
      const connectionsSnapshot = await getDocs(connectionsRef);
      
      // For each connection, get its sheet tabs
      const allSheetTabs = await Promise.all(
        connectionsSnapshot.docs.map(async (connectionDoc) => {
          const sheetTabsCollectionRef = collection(db, 'clients', clientId, 'connections', connectionDoc.id, 'sheetTabs');
          const sheetTabsSnapshot = await getDocs(sheetTabsCollectionRef);
          
          return sheetTabsSnapshot.docs.map(doc => {
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
        })
      );
      
      // Flatten the array of arrays
      sheetTabs = allSheetTabs.flat();
    }

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
