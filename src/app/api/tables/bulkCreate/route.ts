import { NextRequest, NextResponse } from 'next/server';

// For testing - simple in-memory storage
interface TableData {
  id: string;
  companyId: string;
  connectionId: string;
  databaseId: string;
  spreadsheetId: string;
  sheetId: string;
  sheetTitle: string;
  keyColumn: string;
  headerRow: number;
  enabled: boolean;
  createdAt: Date;
  status: string;
  name?: string;
  headers?: string[];
  lastSync?: string;
  recordCount?: number;
}

const tables: TableData[] = [];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, connectionId, databaseId, spreadsheetId, tables: tableData } = body;

    console.log('Received bulk table creation request:', { 
      companyId, 
      connectionId, 
      databaseId, 
      spreadsheetId, 
      tableCount: tableData?.length 
    });

    // Validate required fields
    if (!companyId || !connectionId || !databaseId || !spreadsheetId || !tableData) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!Array.isArray(tableData) || tableData.length === 0) {
      return NextResponse.json(
        { error: 'No tables to create' },
        { status: 400 }
      );
    }

    // Create table objects (using in-memory storage for testing)
    const newTables = tableData.map((table: any) => ({
      id: `table_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      companyId,
      connectionId,
      databaseId,
      spreadsheetId,
      sheetId: table.sheetId,
      sheetTitle: table.sheetTitle,
      keyColumn: table.keyColumn,
      headerRow: table.headerRow,
      enabled: table.enabled || true,
      createdAt: new Date(),
      status: 'active',
    }));

    // Add to in-memory storage
    tables.push(...newTables);

    console.log('Created tables successfully:', newTables.length);

    return NextResponse.json({
      message: 'Tables created successfully',
      count: newTables.length,
      tableIds: newTables.map(t => t.id),
    });

  } catch (error) {
    console.error('Error creating tables:', error);
    
    // Log more detailed error information
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    return NextResponse.json(
      { error: 'Failed to create tables', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
