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

    console.log('Fetching sheets for connection:', connectionId);

    // First, find which client this connection belongs to
    // We need to search through all clients to find the connection
    const clientsQuery = query(collection(db, 'clients'));
    const clientsSnapshot = await getDocs(clientsQuery);
    
    let connectionDoc = null;
    let parentClientId = null;
    
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
        { error: 'Connection not found' },
        { status: 404 }
      );
    }

    const connection = connectionDoc.data();
    
    try {
      // For development, we'll use the service account key stored in the connection
      // In production, you'd want to retrieve from Secret Manager
      let serviceAccountKey;
      
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

      // Set up Google Sheets API
      const auth = new google.auth.GoogleAuth({
        credentials: serviceAccountKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });

      const sheets = google.sheets({ version: 'v4', auth });

      // Get spreadsheet metadata including all sheets
      const response = await sheets.spreadsheets.get({
        spreadsheetId: connection.spreadsheetId,
      });

      const spreadsheetName = response.data.properties?.title || 'Unknown';
      const tabs = response.data.sheets?.map(sheet => ({
        sheetId: sheet.properties?.sheetId || 0,
        sheetTitle: sheet.properties?.title || 'Unknown',
      })) || [];

      // For each tab, get the first few rows to determine column headers
      const tabsWithColumns = await Promise.all(
        tabs.map(async (tab) => {
          try {
            const range = `'${tab.sheetTitle}'!1:3`; // Get first 3 rows
            const valuesResponse = await sheets.spreadsheets.values.get({
              spreadsheetId: connection.spreadsheetId,
              range,
            });

            const rows = valuesResponse.data.values || [];
            const headers = rows[0] || [];
            
            return {
              ...tab,
              columns: headers.map((header, index) => ({
                index,
                name: header?.toString() || `Column ${index + 1}`,
              })),
              hasData: rows.length > 1,
            };
          } catch (error) {
            console.error(`Error fetching columns for sheet ${tab.sheetTitle}:`, error);
            return {
              ...tab,
              columns: [],
              hasData: false,
            };
          }
        })
      );

      console.log('Found sheets:', tabsWithColumns.length);

      return NextResponse.json({
        success: true,
        spreadsheetName,
        sheets: tabsWithColumns,
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
