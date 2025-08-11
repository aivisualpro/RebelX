'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  SortAsc,
  SortDesc,
  Download,
  RefreshCw,
  Eye,
  Plus,
  Edit3,
  Trash2,
  MoveHorizontal,
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

/** ------- GSAP dynamic loader (avoid build-time/SSR issues) ------- */
let _gsap: any;
async function getGsap() {
  if (_gsap) return _gsap;
  const mod = await import('gsap');
  _gsap = (mod as any).default ?? (mod as any).gsap ?? mod;
  return _gsap;
}
/** ----------------------------------------------------------------- */

interface DatabaseRecord {
  id: string;
  [key: string]: any;
}

interface DatabaseRecordsViewProps {
  databaseId: string;
  databaseName: string;
  columns: Array<{ name: string; index: number }>;
  keyColumn: string;
}

/* ---------- utils ---------- */

function sanitizeHeaderForFirestore(header: string): string {
  return (header ?? '')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function isHttpsUrl(v: unknown) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  return s.toLowerCase().startsWith('https://');
}

function useDebouncedFn<T extends (...args: any[]) => void>(fn: T, delay = 400) {
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (...args: Parameters<T>) => {
      if (ref.current) clearTimeout(ref.current);
      ref.current = setTimeout(() => fn(...args), delay);
    },
    [fn, delay]
  );
}

/* ---------- Toasts (GSAP) ---------- */

type ToastKind = 'success' | 'error' | 'info';
type ToastItem = { id: string; kind: ToastKind; text: string };

function Toasts({ items, remove }: { items: ToastItem[]; remove: (id: string) => void }) {
  return (
    <div className="fixed top-4 right-4 z-[150] space-y-2 pointer-events-none">
      {items.map((t) => (
        <Toast key={t.id} item={t} onDone={() => remove(t.id)} />
      ))}
    </div>
  );
}

function Toast({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    let tl: any;
    getGsap().then((gsap) => {
      tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.fromTo(el, { y: -16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35 })
        .to(el, { y: 0, opacity: 1, duration: 2.2 })
        .to(el, { y: -16, opacity: 0, duration: 0.35, onComplete: onDone });
    });
    return () => {
      if (tl) tl.kill();
    };
  }, [onDone]);

  const color =
    item.kind === 'success'
      ? 'bg-emerald-600'
      : item.kind === 'error'
      ? 'bg-red-600'
      : 'bg-slate-700';

  return (
    <div
      ref={ref}
      className={`pointer-events-auto ${color} text-white text-sm px-3 py-2 rounded-lg shadow-lg`}
    >
      {item.text}
    </div>
  );
}

/* ---------- Confirm (GSAP) ---------- */

