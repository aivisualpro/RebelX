import { NextRequest, NextResponse } from 'next/server';
import { collection, doc, getDoc, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { google } from 'googleapis';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sheetTabId: string }> }
) {
  try {
    const { sheetTabId } = await params;

    if (!sheetTabId) {
      return NextResponse.json(
        { error: 'Sheet tab ID is required' },
        { status: 400 }
      );
    }

    console.log('Starting sync for sheet tab:', sheetTabId);

    // Step 1: Get the sheet tab configuration
    // We need to find the sheet tab in the nested structure: clients/{clientId}/connections/{connectionId}/sheetTabs/{sheetTabId}
    // Since we only have the sheetTabId, we need to search for it
    
    let sheetTabData: any = null;
    let clientId: string = '';
    let connectionId: string = '';
    
    // This is a simplified approach - in a real app, you might want to store the path or use a more efficient query
    // For now, we'll get the clientId and connectionId from the request body or headers
    const body = await request.json();
    clientId = body.clientId;
    connectionId = body.connectionId;

    if (!clientId || !connectionId) {
      return NextResponse.json(
        { error: 'Client ID and Connection ID are required for sync' },
        { status: 400 }
      );
    }

    // Get the sheet tab by ID, then use sheetName for all paths
    const sheetTabRefById = doc(db, 'clients', clientId, 'connections', connectionId, 'sheetTabs', sheetTabId);
    const sheetTabDoc = await getDoc(sheetTabRefById);
    if (!sheetTabDoc.exists()) {
      return NextResponse.json(
        { error: 'Sheet tab not found by ID' },
        { status: 404 }
      );
    }
    sheetTabData = { id: sheetTabDoc.id, ...sheetTabDoc.data() };
    console.log('Found sheet tab:', sheetTabData.sheetName, '→', sheetTabData.collectionName);
    // Use collectionName as the Firestore document ID for the sheet tab path
    const sheetTabPathName = sheetTabData.collectionName || sheetTabData.sheetName;
    const sheetTabRef = doc(db, 'clients', clientId, 'connections', connectionId, 'sheetTabs', sheetTabPathName);

    // Step 2: Get the connection details to access Google Sheets
    const connectionRef = doc(db, 'clients', clientId, 'connections', connectionId);
    const connectionDoc = await getDoc(connectionRef);

    if (!connectionDoc.exists()) {
      return NextResponse.json(
        { error: 'Connection not found' },
        { status: 404 }
      );
    }

    const connectionData = connectionDoc.data();
    console.log('Found connection:', connectionData.name);

    // Step 3: Set up Google Sheets authentication
    let serviceAccountKey: any;
    
    if (connectionData.serviceAccountKeyFile) {
      serviceAccountKey = JSON.parse(connectionData.serviceAccountKeyFile);
    } else {
      return NextResponse.json(
        { error: 'No service account key available for this connection' },
        { status: 400 }
      );
    }

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Step 4: Read data from Google Sheets
    console.log('Reading data from spreadsheet:', connectionData.spreadsheetId, 'sheet:', sheetTabData.sheetName);
    
    const range = `${sheetTabData.sheetName}!A:ZZ`; // Read all columns
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: connectionData.spreadsheetId,
      range: range,
    });

    const rows = response.data.values;
    
    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: 'No data found in the specified sheet' },
        { status: 400 }
      );
    }

    // Step 5: Process the data
    const headers = rows[0]; // First row contains headers
    const dataRows = rows.slice(1); // Skip header row

    console.log('Found headers:', headers);
    console.log('Found data rows:', dataRows.length);

    // Find the key column index
    const keyColumnIndex = headers.findIndex((header: string) => 
      header.toLowerCase() === sheetTabData.keyColumn.toLowerCase()
    );

    if (keyColumnIndex === -1) {
      return NextResponse.json(
        { error: `Key column '${sheetTabData.keyColumn}' not found in sheet headers` },
        { status: 400 }
      );
    }

    // Only sync selected columns
    const selectedColumns: string[] = Array.isArray(sheetTabData.selectedColumns) && sheetTabData.selectedColumns.length > 0
      ? sheetTabData.selectedColumns
      : headers;

    // Map selected columns to their header indices (strict match)
    const selectedIndices: number[] = selectedColumns.map((col: string) => headers.findIndex((h: string) => h === col)).filter((idx: number) => idx !== -1);

    console.log('Key column index:', keyColumnIndex);
    console.log('Selected columns:', selectedColumns);
    console.log('Selected indices:', selectedIndices);

    // Step 6: Sync data to Firebase collection (OPTIMIZED BATCH PROCESSING)
    // Save records under a subcollection 'records' inside the sheet tab document
    const targetCollectionRef = collection(db, 'clients', clientId, 'connections', connectionId, 'sheetTabs', sheetTabPathName, 'records');
    let syncedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    const skippedRows: string[] = [];

    console.log('Syncing to nested collection path:', `clients/${clientId}/connections/${connectionId}/sheetTabs/${sheetTabPathName}/records`);
    console.log(`Starting optimized batch sync for ${dataRows.length} rows...`);

    // Pre-process all rows to filter out invalid ones
    const validRows: Array<{
      rowIndex: number;
      cleanKeyValue: string;
      documentData: any;
    }> = [];

    console.log('Pre-processing rows...');
    for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
      const row = dataRows[rowIndex];
      try {
        // Skip completely empty rows
        const hasAnyData = row.some((cell: any) => 
          cell !== undefined && cell !== null && cell.toString().trim() !== ''
        );
        if (!hasAnyData) {
          skippedCount++;
          skippedRows.push(`Row ${rowIndex + 2}: Completely empty row`);
          continue;
        }
        // Get the key value (document ID)
        const keyValue = row[keyColumnIndex];
        if (!keyValue || keyValue.toString().trim() === '') {
          skippedCount++;
          skippedRows.push(`Row ${rowIndex + 2}: Empty key column value`);
          continue;
        }
        const cleanKeyValue = keyValue.toString().trim();
        if (cleanKeyValue.length === 0 || cleanKeyValue === '' || cleanKeyValue === 'null' || cleanKeyValue === 'undefined') {
          skippedCount++;
          skippedRows.push(`Row ${rowIndex + 2}: Invalid key value '${keyValue}'`);
          continue;
        }
        // Create document data
        const documentData: any = {
          syncedAt: Timestamp.now(),
          syncedFrom: 'google-sheets',
          sheetTabId: sheetTabId,
          clientId: clientId,
          connectionId: connectionId,
        };
        // Only map selected columns (strict)
        selectedIndices.forEach((colIdx: number) => {
          if (colIdx === -1) return;
          const header = headers[colIdx];
          // Sanitize field name for Firebase
          const fieldName = header.toString().toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
          if (fieldName && fieldName.length > 0) {
            const cellValue = row[colIdx];
            documentData[fieldName] = cellValue !== undefined && cellValue !== null ? cellValue.toString().trim() : '';
          }
        });
        validRows.push({
          rowIndex,
          cleanKeyValue,
          documentData
        });
      } catch (error) {
        errorCount++;
        const errorMsg = `Row ${rowIndex + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        console.error(`Error processing row ${rowIndex + 2}:`, error);
      }
    }
    console.log(`Pre-processing complete. Valid rows: ${validRows.length}, Skipped: ${skippedCount}, Errors: ${errorCount}`);

    // Batch write operations (Firebase supports up to 500 operations per batch)
    const BATCH_SIZE = 500;
    const batches = Math.ceil(validRows.length / BATCH_SIZE);
    
    console.log(`Writing ${validRows.length} documents in ${batches} batches...`);

    for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
      const batch = writeBatch(db);
      const startIndex = batchIndex * BATCH_SIZE;
      const endIndex = Math.min(startIndex + BATCH_SIZE, validRows.length);
      
      console.log(`Processing batch ${batchIndex + 1}/${batches} (rows ${startIndex + 1}-${endIndex})...`);

      for (let i = startIndex; i < endIndex; i++) {
        const { cleanKeyValue, documentData } = validRows[i];
        const docRef = doc(targetCollectionRef, cleanKeyValue);
        batch.set(docRef, documentData, { merge: true });
      }

      try {
        await batch.commit();
        const batchSyncedCount = endIndex - startIndex;
        syncedCount += batchSyncedCount;
        console.log(`Batch ${batchIndex + 1} completed: ${batchSyncedCount} records synced`);
      } catch (error) {
        console.error(`Error committing batch ${batchIndex + 1}:`, error);
        errorCount += endIndex - startIndex;
        const errorMsg = `Batch ${batchIndex + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
      }
    }

    // Step 7: Update sheet tab metadata
    await updateDoc(sheetTabRef, {
      lastSyncAt: Timestamp.now(),
      recordCount: syncedCount,
      syncStatus: errorCount > 0 ? 'completed_with_errors' : 'completed',
      lastSyncErrors: errors.slice(0, 10), // Store only first 10 errors
      skippedRowCount: skippedCount,
      lastSyncSkipped: skippedRows.slice(0, 10), // Store only first 10 skipped rows
      originalHeaders: headers, // Store the original headers from Google Sheets
      selectedHeaders: selectedColumns, // Persist the selected headers (human-readable order)
      headerOrder: selectedColumns.map((header: string) => 
        header.toString().toLowerCase()
          .replace(/[^a-z0-9]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '')
      ).filter(h => h.length > 0), // Store sanitized field names in selected order
    });

    console.log('Sync completed:', { syncedCount, skippedCount, errorCount });

    const statusMessage = skippedCount > 0 
      ? `Successfully synced ${syncedCount} records (${skippedCount} rows skipped due to empty/invalid data)`
      : `Successfully synced ${syncedCount} records`;

      return NextResponse.json({
      success: true,
      message: `${statusMessage} to nested collection under sheet tab '${sheetTabPathName}'`,
      syncedCount,
      skippedCount,
      errorCount,
      errors: errors.slice(0, 5), // Return only first 5 errors in response
      skippedRows: skippedRows.slice(0, 5), // Return only first 5 skipped rows in response
      collectionName: sheetTabData.collectionName,
      sheetName: sheetTabData.sheetName,
        storagePath: `clients/${clientId}/connections/${connectionId}/sheetTabs/${sheetTabPathName}/records`,
    });

  } catch (error) {
    console.error('Error syncing sheet tab:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to sync sheet tab', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
