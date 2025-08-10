import { NextRequest, NextResponse } from 'next/server';
import { validateServiceAccountKey } from '@/lib/validation';

// For testing - simple in-memory storage
let connections: any[] = [];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, projectId, companyId, createdBy, serviceAccountKeyFile } = body;

    console.log('Received connection creation request:', { name, projectId, companyId, createdBy });

    // Validate required fields
    if (!name || !projectId || !companyId || !createdBy) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Handle file data (assuming it's sent as base64 or file content)
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

    console.log('Service account key data length:', serviceAccountKeyData.length);

    // Validate service account key
    const validation = validateServiceAccountKey(serviceAccountKeyData);
    if (!validation.valid) {
      console.log('Validation failed:', validation.error);
      return NextResponse.json(
        { error: validation.error || 'Invalid service account key' },
        { status: 400 }
      );
    }

    // Parse service account key to get email
    const serviceAccountKey = JSON.parse(serviceAccountKeyData);
    const serviceAccountEmail = serviceAccountKey.client_email;

    // For now, create a mock secret name (in production, this would use Secret Manager)
    const secretName = `projects/${projectId}/secrets/connection-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log('Creating connection with:', { name, projectId, companyId, serviceAccountEmail });

    // Create connection object (using in-memory storage for testing)
    const newConnection = {
      id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      companyId,
      name,
      projectId,
      serviceAccountEmail,
      secretName,
      createdAt: new Date(),
      createdBy,
      status: 'active',
    };

    connections.push(newConnection);

    console.log('Connection created successfully:', newConnection.id);

    return NextResponse.json({
      id: newConnection.id,
      message: 'Connection created successfully',
    });

  } catch (error) {
    console.error('Error creating connection:', error);
    
    // Log more detailed error information
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    return NextResponse.json(
      { error: 'Failed to create connection', details: error instanceof Error ? error.message : 'Unknown error' },
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

    console.log('Fetching connections for company:', companyId);

    // Filter connections by companyId
    const companyConnections = connections.filter(conn => conn.companyId === companyId);

    console.log('Found connections:', companyConnections.length);

    return NextResponse.json({ connections: companyConnections });

  } catch (error) {
    console.error('Error fetching connections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch connections' },
      { status: 500 }
    );
  }
}
