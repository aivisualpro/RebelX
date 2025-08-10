import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Services data from a chosen sheet tab; please adjust sheetTabId if needed.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get('clientId') || 'booking-plus';
    const connectionId = searchParams.get('connectionId') || 'saudi1';
    const sheetTabId = 'booking_x'; // change to your services tab if different

    const recordsRef = collection(db, 'clients', clientId, 'connections', connectionId, 'sheetTabs', sheetTabId, 'records');
    const snap = await getDocs(recordsRef);
    const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ records });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load services report' }, { status: 500 });
  }
}


