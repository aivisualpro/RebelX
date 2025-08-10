import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const region = searchParams.get('region') || 'saudi1';

    if (!email) {
      return NextResponse.json({ error: 'Email parameter is required' }, { status: 400 });
    }

    // Search for user in the user_manager records
    const clientId = 'booking-plus'; // Default client ID
    const usersRef = collection(db, 'clients', clientId, 'connections', region, 'sheetTabs', 'user_manager', 'records');
    
    // Try both 'email' and 'Email' fields (case variations)
    const q1 = query(usersRef, where('email', '==', email));
    const q2 = query(usersRef, where('Email', '==', email));
    
    let userDoc = null;
    
    // Try first query
    const querySnapshot1 = await getDocs(q1);
    if (!querySnapshot1.empty) {
      userDoc = querySnapshot1.docs[0];
    } else {
      // Try second query
      const querySnapshot2 = await getDocs(q2);
      if (!querySnapshot2.empty) {
        userDoc = querySnapshot2.docs[0];
      }
    }

    if (userDoc) {
      const userData = userDoc.data();
      // Try different possible name fields
      const name = userData.Name || userData.name || userData.full_name || userData.fullName || userData.display_name || userData.displayName;
      
      if (name) {
        return NextResponse.json({ name: name });
      }
    }

    // If no user found or no name field, return fallback
    return NextResponse.json({ name: email.split('@')[0] });

  } catch (error) {
    console.error('Error fetching user name:', error);
    return NextResponse.json({ error: 'Failed to fetch user name' }, { status: 500 });
  }
}
