'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DatabaseRecordsView from '@/app/databases/components/DatabaseRecordsView';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowLeft, RefreshCw } from 'lucide-react';

type SheetTabDoc = {
  sheetName?: string;
  collectionName?: string;
  keyColumn?: string;
  selectedHeaders?: string[];
  originalHeaders?: string[];
};

export default function DatabaseRecordsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [name, setName] = useState<string>('');
  const [keyColumn, setKeyColumn] = useState<string>('id');
  const [columns, setColumns] = useState<Array<{ name: string; index: number }>>([]);


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

      setColumns(
        (headers.length ? headers : [keyCol]).map((h, i) => ({ name: h, index: i }))
      );
      setName(displayName);
      setKeyColumn(keyCol);
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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="flex items-center text-gray-700 dark:text-gray-200">
          <RefreshCw className="w-6 h-6 mr-3 animate-spin" />
          Loading database…
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-5xl mx-auto p-6">
          <button
            onClick={() => router.back()}
            className="mb-4 inline-flex items-center text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>

          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 p-4 text-red-700 dark:text-red-300">
            {err}
          </div>
        </div>
      </div>
    );
  }

  return (
    <DatabaseRecordsView
      databaseId={id}
      databaseName={name}
      columns={columns}
      keyColumn={keyColumn}
    />
  );
}
