// src/lib/upsert-with-counters.ts
import {
    CollectionReference,
    DocumentReference,
    getDoc,
    writeBatch,
    doc,
  } from 'firebase/firestore';
  import { db } from '@/lib/firebase';
  
  export type UpsertRow = {
    id: string;                 // Doc id (we use your keyColumn value)
    data: Record<string, any>;  // The row payload to write (merged)
  };
  
  function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }
  
  /**
   * Upserts rows into a collection and returns created/updated counters.
   * We determine "created" vs "updated" by checking existence before we write.
   * Batches commits (max 500 / Firestore rule).
   */
  export async function upsertBatchWithCounters(
    colRef: CollectionReference,
    rows: UpsertRow[],
    onProgress?: (p: { processed: number; created: number; updated: number }) => void
  ): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;
    let processed = 0;

    // Process in sub-batches so we don’t create too many promises at once
    const CHECK_CONCURRENCY = 50;
    let lastProgressUpdate = Date.now();
    const PROGRESS_THROTTLE_MS = 500; // Only update progress every 500ms
    
    for (const fifty of chunk(rows, CHECK_CONCURRENCY)) {
      // 1) Check existence for this small group
      const checks = await Promise.all(
        fifty.map(async (r) => {
          const ref: DocumentReference = doc(colRef, r.id);
          const snap = await getDoc(ref);
          return { row: r, ref, exists: snap.exists() };
        })
      );

      // 2) Write the small group in writeBatch chunks (≤ 500)
      for (const fiveHundred of chunk(checks, 500)) {
        const batch = writeBatch(db);
        for (const item of fiveHundred) {
          if (item.exists) updated += 1;
          else created += 1;

          batch.set(item.ref, item.row.data, { merge: true });
          processed += 1;
        }
        await batch.commit();
        
        // Throttle progress updates to prevent "dancing" values
        const now = Date.now();
        if (onProgress && (now - lastProgressUpdate >= PROGRESS_THROTTLE_MS || processed === rows.length)) {
          onProgress({ processed, created, updated });
          lastProgressUpdate = now;
        }
      }
    }

    return { created, updated };
  }