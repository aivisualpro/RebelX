import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin, admin } from '@/lib/firebase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tableId = params.id;
    const db = getFirestoreAdmin();
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');

    // Get table data from the rows collection
    const collectionName = `table_${tableId}_rows`;
    const snapshot = await db
      .collection(collectionName)
      .limit(limit)
      .get();

    const rows = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({
      rows,
      count: rows.length,
      hasMore: snapshot.docs.length === limit,
    });

  } catch (error) {
    console.error('Error fetching table data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch table data' },
      { status: 500 }
    );
  }
}