function ConfirmDialog({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const card = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!wrap.current || !card.current || !open) return;
    getGsap().then((gsap) => {
      gsap.set(wrap.current!, { opacity: 0 });
      gsap.set(card.current!, { y: 20, opacity: 0, scale: 0.98 });
      gsap.to(wrap.current!, { opacity: 1, duration: 0.2, ease: 'power2.out' });
      gsap.to(card.current!, { y: 0, opacity: 1, scale: 1, duration: 0.28, ease: 'power3.out' });
    });
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={wrap}
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        ref={card}
        onClick={(e) => e.stopPropagation()}
        className="w-[420px] max-w-full rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl p-5"
      >
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Main ---------- */

export default function DatabaseRecordsView({
  databaseId,
  databaseName,
  columns,
  keyColumn,
}: DatabaseRecordsViewProps) {
  const router = useRouter();

  /* toasts */
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const pushToast = (kind: ToastKind, text: string) =>
    setToasts((s) => [...s, { id: Math.random().toString(36).slice(2), kind, text }]);
  const removeToast = (id: string) => setToasts((s) => s.filter((t) => t.id !== id));

  /* confirm */
  const [confirm, setConfirm] = useState<{
    open: boolean;
    onYes?: () => void;
    title?: string;
    message?: string;
  }>({ open: false });

  // ---- table/query state
  const [records, setRecords] = useState<DatabaseRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [recordsPerPage, setRecordsPerPage] = useState<number>(25);
  const totalPages = Math.max(1, Math.ceil(totalRecords / Math.max(1, recordsPerPage)));

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortColumnHuman, setSortColumnHuman] = useState<string>(keyColumn);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // ---- column visibility + widths (persisted)
  const colMap = useMemo(
    () => columns.map((c) => ({ human: c.name, key: sanitizeHeaderForFirestore(c.name) })),
    [columns]
  );
  const allColumnNames = useMemo(() => columns.map((c) => c.name), [columns]);

  const [visibleCols, setVisibleCols] = useState<string[]>(allColumnNames);
  const [widths, setWidths] = useState<Record<string, number>>({}); // key: sanitized header, value: px

  // Load saved preferences once
  useEffect(() => {
    (async () => {
      try {
        const ref = doc(db, 'sheetTabs', databaseId);
        const snap = await getDoc(ref);
        const data = snap.exists() ? snap.data() : {};
        const savedHidden = (data as any)?.uiHiddenColumns || [];
        const savedWidths = (data as any)?.uiColumnWidths || {};

        const startVisible = allColumnNames.filter((h) => !savedHidden.includes(h));
        setVisibleCols(startVisible.length ? startVisible : allColumnNames);
        setWidths(savedWidths || {});
      } catch (e) {
        console.warn('Could not load UI prefs', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseId]);

  // Save prefs (debounced)
  const savePrefs = useDebouncedFn(
    async (nextVisible: string[], nextWidths: Record<string, number>) => {
      try {
        const ref = doc(db, 'sheetTabs', databaseId);
        const hidden = allColumnNames.filter((h) => !nextVisible.includes(h));
        await updateDoc(ref, {
          uiHiddenColumns: hidden,
          uiColumnWidths: nextWidths,
        });
      } catch (e) {
        console.warn('Failed to persist UI prefs', e);
      }
    },
    500
  );

  // ---- resize mode
  const [resizeMode, setResizeMode] = useState(false);
  const drag = useRef<{ key: string; startX: number; startW: number } | null>(null);

  const onDownResize = (e: React.MouseEvent, headerHuman: string) => {
    if (!resizeMode) return;
    const key = sanitizeHeaderForFirestore(headerHuman);
    const startW =
      widths[key] ?? (e.currentTarget.parentElement as HTMLElement)?.offsetWidth ?? 160;
    drag.current = { key, startX: e.clientX, startW };
    window.addEventListener('mousemove', onMoveResize);
    window.addEventListener('mouseup', onUpResize);
    e.preventDefault();
    e.stopPropagation();
  };
  const onMoveResize = (e: MouseEvent) => {
    if (!drag.current) return;
    const delta = e.clientX - drag.current.startX;
    const newW = Math.max(80, Math.min(800, drag.current.startW + delta));
    setWidths((w) => {
      const next = { ...w, [drag.current!.key]: newW };
      savePrefs(visibleCols, next);
      return next;
    });
  };
  const onUpResize = () => {
    drag.current = null;
    window.removeEventListener('mousemove', onMoveResize);
    window.removeEventListener('mouseup', onUpResize);
  };

  const toggleCol = (human: string) => {
    setVisibleCols((prev) => {
      const next = prev.includes(human) ? prev.filter((n) => n !== human) : [...prev, human];
      savePrefs(next, widths);
      return next;
    });
  };

  const showAllCols = () => {
    setVisibleCols(allColumnNames);
    savePrefs(allColumnNames, widths);
  };
  const hideAllCols = () => {
    setVisibleCols([]);
    savePrefs([], widths);
  };

  const sortByKey = useMemo(() => {
    const found = colMap.find((c) => c.human === sortColumnHuman);
    return found?.key ?? sanitizeHeaderForFirestore(sortColumnHuman);
  }, [colMap, sortColumnHuman]);

  // ---- add/edit/delete modals
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState<null | DatabaseRecord>(null);
  const [submitting, setSubmitting] = useState(false);

  const [draft, setDraft] = useState<Record<string, string>>({});
  const startAdd = () => {
    const blank: Record<string, string> = {};
    visibleCols.forEach((h) => (blank[h] = ''));
    setDraft(blank);
    setShowAdd(true);
  };
  const startEdit = (rec: DatabaseRecord) => {
    const d: Record<string, string> = {};
    visibleCols.forEach((h) => {
      const k = sanitizeHeaderForFirestore(h);
      d[h] = rec[k] ?? rec[h] ?? '';
    });
    setDraft(d);
    setShowEdit(rec);
  };

  const onDraftChange = (h: string, v: string) => setDraft((prev) => ({ ...prev, [h]: v }));

  const makePayloadFromDraft = () => {
    const data: Record<string, any> = {};
    for (const h of Object.keys(draft)) {
      const k = sanitizeHeaderForFirestore(h);
      data[k] = draft[h];
    }
    return { data };
  };

  const createRecord = async () => {
    try {
      setSubmitting(true);
      const res = await fetch(`/api/databases/${databaseId}/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makePayloadFromDraft()),
      });
      if (!res.ok) throw new Error((await res.text()) || res.statusText);
      setShowAdd(false);
      pushToast('success', 'Record created');
      await hardRefresh();
    } catch (e: any) {
      pushToast('error', `Create failed: ${e?.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const saveEdit = async () => {
    if (!showEdit?.id) return;
    try {
      setSubmitting(true);
      const res = await fetch(
        `/api/databases/${databaseId}/records?id=${encodeURIComponent(showEdit.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(makePayloadFromDraft()),
        }
      );
      if (!res.ok) throw new Error((await res.text()) || res.statusText);
      setShowEdit(null);
      pushToast('success', 'Record updated');
      await hardRefresh();
    } catch (e: any) {
      pushToast('error', `Update failed: ${e?.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const requestDelete = (rec: DatabaseRecord) => {
    setConfirm({
      open: true,
      title: 'Delete record',
      message: 'Are you sure you want to delete this record? This action cannot be undone.',
      onYes: () => doDelete(rec),
    });
  };

  const doDelete = async (rec: DatabaseRecord) => {
    setConfirm({ open: false });
    try {
      const res = await fetch(
        `/api/databases/${databaseId}/records?id=${encodeURIComponent(rec.id)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error((await res.text()) || res.statusText);
      pushToast('success', 'Record deleted');
      await hardRefresh();
    } catch (e: any) {
      pushToast('error', `Delete failed: ${e?.message || 'Unknown error'}`);
    }
  };

  // ---- data loading (debounced)
  const fetchingRef = useRef<AbortController | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const hardRefresh = async () => setRefreshTick((t) => t + 1);

  useEffect(() => {
    const ac = new AbortController();
    fetchingRef.current?.abort();
    fetchingRef.current = ac;

    setLoading(true);
    setError('');

    const timer = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({
          page: String(currentPage),
          limit: String(recordsPerPage),
          search: searchTerm,
          sortBy: sortByKey,
          sortOrder: sortDirection,
        });
        const res = await fetch(
          `/api/databases/${encodeURIComponent(databaseId)}/records?${qs.toString()}`,
          { signal: ac.signal }
        );
        if (!res.ok) throw new Error((await res.text()) || res.statusText);
        const data = await res.json();
        setRecords(Array.isArray(data.records) ? data.records : []);
        setTotalRecords(typeof data.total === 'number' ? data.total : 0);
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          console.error(e);
          setError(e?.message || 'Failed to load records');
          setRecords([]);
          setTotalRecords(0);
        }
      } finally {
        setLoading(false);
        if (fetchingRef.current === ac) fetchingRef.current = null;
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseId, currentPage, recordsPerPage, searchTerm, sortByKey, sortDirection, refreshTick]);

  // ---- sorting helpers
  const handleSort = (human: string) => {
    if (sortColumnHuman === human) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumnHuman(human);
      setSortDirection('asc');
      setCurrentPage(1);
    }
  };

  const goToPage = (p: number) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));

  const getPageNumbers = () => {
    const last = totalPages;
    if (last <= 1) return [1];
    const delta = 2;
    const left = Math.max(2, currentPage - delta);
    const right = Math.min(last - 1, currentPage + delta);
    const out: (number | '...')[] = [1];
    if (left > 2) out.push('...');
    for (let i = left; i <= right; i++) out.push(i);
    if (right < last - 1) out.push('...');
    out.push(last);
    return out;
  };

  const exportPageCsv = () => {
    const headers = visibleCols.join(',');
    const rows = records.map((r) =>
      visibleCols
        .map((h) => {
          const k = sanitizeHeaderForFirestore(h);
          const val = r[k] ?? r[h] ?? '';
          const txt = String(val).replace(/"/g, '""');
          return `"${txt}"`;
        })
        .join(',')
    );
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeHeaderForFirestore(databaseName)}_page${currentPage}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Toasts items={toasts} remove={removeToast} />
      <ConfirmDialog
        open={confirm.open}
        title={confirm.title || 'Confirm'}
        message={confirm.message || 'Are you sure?'}
        onCancel={() => setConfirm({ open: false })}
        onConfirm={() => confirm.onYes?.()}
      />

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => router.back()}
                  className="flex items-center text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors text-sm"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Databases
                </button>
                <div className="h-5 w-px bg-gray-300 dark:bg-gray-600" />
                <div>
                  <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {databaseName}
                  </h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {totalRecords.toLocaleString()} records
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setResizeMode((r) => !r)}
                  className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md border ${
                    resizeMode
                      ? 'border-blue-500 text-blue-700 bg-blue-50'
                      : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700'
                  } hover:bg-gray-50 dark:hover:bg-gray-600`}
                  title="Enable/disable drag to resize columns"
                >
                  <MoveHorizontal className="w-4 h-4 mr-1" />
                  {resizeMode ? 'Resizing ON' : 'Resize columns'}
                </button>
                <button
                  onClick={startAdd}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Record
                </button>
                <button
                  onClick={() => hardRefresh()}
                  disabled={loading}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  onClick={exportPageCsv}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Export page
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Search / page size / column chooser */}
          <div className="mb-4 flex flex-col md:flex-row gap-3 md:items-center">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search records..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={recordsPerPage}
                onChange={(e) => {
                  setRecordsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>

              {/* Column chooser */}
              <details className="relative">
                <summary className="list-none px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 inline-flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  Columns
                </summary>
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 z-20">
                  <button
                    onClick={showAllCols}
                    className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                  >
                    Show all
                  </button>
                  <button
                    onClick={hideAllCols}
                    className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 mb-1"
                  >
                    Hide all
                  </button>
                  <div className="max-h-64 overflow-y-auto pr-1">
                    {allColumnNames.map((h) => (
                      <label
                        key={h}
                        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-200"
                      >
                        <input
                          type="checkbox"
                          checked={visibleCols.includes(h)}
                          onChange={() => toggleCol(h)}
                          className="h-4 w-4"
                        />
                        <span className="truncate" title={h}>
                          {h}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </details>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-56">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                <span className="ml-2 text-sm text-gray-600 dark:text-gray-300">Loading…</span>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-56 text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            ) : records.length === 0 ? (
              <div className="flex items-center justify-center h-56 text-gray-500 dark:text-gray-400 text-sm">
                No records found
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        {visibleCols.map((human) => {
                          const k = sanitizeHeaderForFirestore(human);
                          const w = widths[k];
                          return (
                            <th
                              key={human}
                              onClick={() => handleSort(human)}
                              className="relative px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider select-none"
                              style={w ? { width: w, maxWidth: w, minWidth: w } : undefined}
                            >
                              <div className="flex items-center gap-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600">
                                <span className="truncate">{human}</span>
                                {sortColumnHuman === human &&
                                  (sortDirection === 'asc' ? (
                                    <SortAsc className="w-3.5 h-3.5" />
                                  ) : (
                                    <SortDesc className="w-3.5 h-3.5" />
                                  ))}
                              </div>

                              {/* resizer */}
                              {resizeMode && (
                                <div
                                  onMouseDown={(e) => onDownResize(e, human)}
                                  className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400/50"
                                />
                              )}
                            </th>
                          );
                        })}
                        <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {records.map((record, rowIdx) => (
                        <tr
                          key={record.id || rowIdx}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          {visibleCols.map((human) => {
                            const k = sanitizeHeaderForFirestore(human);
                            const raw = record[k] ?? record[human] ?? '';
                            const text = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
                            const w = widths[k];
                            return (
                              <td
                                key={human}
                                className="px-4 py-2 text-xs text-gray-900 dark:text-gray-100 align-top"
                                style={w ? { width: w, maxWidth: w, minWidth: w } : undefined}
                              >
                                <div className="whitespace-normal break-words">
                                  {isHttpsUrl(text) ? (
                                    <a
                                      href={text}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:underline break-words"
                                    >
                                      {text}
                                    </a>
                                  ) : (
                                    text || '—'
                                  )}
                                </div>
                              </td>
                            );
                          })}
                          <td className="px-4 py-2 text-xs">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => startEdit(record)}
                                className="inline-flex items-center px-2 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100"
                                title="Edit"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => requestDelete(record)}
                                className="inline-flex items-center px-2 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="bg-white dark:bg-gray-800 px-4 py-2 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <div className="hidden sm:block text-xs text-gray-600 dark:text-gray-300">
                        Showing{' '}
                        <span className="font-medium">
                          {totalRecords === 0 ? 0 : (currentPage - 1) * recordsPerPage + 1}
                        </span>{' '}
                        to{' '}
                        <span className="font-medium">
                          {Math.min(currentPage * recordsPerPage, totalRecords)}
                        </span>{' '}
                        of <span className="font-medium">{totalRecords}</span>
                      </div>
                      <nav className="inline-flex rounded-md shadow-sm -space-x-px">
                        <button
                          onClick={() => goToPage(1)}
                          disabled={currentPage === 1}
                          className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-l-md disabled:opacity-50"
                        >
                          <ChevronsLeft className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => goToPage(currentPage - 1)}
                          disabled={currentPage === 1}
                          className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-50"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        {getPageNumbers().map((n, i) =>
                          n === '...' ? (
                            <span
                              key={`dots-${i}`}
                              className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                            >
                              …
                            </span>
                          ) : (
                            <button
                              key={`p-${n}`}
                              onClick={() => goToPage(Number(n))}
                              className={`px-3 py-1.5 text-xs border ${
                                currentPage === n
                                  ? 'bg-blue-50 dark:bg-blue-900 border-blue-500 text-blue-700 dark:text-blue-200'
                                  : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                              }`}
                            >
                              {n}
                            </button>
                          )
                        )}
                        <button
                          onClick={() => goToPage(currentPage + 1)}
                          disabled={currentPage === totalPages}
                          className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-50"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => goToPage(totalPages)}
                          disabled={currentPage === totalPages}
                          className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-r-md disabled:opacity-50"
                        >
                          <ChevronsRight className="w-4 h-4" />
                        </button>
                      </nav>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Add modal */}
      {showAdd && (
        <Modal
          title="Add Record"
          onClose={() => setShowAdd(false)}
          submitLabel="Create"
          submitting={submitting}
          onSubmit={createRecord}
        >
          <RecordForm
            columns={visibleCols}
            draft={draft}
            onChange={onDraftChange}
            keyColumn={keyColumn}
            mode="add"
          />
        </Modal>
      )}

      {/* Edit modal */}
      {showEdit && (
        <Modal
          title={`Edit Record ${showEdit.id}`}
          onClose={() => setShowEdit(null)}
          submitLabel="Save changes"
          submitting={submitting}
          onSubmit={saveEdit}
        >
          <RecordForm
            columns={visibleCols}
            draft={draft}
            onChange={onDraftChange}
            keyColumn={keyColumn}
            mode="edit"
          />
        </Modal>
      )}
    </>
  );
}

/* ---------- Modal + Form (GSAP in Modal) ---------- */

function Modal({
  title,
  onClose,
  submitting,
  submitLabel,
  onSubmit,
  children,
}: {
  title: string;
  onClose: () => void;
  submitting: boolean;
  submitLabel: string;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const card = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!wrap.current || !card.current) return;
    getGsap().then((gsap) => {
      gsap.set(wrap.current!, { opacity: 0 });
      gsap.set(card.current!, { y: 20, opacity: 0, scale: 0.98 });
      gsap.to(wrap.current!, { opacity: 1, duration: 0.2, ease: 'power2.out' });
      gsap.to(card.current!, { y: 0, opacity: 1, scale: 1, duration: 0.28, ease: 'power3.out' });
    });
  }, []);

  return (
    <div
      ref={wrap}
      className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={card}
        onClick={(e) => e.stopPropagation()}
        className="w-[720px] max-w-full rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl"
      >
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">{title}</div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
        <div className="px-5 pb-5 flex justify-end">
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function RecordForm({
  columns,
  draft,
  onChange,
  keyColumn,
  mode,
}: {
  columns: string[];
  draft: Record<string, string>;
  onChange: (h: string, v: string) => void;
  keyColumn: string;
  mode: 'add' | 'edit';
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto pr-1">
      {columns.map((h) => {
        const isKey = h === keyColumn; // key column not editable
        return (
          <label key={h} className="block">
            <span className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              {h} {isKey && <em className="text-[11px] text-gray-400">(read-only)</em>}
            </span>
            <input
              value={draft[h] ?? ''}
              onChange={(e) => onChange(h, e.target.value)}
              disabled={isKey}
              placeholder={isKey && mode === 'add' ? 'Auto-generated' : ''}
              className={`w-full px-3 py-2 text-sm rounded-md border ${
                isKey
                  ? 'bg-gray-100 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400'
                  : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white'
              } border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
          </label>
        );
      })}
    </div>
  );
}
