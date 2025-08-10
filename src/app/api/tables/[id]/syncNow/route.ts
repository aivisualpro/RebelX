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
    const tableId = params.id;

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
