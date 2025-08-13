import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs, doc, getDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// In-memory cache for analytics data
const analyticsCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

// Helper function to get cache key
function getCacheKey(params: URLSearchParams): string {
  const keys = ['clientId', 'connectionId', 'sheetTabId', 'startDate', 'endDate', 'bookedBy', 'receptionist', 'branchManager', 'artist', 'bookPlus', 'location'];
  return keys.map(key => `${key}=${params.get(key) || ''}`).join('&');
}

function sanitizeKey(header: string): string {
  return header
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function toNumber(value: any): number {
  if (value === null || value === undefined) return 0;
  const n = Number(String(value).toString().replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// Normalize date-like strings to YYYY-MM-DD for filtering
function normalizeDate(input: any): string | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = raw.split(/[\/\-\.\s]+/);
  if (parts.length < 3) return null;
  let y = -1, m = -1, d = -1;
  const yearIdx = parts.findIndex(p => /^\d{4}$/.test(p));
  if (yearIdx !== -1) {
    y = Number(parts[yearIdx]);
    const others = parts.filter((_, i) => i !== yearIdx).map(p => Number(p));
    if (others.length >= 2) {
      const [a, b] = others;
      if (a > 12 && b <= 12) { d = a; m = b; }
      else if (b > 12 && a <= 12) { d = b; m = a; }
      else { m = a; d = b; }
    }
  } else {
    y = Number(parts[2]);
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    if (a > 12 && b <= 12) { d = a; m = b; }
    else if (b > 12 && a <= 12) { d = b; m = a; }
    else { m = a; d = b; }
  }
  if (!(y > 0 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    // This endpoint is deprecated for multi-client structures. Use /databases APIs instead.
    return NextResponse.json({ error: 'Deprecated: analytics by clients/connections/sheetTabs has been removed. Use /databases endpoints.' }, { status: 410 });
    

    // Check cache first
    const cacheKey = getCacheKey(searchParams);
    const cached = analyticsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log('Returning cached analytics data');
      return NextResponse.json(cached.data);
    }

    const recordsRef = collection(db, 'clients', clientId, 'connections', connectionId, 'sheetTabs', sheetTabId, 'records');
    // Order newest first with limit for better performance
    const qRecords = query(recordsRef, orderBy('syncedAt', 'desc'), limit(limitParam));
    const snap = await getDocs(qRecords);

    const records: any[] = [];
    for (const docSnap of snap.docs) {
      records.push({ id: docSnap.id, ...docSnap.data() });
      if (records.length >= limitParam) break;
    }

    // Map keys
    const key = (name: string) => sanitizeKey(name);

    const totalBookKey = key('Total Book');
    const clientNameKey = key('Client Name');
    const locationKey = key('Location');
    const channelKey = key('How did you know us ?');
    const rebelxTypeKey = key('Nature Booking');
    const rebelxDateKey = key('Booking Date');
    const rebelxStatusKey = key('Booking Satus');
    const totalBookPlusKey = key('Total Book Plus');
    const dueAmountKey = key('Due Amount');
    const totalPaidKey = key('Total Paid');
    const discountKey = key('Discount');
    const artistKey = key('Artist');
    const managerRatingKey = key('Manager Rating');
    const bookedByKey = key('Booked By');
    const receptionistKey = key('Receptionist');
    const branchManagerKey = key('Branch Manager');

    const paymentKeys = [
      key('Cash'), key('Mada'), key('Tabby'), key('Tamara'), key('Bank Transfer'), key('Other')
    ];

    // Aggregations
    let totalRevenue = 0;
    const distinctClients = new Set<string>();
    const distinctLocations = new Set<string>();
    const distinctChannels = new Set<string>();
    const distinctRebelxTypes = new Set<string>();
    const statusCounts: Record<string, number> = {};
    const channelCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    const paymentSums: Record<string, number> = Object.fromEntries(paymentKeys.map(k => [k, 0]));
    const turnoverByDay: Record<string, number> = {};
    const revenueByLocation: Record<string, number> = {};
    let rebelxWithUpsell = 0;
    let rebelxPaidInFullCount = 0;
    let rebelxWithPaymentObligation = 0; // Count of bookings with Total_Book > 0
    let totalPaidSum = 0;
    let totalDiscountSum = 0;
    let totalDueSum = 0;
    const distinctArtists = new Set<string>();
    const distinctBookedBy = new Set<string>();
    const distinctReceptionist = new Set<string>();
    const distinctBranchManager = new Set<string>();
    let ratingSum = 0;
    let ratingCount = 0;

    // First pass: gather option lists
    for (const r of records) {
      if (r[bookedByKey]) distinctBookedBy.add(String(r[bookedByKey]));
      if (r[receptionistKey]) distinctReceptionist.add(String(r[receptionistKey]));
      if (r[branchManagerKey]) distinctBranchManager.add(String(r[branchManagerKey]));
      if (r[artistKey]) distinctArtists.add(String(r[artistKey]));
    }

    // Second pass: apply filters and aggregate
    for (const r of records) {
      // Build day key from booking date once
      const keyDay = normalizeDate(r[rebelxDateKey]);

      // Date range filter
      if (startDate && keyDay && keyDay < startDate) continue;
      if (endDate && keyDay && keyDay > endDate) continue;

      // Field filters
      if (bookedByFilter && String(r[bookedByKey] || '').toLowerCase() !== bookedByFilter.toLowerCase()) continue;
      if (receptionistFilter && String(r[receptionistKey] || '').toLowerCase() !== receptionistFilter.toLowerCase()) continue;
      if (branchManagerFilter && String(r[branchManagerKey] || '').toLowerCase() !== branchManagerFilter.toLowerCase()) continue;
      if (artistFilter && String(r[artistKey] || '').toLowerCase() !== artistFilter.toLowerCase()) continue;
      if (bookPlusFilter === 'yes' && toNumber(r[totalBookPlusKey]) <= 0) continue;
      if (bookPlusFilter === 'no' && toNumber(r[totalBookPlusKey]) > 0) continue;
      if (locationFilter && String(r[locationKey] || '').toLowerCase() !== locationFilter.toLowerCase()) continue;
      const amount = toNumber(r[totalBookKey]);
      totalRevenue += amount;
      
      // Count bookings with payment obligation (Total_Book > 0)
      if (amount > 0) {
        rebelxWithPaymentObligation += 1;
        const due = toNumber(r[dueAmountKey]);
        if (due === 0) rebelxPaidInFullCount += 1;
      }
      
      if (r[clientNameKey]) distinctClients.add(String(r[clientNameKey]));
      if (r[locationKey]) {
        const loc = String(r[locationKey]);
        distinctLocations.add(loc);
        revenueByLocation[loc] = (revenueByLocation[loc] || 0) + amount;
      }
      if (r[channelKey]) {
        const ch = String(r[channelKey]);
        distinctChannels.add(ch);
        channelCounts[ch] = (channelCounts[ch] || 0) + 1;
      }
      if (r[rebelxTypeKey]) {
        const t = String(r[rebelxTypeKey]);
        distinctRebelxTypes.add(t);
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      }
      if (r[rebelxStatusKey]) {
        const s = String(r[rebelxStatusKey]);
        statusCounts[s] = (statusCounts[s] || 0) + 1;
      }
      const upsellValue = toNumber(r[totalBookPlusKey]);
      if (upsellValue > 0) rebelxWithUpsell += 1;
      const due = toNumber(r[dueAmountKey]);
      totalDueSum += due;
      totalPaidSum += toNumber(r[totalPaidKey]);
      totalDiscountSum += toNumber(r[discountKey]);

      // Payment method breakdown (sums)
      for (const pk of paymentKeys) {
        paymentSums[pk] += toNumber(r[pk]);
      }

      // Turnover by day
      if (keyDay) {
        turnoverByDay[keyDay] = (turnoverByDay[keyDay] || 0) + amount;
      }

      // Other metadata
      const ratingVal = toNumber(r[managerRatingKey]);
      if (ratingVal > 0) { ratingSum += ratingVal; ratingCount += 1; }
    }

    const totalRebelx = records.length;
    const averageOrderValue = totalRebelx > 0 ? totalRevenue / totalRebelx : 0;
    // Debug: Log all status values to see what we have
    console.log('Status counts:', statusCounts);
    
    // Find canceled bookings with case-insensitive matching and various spellings
    const rebelxCanceledCount = Object.entries(statusCounts).reduce((count, [status, num]) => {
      const statusLower = status.toLowerCase();
      if (statusLower.includes('cancel') || statusLower.includes('cancelled') || statusLower.includes('canceled')) {
        console.log(`Found canceled status: "${status}" with count: ${num}`);
        return count + (num as number);
      }
      return count;
    }, 0);
    
    console.log('Total canceled count:', rebelxCanceledCount);
    const cancellationRate = totalRebelx > 0 ? (rebelxCanceledCount / totalRebelx) * 100 : 0;
    console.log('Cancellation rate:', cancellationRate);
    const upsellSuccess = totalRebelx > 0 ? (rebelxWithUpsell / totalRebelx) * 100 : 0;
    const paymentSuccessRate = rebelxWithPaymentObligation > 0 ? (rebelxPaidInFullCount / rebelxWithPaymentObligation) * 100 : 0;
    const averageManagerRating = ratingCount > 0 ? ratingSum / ratingCount : 0;

    // Calculate Business Health based on KPIs
    const businessHealth = (() => {
      // Weight the KPIs for overall health calculation
      const paymentWeight = 0.4; // 40% - most important
      const cancellationWeight = 0.3; // 30% - inverted (lower is better)
      const upsellWeight = 0.2; // 20%
      const ratingWeight = 0.1; // 10%
      
      // Normalize cancellation rate (invert it since lower is better)
      const normalizedCancellationRate = Math.max(0, 100 - cancellationRate);
      
      // Normalize rating to percentage (assuming 5-star scale)
      const normalizedRating = (averageManagerRating / 5) * 100;
      
      // Calculate weighted average
      const healthScore = (
        (paymentSuccessRate * paymentWeight) +
        (normalizedCancellationRate * cancellationWeight) +
        (upsellSuccess * upsellWeight) +
        (normalizedRating * ratingWeight)
      );
      
      return Math.min(100, Math.max(0, healthScore)); // Clamp between 0-100
    })();

    // Prepare timeseries sorted by day
    const series = Object.entries(turnoverByDay)
      .filter(([d]) => !!d)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, value]) => ({ date, value }));

    const responseData = {
      meta: {
        clientId, connectionId, sheetTabId,
        recordCount: totalRebelx,
      },
      kpis: {
        totalRevenue,
        uniqueClients: distinctClients.size,
        totalLocations: distinctLocations.size,
        acquisitionChannels: distinctChannels.size,
        bookingTypes: distinctRebelxTypes.size,
        paymentSuccessRate,
        averageOrderValue,
        cancellationRate,
        upsellSuccess,
        totalPaid: totalPaidSum,
        totalDiscounts: totalDiscountSum,
        totalOutstandingDue: totalDueSum,
        uniqueArtists: distinctArtists.size,
        averageManagerRating,
        businessHealth,
      },
      distributions: {
        statusCounts,
        channelCounts,
        typeCounts,
        paymentSums,
        revenueByLocation,
      },
      turnoverSeries: series,
      headers: {
        selectedHeaders: tabData.selectedHeaders || tabData.originalHeaders || [],
      },
      options: {
        bookedBy: Array.from(distinctBookedBy).sort(),
        receptionist: Array.from(distinctReceptionist).sort(),
        branchManager: Array.from(distinctBranchManager).sort(),
        artist: Array.from(distinctArtists).sort(),
        bookPlus: ['yes', 'no'],
        location: Array.from(distinctLocations).sort(),
      },
    };

    // Cache the response
    analyticsCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
    console.log('Analytics data cached for', cacheKey);

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json({ error: 'Failed to compute analytics' }, { status: 500 });
  }
}


