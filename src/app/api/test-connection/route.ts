import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export const runtime = 'nodejs'; // ensure Node runtime (googleapis doesn't work on Edge)

export async function GET() {
  try {
    console.log('=== Testing Google Sheets Connection ===');
    
    // Check environment variables
    const requiredEnvVars = {
      GOOGLE_SPREADSHEET_ID: process.env.GOOGLE_SPREADSHEET_ID,
      GOOGLE_SERVICE_ACCOUNT_KEY: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
    };

    console.log('Environment Variables Check:');
    const missingVars = [];
    for (const [key, value] of Object.entries(requiredEnvVars)) {
      if (!value) {
        missingVars.push(key);
        console.log(`❌ ${key}: MISSING`);
      } else {
        console.log(`✅ ${key}: Present (${key === 'GOOGLE_SERVICE_ACCOUNT_KEY' ? 'JSON length: ' + value.length : value})`);
      }
    }

    if (missingVars.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Missing required environment variables: ${missingVars.join(', ')}`,
        envVars: requiredEnvVars
      }, { status: 500 });
    }

    // Parse service account key
    let serviceAccountKey;
    try {
      serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!);
      console.log('✅ Service account key parsed successfully');
      console.log('Service account email:', serviceAccountKey.client_email);
    } catch (error) {
      console.log('❌ Failed to parse service account key:', error);
      return NextResponse.json({
        success: false,
        error: 'Invalid JSON in GOOGLE_SERVICE_ACCOUNT_KEY environment variable',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 });
    }

    // Initialize Google Sheets API
    console.log('Initializing Google Sheets API...');
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID!;

    console.log('Fetching spreadsheet metadata...');
    
    // Get spreadsheet metadata
    const spreadsheetResponse = await sheets.spreadsheets.get({
      spreadsheetId,
      includeGridData: false,
    });

    const spreadsheet = spreadsheetResponse.data;
    console.log('✅ Spreadsheet found:', spreadsheet.properties?.title);

    // Extract sheet information
    const sheetTabs = spreadsheet.sheets?.map((sheet, index) => {
      const sheetProperties = sheet.properties;
      return {
        sheetId: sheetProperties?.sheetId || index,
        sheetTitle: sheetProperties?.title || `Sheet${index + 1}`,
        gridProperties: sheetProperties?.gridProperties,
        sheetType: sheetProperties?.sheetType || 'GRID'
      };
    }) || [];

    console.log('✅ Found sheets:', sheetTabs.map(s => s.sheetTitle));

    // Try to get column headers for the first sheet
    let firstSheetColumns = [];
    if (sheetTabs.length > 0) {
      try {
        const firstSheet = sheetTabs[0];
        console.log(`Getting column headers for sheet: ${firstSheet.sheetTitle}`);
        
        const valuesResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${firstSheet.sheetTitle}!1:1`, // First row
        });

        const headerRow = valuesResponse.data.values?.[0] || [];
        firstSheetColumns = headerRow.map((header, index) => ({
          index,
          name: header || `Column${index + 1}`
        }));

        console.log('✅ Column headers:', firstSheetColumns.map(c => c.name));
      } catch (error) {
        console.log('⚠️ Could not fetch column headers:', error);
      }
    }

    // Return detailed information
    return NextResponse.json({
      success: true,
      message: 'Google Sheets connection successful!',
      spreadsheet: {
        id: spreadsheetId,
        title: spreadsheet.properties?.title,
        locale: spreadsheet.properties?.locale,
        timeZone: spreadsheet.properties?.timeZone,
      },
      sheets: sheetTabs,
      firstSheetColumns,
      serviceAccount: {
        email: serviceAccountKey.client_email,
        projectId: serviceAccountKey.project_id,
      },
      environmentCheck: {
        allVariablesPresent: missingVars.length === 0,
        missingVariables: missingVars,
      }
    });

  } catch (error) {
    console.error('❌ Connection test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to connect to Google Sheets',
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
