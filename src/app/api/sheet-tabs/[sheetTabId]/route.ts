import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Update sheet tab configuration (e.g., selected columns, key column)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { sheetTabId: string } }
) {
  try {
    const { sheetTabId } = params;
    const body = await request.json();
    const { clientId, connectionId, selectedColumns, keyColumn } = body as {
      clientId: string;
      connectionId: string;
      selectedColumns?: string[];
      keyColumn?: string;
    };

    if (!sheetTabId || !clientId || !connectionId) {
      return NextResponse.json(
        { error: 'sheetTabId, clientId and connectionId are required' },
        { status: 400 }
      );
    }

    const tabRef = doc(db, 'clients', clientId, 'connections', connectionId, 'sheetTabs', sheetTabId);
    const tabSnap = await getDoc(tabRef);
    if (!tabSnap.exists()) {
      return NextResponse.json({ error: 'Sheet tab not found' }, { status: 404 });
    }

    const updates: Record<string, any> = {};
    if (Array.isArray(selectedColumns)) {
      const clean = selectedColumns
        .filter((c) => typeof c === 'string' && c.trim().length > 0)
        .map((c) => c.toString());
      const finalSet = new Set(clean);
      const currentKey = (keyColumn || (tabSnap.data() as any).keyColumn) as string;
      if (currentKey && !finalSet.has(currentKey)) finalSet.add(currentKey);
      updates.selectedColumns = Array.from(finalSet);
      // headerOrder/selectedHeaders will be regenerated on next sync
      updates.headerOrder = null;
      updates.selectedHeaders = null;
    }
    if (typeof keyColumn === 'string' && keyColumn.trim().length > 0) {
      updates.keyColumn = keyColumn;
    }

    await updateDoc(tabRef, updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating sheet tab:', error);
    return NextResponse.json({ error: 'Failed to update sheet tab' }, { status: 500 });
  }
}

// Delete a sheet tab configuration (does not delete stored records)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { sheetTabId: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const { sheetTabId } = params;
    const clientId = searchParams.get('clientId');
    const connectionId = searchParams.get('connectionId');

    if (!sheetTabId || !clientId || !connectionId) {
      return NextResponse.json(
        { error: 'sheetTabId, clientId and connectionId are required' },
        { status: 400 }
      );
    }

    const tabRef = doc(db, 'clients', clientId, 'connections', connectionId, 'sheetTabs', sheetTabId);
    await deleteDoc(tabRef);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting sheet tab:', error);
    return NextResponse.json({ error: 'Failed to delete sheet tab' }, { status: 500 });
  }
}


