import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs, or } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// In-memory cache for user names
const userNameCache = new Map<string, { name: string; timestamp: number }>();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes cache

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const region = searchParams.get('region') || '';

    if (!email) {
      return NextResponse.json({ error: 'Email parameter is required' }, { status: 400 });
    }

    // Check cache first
    const cacheKey = `${email}-${region}`;
    const cached = userNameCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log('Returning cached user name for', email);
      return NextResponse.json({ name: cached.name });
    }

    // Search for user in the user_manager records
    const clientId = 'rebelx'; // Default client ID
    const usersRef = collection(db, 'clients', clientId, 'connections', region, 'sheetTabs', 'user_manager', 'records');
    
    // Use single query with OR condition for better performance
    const q = query(usersRef, or(
      where('email', '==', email),
      where('Email', '==', email)
    ));
    
    const querySnapshot = await getDocs(q);
    let userName = email.split('@')[0]; // Default fallback
    
    if (!querySnapshot.empty) {
      const userData = querySnapshot.docs[0].data();
      // Try different possible name fields
      const name = userData.Name || userData.name || userData.full_name || userData.fullName || userData.display_name || userData.displayName;
      if (name) {
        userName = name;
      }
    }

    // Cache the result
    userNameCache.set(cacheKey, { name: userName, timestamp: Date.now() });
    console.log('User name cached for', email);

    return NextResponse.json({ name: userName });

  } catch (error) {
    console.error('Error fetching user name:', error);
    return NextResponse.json({ error: 'Failed to fetch user name' }, { status: 500 });
  }
}
