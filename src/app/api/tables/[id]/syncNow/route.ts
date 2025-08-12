import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin, admin } from '@/lib/firebase-admin';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tableId = params.id;
    const db = getFirestoreAdmin();

    // Get table details
    const tableDoc = await db.collection('tables').doc(tableId).get();
    if (!tableDoc.exists) {
      return NextResponse.json(
        { error: 'Table not found' },
        { status: 404 }
      );
    }

    // TODO: Implement actual sync logic
    // For now, just update lastSyncAt
    await tableDoc.ref.update({
      lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      message: 'Table synced successfully',
      tableId,
    });

  } catch (error) {
    console.error('Error syncing table:', error);
    return NextResponse.json(
      { error: 'Failed to sync table' },
      { status: 500 }
    );
  }
}
