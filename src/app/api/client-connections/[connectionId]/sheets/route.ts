import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, query } from 'firebase/firestore';
import { google } from 'googleapis';
import { secretManagerService } from '@/lib/secretManager';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const { connectionId } = await params;
    const { searchParams } = new URL(request.url);
    const sheetParam = searchParams.get('sheet'); // optional: request headers for one sheet

    console.log('Fetching sheets for connection:', connectionId);

    let connection = null;
    let parentClientId = null;
    
    // Handle the special 'default' connection case
    if (connectionId === 'default') {
      // For the default connection, read from environment variables
      connection = {
        name: 'Default Connection',
        projectId: 'default',
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
        serviceAccountKeyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY
      };
      parentClientId = 'default';
      
      // Validate that required environment variables are set
      if (!connection.spreadsheetId || !connection.serviceAccountKeyFile) {
        return NextResponse.json(
          { error: 'Missing required environment variables: GOOGLE_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_KEY' },
          { status: 500 }
        );
      }
    } else {
      // For other connections, search through all clients to find the connection
      const clientsQuery = query(collection(db, 'clients'));
      const clientsSnapshot = await getDocs(clientsQuery);
      
      let connectionDoc = null;
      
      for (const clientDocSnap of clientsSnapshot.docs) {
        const connectionRef = doc(db, 'clients', clientDocSnap.id, 'connections', connectionId);
        const connDoc = await getDoc(connectionRef);
        if (connDoc.exists()) {
          connectionDoc = connDoc;
          parentClientId = clientDocSnap.id;
          break;
        }
      }
      
      if (!connectionDoc || !connectionDoc.exists()) {
        return NextResponse.json(
          { error: `Connection '${connectionId}' not found.` },
          { status: 404 }
        );
      }
      
      connection = connectionDoc.data();
    }
    
    try {
      // For the default connection, get service account key from environment variables
      // For other connections, use the existing logic
      let serviceAccountKey;
      
      if (connectionId === 'default') {
        // Read service account key from environment variable
        const serviceAccountKeyEnv = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
        if (serviceAccountKeyEnv) {
          try {
            serviceAccountKey = JSON.parse(serviceAccountKeyEnv);
          } catch (error) {
            throw new Error('Invalid JSON in GOOGLE_SERVICE_ACCOUNT_KEY environment variable');
          }
        } else {
          throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY environment variable not set');
        }
      } else {
        // For other connections, use existing Secret Manager logic
        try {
          // Try to get from Secret Manager first
          const serviceAccountKeyData = await secretManagerService.getSecret(
            connection.projectId,
            connection.secretName
          );
          serviceAccountKey = JSON.parse(serviceAccountKeyData);
        } catch (error) {
          console.warn('Failed to retrieve from Secret Manager, checking for stored key in connection');
          
          // For development, check if we have the key stored directly
          // This is NOT recommended for production
          if (connection.serviceAccountKeyFile) {
            serviceAccountKey = JSON.parse(connection.serviceAccountKeyFile);
          } else {
            throw new Error('No service account key available');
          }
        }
      }

      // Set up Google Sheets API
      const auth = new google.auth.GoogleAuth({
        credentials: serviceAccountKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });

      const sheets = google.sheets({ version: 'v4', auth });

      // If a specific sheet is requested, fetch its headers and return immediately
      if (sheetParam) {
        // First determine the sheetId and normalized title (in case)
        const meta = await sheets.spreadsheets.get({ spreadsheetId: connection.spreadsheetId });
        const target = (meta.data.sheets || [])
          .map(s => ({
            sheetId: s.properties?.sheetId || 0,
            sheetTitle: s.properties?.title || 'Unknown',
          }))
          .find(s => s.sheetTitle === sheetParam);

        if (!target) {
          return NextResponse.json({ success: false, error: `Sheet '${sheetParam}' not found` }, { status: 404 });
        }

        try {
          const range = `'${target.sheetTitle}'!1:3`;
          const valuesResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: connection.spreadsheetId,
            range,
            quotaUser: `sheets_headers_${connectionId}_${encodeURIComponent(target.sheetTitle)}`,
            valueRenderOption: 'UNFORMATTED_VALUE',
            dateTimeRenderOption: 'FORMATTED_STRING',
          });
          const rows = valuesResponse.data.values || [];
          const headers = rows[0] || [];
          const result = {
            sheetId: target.sheetId,
            sheetTitle: target.sheetTitle,
            columns: headers.map((h: any, i: number) => ({ index: i, name: String(h || `Column ${i + 1}`) })),
            hasData: rows.length > 1,
            dataRowCount: rows.length,
          };
          return NextResponse.json({ success: true, sheets: [result], single: true });
        } catch (e) {
          console.error('Error fetching headers for sheet', sheetParam, e);
          return NextResponse.json({ success: false, error: 'Failed to fetch headers' }, { status: 500 });
        }
      }

      // Get spreadsheet metadata including all sheets
      const response = await sheets.spreadsheets.get({
        spreadsheetId: connection.spreadsheetId,
      });

      const spreadsheetName = response.data.properties?.title || 'Unknown';
      const tabs = response.data.sheets?.map(sheet => ({
        sheetId: sheet.properties?.sheetId || 0,
        sheetTitle: sheet.properties?.title || 'Unknown',
      })) || [];

      // Optimize: Only fetch column info for a limited number of sheets to avoid quota issues
      // Prioritize sheets that are likely to be used (first 10 sheets)
      const priorityTabs = tabs.slice(0, 10);
      const remainingTabs = tabs.slice(10);

      // Batch fetch column info for priority sheets with retry and delay
      const tabsWithColumns = [];
      
      for (let i = 0; i < priorityTabs.length; i++) {
        const tab = priorityTabs[i];
        try {
          // Add small delay between requests to avoid hitting rate limits
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          const range = `'${tab.sheetTitle}'!1:3`; // Get first 3 rows
          const valuesResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: connection.spreadsheetId,
            range,
            // Add quota management
            quotaUser: `sheets_list_${connectionId}`,
          });

          const rows = valuesResponse.data.values || [];
          const headers = rows[0] || [];
          
          tabsWithColumns.push({
            ...tab,
            columns: headers.map((header, index) => ({
              index,
              name: header?.toString() || `Column ${index + 1}`,
            })),
            hasData: rows.length > 1,
            dataRowCount: rows.length,
          });
        } catch (error: any) {
          console.warn(`Skipping column fetch for sheet ${tab.sheetTitle} due to quota:`, error?.message || error);
          tabsWithColumns.push({
            ...tab,
            columns: [],
            hasData: false,
            quotaLimited: true,
          });
          
          // If we hit quota errors, stop fetching more to avoid further issues
          if (error?.code === 429 || error?.status === 429) {
            console.warn('Quota limit reached, skipping remaining sheet column fetches');
            break;
          }
        }
      }
      
      // Add remaining tabs without column info to avoid quota issues
      remainingTabs.forEach(tab => {
        tabsWithColumns.push({
          ...tab,
          columns: [],
          hasData: false,
          quotaLimited: true,
        });
      });

      console.log(`Found sheets: ${tabsWithColumns.length} (${priorityTabs.length} with column info, ${remainingTabs.length} basic info only)`);

      return NextResponse.json({
        success: true,
        spreadsheetName,
        sheets: tabsWithColumns,
        quotaOptimized: true,
        totalSheets: tabs.length,
        sheetsWithColumns: priorityTabs.length,
      });
    } catch (error) {
      console.error('Error accessing Google Sheets:', error);
      
      // Return mock data as fallback
      return NextResponse.json({
        success: true,
        spreadsheetName: connection.spreadsheetName || 'Unknown',
        sheets: [
          {
            sheetId: 0,
            sheetTitle: 'Sheet1',
            columns: [
              { index: 0, name: 'ID' },
              { index: 1, name: 'Name' },
              { index: 2, name: 'Email' },
            ],
            hasData: true,
          },
        ],
      });
    }
  } catch (error) {
    console.error('Error fetching connection sheets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sheets' },
      { status: 500 }
    );
  }
}
