import { NextRequest, NextResponse } from 'next/server';
import { validateSpreadsheetId } from '@/lib/validation';
import { Database } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';

// For testing - simple in-memory storage
let databases: Database[] = [];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, connectionId, spreadsheetId } = body;

    console.log('Received database creation request:', { companyId, connectionId, spreadsheetId });

    // Validate required fields
    if (!companyId || !connectionId || !spreadsheetId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate spreadsheet ID format
    const cleanSpreadsheetId = spreadsheetId.includes('/') 
      ? spreadsheetId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || spreadsheetId
      : spreadsheetId;

    if (!validateSpreadsheetId(cleanSpreadsheetId)) {
      return NextResponse.json(
        { error: 'Invalid spreadsheet ID format' },
        { status: 400 }
      );
    }

    // Create mock spreadsheet info (in production, this would call Google Sheets API)
    const spreadsheetName = `Test Spreadsheet (${cleanSpreadsheetId.substring(0, 8)}...)`;
    const tabs = [
      { sheetId: 0, title: 'Sheet1' },
      { sheetId: 1, title: 'Sheet2' },
      { sheetId: 2, title: 'Data' }
    ];

    console.log('Creating database with:', { companyId, connectionId, cleanSpreadsheetId, spreadsheetName });

    // Create database object (using in-memory storage for testing)
    const newDatabase: Database = {
      id: `db_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      companyId,
      connectionId,
      spreadsheetId: cleanSpreadsheetId,
      spreadsheetName,
      createdAt: Timestamp.fromDate(new Date()),
      status: 'active',
    };

    databases.push(newDatabase);

    console.log('Database created successfully:', newDatabase.id);

    return NextResponse.json({
      id: newDatabase.id,
      spreadsheetName,
      tabs,
      message: 'Database created successfully',
    });

  } catch (error) {
    console.error('Error creating database:', error);
    
    // Log more detailed error information
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    return NextResponse.json(
      { error: 'Failed to create database', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const connectionId = searchParams.get('connectionId');

    console.log('Fetching databases for:', { companyId, connectionId });

    let filteredDatabases = databases;

    if (companyId) {
      filteredDatabases = filteredDatabases.filter(db => db.companyId === companyId);
    }

    if (connectionId) {
      filteredDatabases = filteredDatabases.filter(db => db.connectionId === connectionId);
    }

    console.log('Found databases:', filteredDatabases.length);

    return NextResponse.json({ databases: filteredDatabases });

  } catch (error) {
    console.error('Error fetching databases:', error);
    return NextResponse.json(
      { error: 'Failed to fetch databases' },
      { status: 500 }
    );
  }
}
