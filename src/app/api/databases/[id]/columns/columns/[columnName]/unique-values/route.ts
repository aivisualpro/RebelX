import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function GET(
  request: NextRequest,
  { params }: { params: { databaseId: string; columnName: string } }
) {
  try {
    const { databaseId, columnName } = params;
    
    if (!databaseId || !columnName) {
      return NextResponse.json({ error: 'Database ID and column name are required' }, { status: 400 });
    }

    // Sanitize column name for Firestore field access
    const sanitizedColumnName = columnName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    
    // Get all records from the collection
    const recordsRef = collection(db, databaseId);
    const recordsQuery = query(recordsRef, limit(1000)); // Limit to prevent performance issues
    const snapshot = await getDocs(recordsQuery);
    
    // Extract unique values for the specified column
    const uniqueValues = new Set<string>();
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const value = data[sanitizedColumnName] || data[columnName];
      
      if (value !== null && value !== undefined && value !== '') {
        // Handle array values (for EnumList type)
        if (Array.isArray(value)) {
          value.forEach(item => {
            if (item !== null && item !== undefined && item !== '') {
              uniqueValues.add(String(item).trim());
            }
          });
        } else {
          // Handle comma-separated values
          const stringValue = String(value).trim();
          if (stringValue.includes(',')) {
            stringValue.split(',').forEach(item => {
              const trimmedItem = item.trim();
              if (trimmedItem) {
                uniqueValues.add(trimmedItem);
              }
            });
          } else {
            uniqueValues.add(stringValue);
          }
        }
      }
    });
    
    // Convert Set to sorted array
    const sortedValues = Array.from(uniqueValues).sort((a, b) => a.localeCompare(b));
    
    return NextResponse.json({
      success: true,
      values: sortedValues,
      count: sortedValues.length
    });
    
  } catch (error) {
    console.error('Error fetching unique values:', error);
    return NextResponse.json(
      { error: 'Failed to fetch unique values' },
      { status: 500 }
    );
  }
}
