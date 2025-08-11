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

    // Step 1: Get the sheet tab configuration from top-level collection
    const sheetTabRef = doc(db, 'sheetTabs', sheetTabId);
    const sheetTabDoc = await getDoc(sheetTabRef);
    if (!sheetTabDoc.exists()) {
      return NextResponse.json(
        { error: 'Sheet tab not found' },
        { status: 404 }
      );
    }
    
    const sheetTabData: any = { id: sheetTabDoc.id, ...sheetTabDoc.data() };
    console.log('Found sheet tab:', sheetTabData.sheetName, '→', sheetTabData.collectionName);

    // Step 2: Get Google Sheets connection details from environment variables
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const serviceAccountKeyEnv = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'GOOGLE_SPREADSHEET_ID environment variable not set' },
        { status: 500 }
      );
    }

    if (!serviceAccountKeyEnv) {
      return NextResponse.json(
        { error: 'GOOGLE_SERVICE_ACCOUNT_KEY environment variable not set' },
        { status: 500 }
      );
    }

    // Step 3: Set up Google Sheets authentication
    let serviceAccountKey: any;
    
    try {
      serviceAccountKey = JSON.parse(serviceAccountKeyEnv);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON in GOOGLE_SERVICE_ACCOUNT_KEY environment variable' },
        { status: 500 }
      );
    }

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Step 4: Read data from Google Sheets
    console.log('Reading data from spreadsheet:', spreadsheetId, 'sheet:', sheetTabData.sheetName);
    
    const range = `${sheetTabData.sheetName}!A:ZZ`; // Read all columns
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
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

    // Step 6: Sync data to Firebase collection
    // Create or reference the target collection using the sheet tab's collectionName
    const targetCollectionRef = collection(db, sheetTabData.collectionName);
    console.log('Target Firebase collection:', sheetTabData.collectionName);

    let syncedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    const skippedRows: string[] = [];
    const validRows: { rowIndex: number; cleanKeyValue: string; documentData: Record<string, string> }[] = [];

    // Process each row
    for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
      try {
        const row = dataRows[rowIndex];
        
        // Skip empty rows
        if (!row || row.length === 0 || row.every(cell => !cell || cell.toString().trim() === '')) {
          skippedCount++;
          skippedRows.push(`Row ${rowIndex + 2}: Empty or blank row`);
          continue;
        }

        // Get the key value from the key column
        const keyValue = row[keyColumnIndex];
        
        // Skip rows with empty key values
        if (keyValue === undefined || keyValue === null || keyValue.toString().trim() === '') {
          skippedCount++;
          skippedRows.push(`Row ${rowIndex + 2}: Empty key value`);
          continue;
        }

        // Sanitize the key value for use as a document ID
        const cleanKeyValue = keyValue.toString().toLowerCase()
          .replace(/[^a-z0-9]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '');

        // Skip rows with invalid key values after sanitization
        if (!cleanKeyValue || cleanKeyValue.length === 0) {
          skippedCount++;
          skippedRows.push(`Row ${rowIndex + 2}: Invalid key value after sanitization`);
          continue;
        }

        // Create document data from selected columns
        const documentData: Record<string, string> = {
          syncedAt: new Date().toISOString(),
        };

        selectedIndices.forEach((headerIndex, i) => {
          const cellValue = row[headerIndex];
          const headerName = headers[headerIndex];
          
          // Sanitize field names for Firestore
          const fieldName = headerName.toString().toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');

          if (fieldName.length > 0) {
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
      message: `${statusMessage} to collection '${sheetTabData.collectionName}'`,
      syncedCount,
      skippedCount,
      errorCount,
      errors: errors.slice(0, 5), // Return only first 5 errors in response
      skippedRows: skippedRows.slice(0, 5), // Return only first 5 skipped rows in response
      collectionName: sheetTabData.collectionName,
      sheetName: sheetTabData.sheetName,
        storagePath: `collections/${sheetTabData.collectionName}/documents`,
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
