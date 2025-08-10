import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const connectionId = params.id;

    // Get all enabled tables for this connection
    const tablesSnapshot = await db
      .collection('tables')
      .where('connectionId', '==', connectionId)
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
    console.error('Error syncing connection:', error);
    return NextResponse.json(
      { error: 'Failed to sync connection' },
      { status: 500 }
    );
  }
}
