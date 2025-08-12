'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DatabaseRecordsView from '@/app/databases/components/DatabaseRecordsView';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowLeft, RefreshCw } from 'lucide-react';

/** Metadata saved on sheetTabs/{id} */
type SheetTabDoc = {
  sheetName?: string;
  collectionName?: string;
  keyColumn?: string;          // human header for key
  labelColumn?: string;        // human header for label (for master tables)
  selectedHeaders?: string[];
  originalHeaders?: string[];
};

/** Reference input config for this page */
export type RefInput = {
  /** Which human column on THIS table is a reference input (e.g., "Client") */
  column: string;
  /** Field in this table that stores the key (sanitized) e.g., client_id */
  sourceField: string;
  /** sheetTabs document id of the target master table, e.g., 'clients' */
  targetSheetTabId: string;
};

function norm(s = '') {
  return s.toString().trim().toLowerCase();
}

export default function DatabaseRecordsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [name, setName] = useState<string>('');
  const [keyColumn, setKeyColumn] = useState<string>('id');
  const [columns, setColumns] = useState<Array<{ name: string; index: number }>>([]);
  const [refInputs, setRefInputs] = useState<RefInput[]>([]);

  const load = async () => {
    try {
      setLoading(true);
      setErr('');

      const ref = doc(db, 'sheetTabs', id);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error(`Sheet tab "${id}" not found`);

      const data = snap.data() as SheetTabDoc;
      const displayName = data.sheetName || id;
      const keyCol = data.keyColumn || 'id';

      const headers =
        Array.isArray(data.selectedHeaders) && data.selectedHeaders.length > 0
          ? data.selectedHeaders
          : Array.isArray(data.originalHeaders)
          ? data.originalHeaders
          : [];

      setColumns((headers.length ? headers : [keyCol]).map((h, i) => ({ name: h, index: i })));
      setName(displayName);
      setKeyColumn(keyCol);

      // ---- Decide reference inputs for this page ----
      const coll = norm(data.collectionName || '');

      if (coll === 'activity_tracking') {
        setRefInputs([
          { column: 'Client', sourceField: 'client_id', targetSheetTabId: 'clients' },
        ]);
      } else if (coll === 'data' || norm(id) === 'data') {
        // Detect the actual header used for the SKU key on this table
        const lower = headers.map(h => h ?? '').map(norm);
        const skuHeader =
          headers[lower.indexOf('sku')] ??
          headers[lower.indexOf('sku key')] ??
          'SKU'; // fallback if not found

        // Adjust if your Firestore field name differs (e.g., 'sku', 'sku_key', 'sku_code')
        const sourceField = 'sku_id';
        // Change if your master sheet tab id differs
        const targetSheetTabId = 'skus';

        setRefInputs([
          {
            column: skuHeader,      // <- matches the visible header exactly ("SKU" in your screenshot)
            sourceField,
            targetSheetTabId,
          },
        ]);
      } else {
        setRefInputs([]);
      }
    } catch (e: any) {
      console.error('Failed to load database info:', e);
      setErr(e?.message || 'Failed to load database info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center text-white">
        <div className="flex items-center">
          <RefreshCw className="w-6 h-6 mr-3 animate-spin text-blue-400" />
          <span className="text-gray-200">Loading database…</span>
        </div>
      </div>
    );
  }  

  if (err) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
        <div className="max-w-5xl mx-auto p-6">
          <button
            onClick={() => router.back()}
            className="mb-4 inline-flex items-center text-gray-300 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>

          <div className="rounded-xl border border-red-700 bg-red-900/40 p-4 text-red-200">
            {err}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-gray-100">
      <DatabaseRecordsView
        databaseId={id}
        databaseName={name}
        columns={columns}
        keyColumn={keyColumn}
        refInputs={refInputs}
      />
    </div>
  );
}
