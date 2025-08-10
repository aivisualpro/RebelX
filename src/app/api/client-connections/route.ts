import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, orderBy, Timestamp, doc, setDoc } from 'firebase/firestore';
import { secretManagerService } from '@/lib/secretManager';
import { validateServiceAccountKey } from '@/lib/validation';
import { google } from 'googleapis';
import { ClientConnection } from '@/lib/types';

// GET /api/client-connections - Fetch all client connections
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId') || 'default';
    const clientId = searchParams.get('clientId');

    console.log('Fetching client connections for company:', companyId, 'client:', clientId);

    let connections: ClientConnection[] = [];

    if (clientId) {
      // Get connections for a specific client as subcollection
      const connectionsQuery = query(
        collection(db, 'clients', clientId, 'connections'),
        where('companyId', '==', companyId)
      );
      const querySnapshot = await getDocs(connectionsQuery);
      connections = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ClientConnection[];
    } else {
      // Get all connections for the company by querying all clients
      const clientsQuery = query(
        collection(db, 'clients'),
        where('companyId', '==', companyId)
      );
      const clientsSnapshot = await getDocs(clientsQuery);
      
      // Get connections from all clients
      for (const clientDoc of clientsSnapshot.docs) {
        const connectionsQuery = query(
          collection(db, 'clients', clientDoc.id, 'connections')
        );
        const connectionsSnapshot = await getDocs(connectionsQuery);
        const clientConnections = connectionsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as ClientConnection[];
        connections.push(...clientConnections);
      }
    }

    // Sort by createdAt on client side to avoid index requirements
    connections.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

    // Filter active connections
    const activeConnections = connections.filter(conn => conn.status === 'active');

    console.log('Found client connections:', activeConnections.length);

    return NextResponse.json({
      connections: activeConnections,
    });
  } catch (error) {
    console.error('Error fetching client connections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch client connections' },
      { status: 500 }
    );
  }
}

// POST /api/client-connections - Create a new client connection
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, clientId, name, projectId, spreadsheetId, serviceAccountKeyFile, createdBy } = body;

    console.log('Creating client connection for client:', clientId);

    // Validate required fields
    if (!companyId || !clientId || !name || !projectId || !spreadsheetId || !serviceAccountKeyFile || !createdBy) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate service account key
    const validation = validateServiceAccountKey(serviceAccountKeyFile);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || 'Invalid service account key' },
        { status: 400 }
      );
    }

    const serviceAccountKey = JSON.parse(serviceAccountKeyFile);

    // Store service account key in Secret Manager (or use alternative storage for development)
    const secretName = `service-account-${Date.now()}`;
    let serviceAccountEmail = '';
    
    try {
      // For development, we'll store a reference and use the key directly
      // In production, you'd want to use Secret Manager properly
      serviceAccountEmail = serviceAccountKey.client_email;
      
      // Try to store in Secret Manager, but don't fail if it doesn't work
      try {
        await secretManagerService.storeSecret(projectId, secretName, serviceAccountKeyFile);
        console.log('Service account key stored in Secret Manager successfully');
      } catch (secretError) {
        console.warn('Could not store in Secret Manager, using alternative storage:', secretError);
        // For development purposes, we'll continue without Secret Manager
        // In production, you'd want this to fail or use an alternative secure storage
      }
    } catch (error) {
      console.error('Error processing service account key:', error);
      return NextResponse.json(
        { error: 'Invalid service account key format' },
        { status: 400 }
      );
    }

    // Get spreadsheet name using the service account
    let spreadsheetName = 'Unknown';
    try {
      const auth = new google.auth.GoogleAuth({
        credentials: serviceAccountKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });

      const sheets = google.sheets({ version: 'v4', auth });
      const response = await sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId,
      });

      spreadsheetName = response.data.properties?.title || 'Unknown';
    } catch (error) {
      console.error('Error fetching spreadsheet name:', error);
      // Continue with unknown name rather than failing
    }

    // Create client connection in Firestore as subcollection under client
    const connectionData = {
      companyId,
      clientId,
      name,
      projectId,
      serviceAccountEmail,
      secretName,
      spreadsheetId,
      spreadsheetName,
      createdAt: Timestamp.now(),
      createdBy,
      status: 'active' as const,
      // TEMPORARY: Store service account key for development
      // In production, remove this and use Secret Manager properly
      ...(process.env.NODE_ENV === 'development' && { 
        serviceAccountKeyFile: serviceAccountKeyFile 
      }),
    };

    // Store connection as subcollection under the client with user-friendly ID
    // Use the connection name as the document ID (sanitized for Firestore)
    const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const docId = sanitizedName || `connection-${Date.now()}`;
    
    const docRef = doc(db, 'clients', clientId, 'connections', docId);
    await setDoc(docRef, connectionData);

    console.log('Client connection created with ID:', docId);

    return NextResponse.json({
      id: docId,
      ...connectionData,
    });
  } catch (error) {
    console.error('Error creating client connection:', error);
    return NextResponse.json(
      { error: 'Failed to create client connection' },
      { status: 500 }
    );
  }
}
