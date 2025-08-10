import { NextRequest, NextResponse } from 'next/server';
import { collection, addDoc, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { validateServiceAccountKey, validateSpreadsheetId } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, projectId, companyId, createdBy, serviceAccountKeyFile, spreadsheetId } = body;

    console.log('Received client creation request:', { name, projectId, companyId, createdBy, spreadsheetId });

    // Validate required fields
    if (!name || !projectId || !companyId || !createdBy || !spreadsheetId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Handle service account key validation
    let serviceAccountKeyData: string;
    
    if (typeof serviceAccountKeyFile === 'string') {
      serviceAccountKeyData = serviceAccountKeyFile;
    } else if (serviceAccountKeyFile && serviceAccountKeyFile.content) {
      serviceAccountKeyData = serviceAccountKeyFile.content;
    } else {
      return NextResponse.json(
        { error: 'Service account key file is required' },
        { status: 400 }
      );
    }

    // Validate service account key
    const validation = validateServiceAccountKey(serviceAccountKeyData);
    if (!validation.valid) {
      console.log('Validation failed:', validation.error);
      return NextResponse.json(
        { error: validation.error || 'Invalid service account key' },
        { status: 400 }
      );
    }

    // Validate spreadsheet ID
    const cleanSpreadsheetId = spreadsheetId.includes('/') 
      ? spreadsheetId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || spreadsheetId
      : spreadsheetId;

    if (!validateSpreadsheetId(cleanSpreadsheetId)) {
      return NextResponse.json(
        { error: 'Invalid spreadsheet ID format' },
        { status: 400 }
      );
    }

    // Parse service account key to get email
    const serviceAccountKey = JSON.parse(serviceAccountKeyData);
    const serviceAccountEmail = serviceAccountKey.client_email;

    // Create mock secret name (in production, this would use Secret Manager)
    const secretName = `projects/${projectId}/secrets/client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create mock spreadsheet name
    const spreadsheetName = `Client Spreadsheet (${cleanSpreadsheetId.substring(0, 8)}...)`;

    console.log('Creating client with:', { name, projectId, companyId, serviceAccountEmail, cleanSpreadsheetId });

    // Save client to Firebase
    const clientData = {
      companyId,
      name,
      projectId,
      serviceAccountEmail,
      serviceAccountKey: serviceAccountKey, // Store the parsed key object
      secretName,
      spreadsheetId: cleanSpreadsheetId,
      spreadsheetName,
      isActive: true,
      createdAt: Timestamp.now(),
      createdBy,
      lastSyncAt: null,
    };

    // Add client to Firestore
    const clientRef = await addDoc(collection(db, 'clients'), clientData);

    console.log('Client created successfully in Firebase:', clientRef.id);

    return NextResponse.json({
      id: clientRef.id,
      spreadsheetName,
      message: 'Client created successfully',
    });

  } catch (error) {
    console.error('Error creating client:', error);
    
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    return NextResponse.json(
      { error: 'Failed to create client', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      );
    }

    console.log('Fetching clients for company:', companyId);

    // Query clients from Firebase (simple query to avoid index requirement)
    const clientsQuery = query(
      collection(db, 'clients'),
      where('companyId', '==', companyId)
    );

    const snapshot = await getDocs(clientsQuery);
    
    const companyClients = snapshot.docs
      .map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Convert Firestore Timestamp to serializable format
          createdAt: data.createdAt?.toDate().toISOString(),
          lastSyncAt: data.lastSyncAt?.toDate().toISOString() || null,
          // Don't expose sensitive service account key in the response
          serviceAccountKey: undefined,
        };
      })
      .filter((client: any) => client.isActive !== false) // Filter active clients on the client side
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); // Sort by created date desc

    console.log('Found clients:', companyClients.length);

    return NextResponse.json({ clients: companyClients });

  } catch (error) {
    console.error('Error fetching clients:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clients' },
      { status: 500 }
    );
  }
}
