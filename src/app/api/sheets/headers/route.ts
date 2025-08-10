import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { getSecretValue } from '@/lib/secrets';
import { getSheetsClient, getSheetHeaders } from '@/lib/sheets';

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, connectionId, spreadsheetId, sheetTitle, headerRow = 1 } = body;

    // Validate required fields
    if (!companyId || !connectionId || !spreadsheetId || !sheetTitle) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get connection details
    const connectionDoc = await db.collection('connections').doc(connectionId).get();
    if (!connectionDoc.exists) {
      return NextResponse.json(
        { error: 'Connection not found' },
        { status: 404 }
      );
    }

    const connection = connectionDoc.data()!;
    
    // Get service account key from Secret Manager
    const serviceAccountKeyData = await getSecretValue(connection.secretName);
    const serviceAccountKey = JSON.parse(serviceAccountKeyData);

    // Get Google Sheets client
    const sheets = await getSheetsClient(serviceAccountKey);

    // Get sheet headers
    const headers = await getSheetHeaders(sheets, spreadsheetId, sheetTitle, headerRow);

    return NextResponse.json({
      headers,
      sheetTitle,
      headerRow,
    });

  } catch (error) {
    console.error('Error fetching sheet headers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sheet headers' },
      { status: 500 }
    );
  }
}
