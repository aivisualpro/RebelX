import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin, admin } from '@/lib/firebase-admin';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const connectionId = params.id;
    const db = getFirestoreAdmin();

    // Get all enabled tables for this connection
    const tablesSnapshot = await db
      .collection('tables')
      .where('connectionId', '==', connectionId)
      .where('enabled', '==', true)
      .get();

    // TODO: Implement actual sync logic
    // For now, just update lastSyncAt for all tables
    const batch = db.batch();
    
    tablesSnapshot.docs.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
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
    console.error('Error syncing connection:', error);
    return NextResponse.json(
      { error: 'Failed to sync connection' },
      { status: 500 }
    );
  }
}
