import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { User, UserReport } from '@/lib/types';

// In-memory cache for user reports data
const userReportsCache = new Map<string, { data: UserReport; timestamp: number }>();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes cache

function sanitizeKey(header: string): string {
  return header
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId') || 'rebelx';
    const connectionId = searchParams.get('connectionId') || 'saudi1';

    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    }

    // Check cache first
    const cacheKey = `${clientId}-${connectionId}`;
    const cached = userReportsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log('Returning cached user reports data');
      return NextResponse.json(cached.data);
    }

    // Fetch users from user_manager sheet
    const usersRef = collection(db, 'clients', clientId, 'connections', connectionId, 'sheetTabs', 'user_manager', 'records');
    const usersQuery = query(usersRef, limit(1000)); // Limit for performance
    const usersSnap = await getDocs(usersQuery);

    const users: User[] = [];
    for (const docSnap of usersSnap.docs) {
      const userData = docSnap.data();
      
      // Extract user information with flexible field mapping
      const user = {
        id: docSnap.id,
        name: userData.Name || userData.name || userData.full_name || userData.fullName || userData.display_name || userData.displayName || 'Unknown',
        role: userData.Role || userData.role || userData.position || userData.Position || userData.job_title || userData.jobTitle || 'Unknown',
        email: userData.Email || userData.email || userData.email_address || userData.emailAddress || '',
        phone: userData.Phone || userData.phone || userData.mobile || userData.Mobile || '',
        department: userData.Department || userData.department || userData.dept || userData.Dept || '',
        status: userData.Status || userData.status || userData.active || userData.Active || 'Active'
      };

      users.push(user);
    }

    // Filter and categorize users by role
    const salesOfficers = users.filter(user => {
      const role = user.role.toLowerCase();
      return role.includes('sales officer') || 
             role.includes('sales') || 
             role.includes('sales rep') ||
             role.includes('sales representative');
    });

    const artists = users.filter(user => {
      const role = user.role.toLowerCase();
      return role.includes('artist') || 
             role.includes('designer') || 
             role.includes('creative') ||
             role.includes('stylist');
    });

    const receptionists = users.filter(user => {
      const role = user.role.toLowerCase();
      return role.includes('receptionist') || 
             role.includes('reception') || 
             role.includes('front desk') ||
             role.includes('customer service');
    });

    const responseData = {
      users: users,
      summary: {
        total: users.length,
        salesOfficers: salesOfficers.length,
        artists: artists.length,
        receptionists: receptionists.length
      },
      categorized: {
        salesOfficers,
        artists,
        receptionists
      }
    };

    // Cache the response
    userReportsCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
    console.log('User reports data cached for', cacheKey);

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Error fetching user reports:', error);
    return NextResponse.json({ error: 'Failed to fetch user reports' }, { status: 500 });
  }
}
