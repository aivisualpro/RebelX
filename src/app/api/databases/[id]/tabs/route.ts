import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const databaseId = params.id;
    
    console.log('Fetching tabs for database:', databaseId);

    // In our mock implementation, return the same tabs that were created during database creation
    const mockTabs = [
      { sheetId: 0, sheetTitle: 'Sheet1' },
      { sheetId: 1, sheetTitle: 'Sheet2' },
      { sheetId: 2, sheetTitle: 'Data' },
      { sheetId: 3, sheetTitle: 'Config' }
    ];

    console.log('Returning mock tabs:', mockTabs.length);

    return NextResponse.json({
      tabs: mockTabs,
      message: 'Tabs loaded successfully',
    });

  } catch (error) {
    console.error('Error fetching tabs:', error);
    
    // Log more detailed error information
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch tabs', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
