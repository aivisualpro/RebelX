import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin, admin } from '@/lib/firebase-admin';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const databaseId = params.id;
    const db = getFirestoreAdmin();

    // Get all enabled tables for this database
    const tablesSnapshot = await db
      .collection('tables')
      .where('databaseId', '==', databaseId)
      .where('enabled', '==', true)
      .get();

    // TODO: Implement actual sync logic
    // For now, just update lastSyncAt for all tables
    const batch = db.batch();
    
    tablesSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();

    return NextResponse.json({
      message: `Synced ${tablesSnapshot.docs.length} tables`,
      tableCount: tablesSnapshot.docs.length,
    });

  } catch (error) {
    console.error('Error syncing database:', error);
    return NextResponse.json(
      { error: 'Failed to sync database' },
      { status: 500 }
    );
  }
}
