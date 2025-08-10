import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { Client } from '@/lib/types';

// GET /api/clients-only - Fetch clients (not connections)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId') || 'default';

    console.log('Fetching clients for company:', companyId);

    const q = query(
      collection(db, 'clients'),
      where('companyId', '==', companyId)
    );

    const querySnapshot = await getDocs(q);
    const clients = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Client[];

    // Sort by createdAt on client side to avoid index requirements
    clients.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

    // Filter active clients
    const activeClients = clients.filter(client => client.status === 'active');

    console.log('Found clients:', activeClients.length);

    return NextResponse.json({
      clients: activeClients,
    });
  } catch (error) {
    console.error('Error fetching clients:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clients' },
      { status: 500 }
    );
  }
}

// POST /api/clients-only - Create a new client
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, name, email, phone, address, createdBy } = body;

    console.log('Creating client:', name);

    // Validate required fields
    if (!companyId || !name || !createdBy) {
      return NextResponse.json(
        { error: 'Missing required fields: companyId, name, createdBy' },
        { status: 400 }
      );
    }

    // Create client in Firestore
    const clientData = {
      companyId,
      name,
      email: email || '',
      phone: phone || '',
      address: address || '',
      createdAt: Timestamp.now(),
      createdBy,
      status: 'active' as const,
    };

    const docRef = await addDoc(collection(db, 'clients'), clientData);

    console.log('Client created with ID:', docRef.id);

    return NextResponse.json({
      id: docRef.id,
      ...clientData,
    });
  } catch (error) {
    console.error('Error creating client:', error);
    return NextResponse.json(
      { error: 'Failed to create client' },
      { status: 500 }
    );
  }
}
