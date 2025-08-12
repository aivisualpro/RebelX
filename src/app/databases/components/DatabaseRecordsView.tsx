'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Eye, MoveHorizontal, Edit, Trash2, X, Check, Plus, Search, RefreshCw, SortAsc, SortDesc, Edit3
} from 'lucide-react';
import { db } from '@/lib/firebase';
import {
  collection, getDocs, query, where, documentId,
  doc, getDoc, updateDoc
} from 'firebase/firestore';
import type { RefInput } from '@/app/databases/[id]/records/page';

/** ------- GSAP dynamic loader ------- */
let _gsap: any;
async function getGsap() {
  if (_gsap) return _gsap;
  const mod = await import('gsap');
  _gsap = (mod as any).default ?? (mod as any).gsap ?? mod;
  return _gsap;
}
/** ----------------------------------- */

interface DatabaseRecord {
  id: string;
  [key: string]: any;
}

interface DatabaseRecordsViewProps {
  databaseId: string;
  databaseName: string;
  columns: Array<{ name: string; index: number }>;
  keyColumn: string;
  /** Reference inputs to render as dropdowns (label shown, key saved) */
  refInputs?: RefInput[];
}

/* utils */
function sanitize(h: string): string {
  return (h ?? '')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}
function isHttpsUrl(v: unknown) {
  if (typeof v !== 'string') return false;
  const s = v.trim().toLowerCase();
  return s.startsWith('https://');
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

/* Toasts (GSAP) */
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
    let tl: any;
    getGsap().then((gsap) => {
      const el = ref.current!;
      tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.fromTo(el, { y: -16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35 })
        .to(el, { y: 0, opacity: 1, duration: 2.2 })
        .to(el, { y: -16, opacity: 0, duration: 0.35, onComplete: onDone });
    });
    return () => tl?.kill();
  }, [onDone]);
  const color =
    item.kind === 'success' ? 'bg-emerald-600' : item.kind === 'error' ? 'bg-red-600' : 'bg-slate-700';
  return (
    <div ref={ref} className={`pointer-events-auto ${color} text-white text-sm px-3 py-2 rounded-lg shadow-lg`}>
      {item.text}
    </div>
  );
}

/* Confirm (GSAP) */
function ConfirmDialog({
  open, title, message, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, onCancel,
}: {
  open: boolean; title: string; message: string; confirmText?: string; cancelText?: string;
  onConfirm: () => void; onCancel: () => void;
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
    <div ref={wrap} className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
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
          <button onClick={onConfirm} className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700">
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Main */
export default function DatabaseRecordsView({
  databaseId, databaseName, columns, keyColumn, refInputs = [],
}: DatabaseRecordsViewProps) {
  const router = useRouter();

  /* toasts */
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toast = (kind: ToastKind, text: string) =>
    setToasts((s) => [...s, { id: Math.random().toString(36).slice(2), kind, text }]);
  const removeToast = (id: string) => setToasts((s) => s.filter((t) => t.id !== id));

  /* confirm */
  const [confirm, setConfirm] = useState<{ open: boolean; onYes?: () => void; title?: string; message?: string; }>({ open: false });

  // table/query state
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
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [columnDefinitions, setColumnDefinitions] = useState<Record<string, any>>({});

  // column visibility + widths (persisted in sheetTabs/{id})
  const allColumnNames = useMemo(() => columns.map((c) => c.name), [columns]);
  const colMap = useMemo(() => columns.map((c) => ({ human: c.name, key: sanitize(c.name) })), [columns]);

  const [visibleCols, setVisibleCols] = useState<string[]>(allColumnNames);
  const [widths, setWidths] = useState<Record<string, number>>({});
  // Guard to prevent late async prefs load from overwriting user's immediate changes
  const didInitPrefs = useRef(false);
  useEffect(() => {
    (async () => {
      try {
        const ref = doc(db, 'sheetTabs', databaseId);
        const snap = await getDoc(ref);
        const data = snap.exists() ? snap.data() : {};
        const hidden = (data as any)?.uiHiddenColumns || [];
        const widthsSaved = (data as any)?.uiColumnWidths || {};
        const savedSortHuman = (data as any)?.uiSortColumnHuman as string | undefined;
        const savedSortDir = (data as any)?.uiSortDirection as 'asc' | 'desc' | undefined;
        const columnDefs = (data as any)?.columnDefinitions || {};
        const startVisible = allColumnNames.filter((h) => !hidden.includes(h));
        // Only initialize from saved prefs once; do not clobber user changes that happened after mount
        if (!didInitPrefs.current) {
          setVisibleCols(startVisible.length ? startVisible : allColumnNames);
          setWidths(widthsSaved || {});
          if (savedSortHuman && allColumnNames.includes(savedSortHuman)) {
            setSortColumnHuman(savedSortHuman);
          }
          if (savedSortDir === 'asc' || savedSortDir === 'desc') {
            setSortDirection(savedSortDir);
          }
          didInitPrefs.current = true;
        }
        setColumnDefinitions(columnDefs);
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseId]);

  const savePrefs = useDebouncedFn(
    async (
      nextVisible: string[],
      nextWidths: Record<string, number>,
      nextSortHuman: string,
      nextSortDir: 'asc' | 'desc'
    ) => {
      try {
        const ref = doc(db, 'sheetTabs', databaseId);
        const hidden = allColumnNames.filter((h) => !nextVisible.includes(h));
        await updateDoc(ref, {
          uiHiddenColumns: hidden,
          uiColumnWidths: nextWidths,
          uiSortColumnHuman: nextSortHuman,
          uiSortDirection: nextSortDir,
        });
      } catch {}
    },
    500
  );

  // resize mode
  const [resizeMode, setResizeMode] = useState(false);
  const drag = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const onDownResize = (e: React.MouseEvent, h: string) => {
    if (!resizeMode) return;
    const key = sanitize(h);
    const startW = widths[key] ?? (e.currentTarget.parentElement as HTMLElement)?.offsetWidth ?? 160;
    drag.current = { key, startX: e.clientX, startW };
    window.addEventListener('mousemove', onMoveResize);
    window.addEventListener('mouseup', onUpResize);
    e.preventDefault(); e.stopPropagation();
  };
  const onMoveResize = (e: MouseEvent) => {
    if (!drag.current) return;
    const delta = e.clientX - drag.current.startX;
    const newW = Math.max(80, Math.min(800, drag.current.startW + delta));
    setWidths((w) => {
      const next = { ...w, [drag.current!.key]: newW };
      savePrefs(visibleCols, next, sortColumnHuman, sortDirection);
      return next;
    });
  };
  const onUpResize = () => {
    drag.current = null;
    window.removeEventListener('mousemove', onMoveResize);
    window.removeEventListener('mouseup', onUpResize);
  };

  const toggleCol = (human: string) => {
    didInitPrefs.current = true; // user explicitly changed visibility; avoid future init overwrites
    setVisibleCols((prev) => {
      const next = prev.includes(human) ? prev.filter((n) => n !== human) : [...prev, human];
      savePrefs(next, widths, sortColumnHuman, sortDirection);
      return next;
    });
  };
  const showAllCols = () => { didInitPrefs.current = true; setVisibleCols(allColumnNames); savePrefs(allColumnNames, widths, sortColumnHuman, sortDirection); };
  const hideAllCols = () => { didInitPrefs.current = true; setVisibleCols([]); savePrefs([], widths, sortColumnHuman, sortDirection); };

  const sortByKey = useMemo(() => {
    const found = colMap.find((c) => c.human === sortColumnHuman);
    return found?.key ?? sanitize(sortColumnHuman);
  }, [colMap, sortColumnHuman]);

  // reference inputs: load option lists (key/label) from target table
  type RefOptions = { key: string; label: string }[];
  const [refOptions, setRefOptions] = useState<Record<string, RefOptions>>({}); // by column(human)
  const [refLabelByKey, setRefLabelByKey] = useState<Record<string, Record<string, string>>>({}); // by column -> {key: label}

  useEffect(() => {
    (async () => {
      // Build reference configs either from explicit refInputs or from saved columnDefinitions
      type RefConf = { column: string; targetColl: string; keyField: string; labelField: string };
      const confs: RefConf[] = [];

      if (refInputs.length) {
        for (const ref of refInputs) {
          const stSnap = await getDoc(doc(db, 'sheetTabs', ref.targetSheetTabId));
          if (!stSnap.exists()) continue;
          const st = stSnap.data() as any;
          const targetColl = String(st.collectionName || '');
          if (!targetColl) continue;
          const keyHuman = String(st.keyColumn || 'id');
          const labelHuman = String(st.labelColumn || 'name');
          confs.push({
            column: ref.column,
            targetColl,
            keyField: sanitize(keyHuman),
            labelField: sanitize(labelHuman),
          });
        }
      } else {
        // Derive from columnDefinitions (for any column marked as reference)
        Object.entries(columnDefinitions || {}).forEach(([human, def]: any) => {
          if (def?.type === 'reference' && def?.referenceCollection) {
            const targetColl = String(def.referenceCollection);
            const keyHuman = String(def.referenceKeyColumn || 'id');
            const labelHuman = String(def.referenceLabelColumn || 'name');
            confs.push({
              column: human,
              targetColl,
              keyField: sanitize(keyHuman),
              labelField: sanitize(labelHuman),
            });
          }
        });
      }

      if (!confs.length) { setRefOptions({}); setRefLabelByKey({}); return; }

      const optionsByCol: Record<string, RefOptions> = {};
      const mapByCol: Record<string, Record<string, string>> = {};

      for (const conf of confs) {
        try {
          const qAll = await getDocs(query(collection(db, conf.targetColl)));
          const opts: RefOptions = [];
          const m: Record<string, string> = {};
          qAll.forEach((d) => {
            const data = d.data() as any;
            const keyVal = (data?.[conf.keyField] ?? d.id);
            const labelVal = (data?.[conf.labelField] ?? data?.name ?? data?.title ?? data?.client_name ?? String(keyVal));
            if (keyVal == null) return;
            const keyStr = String(keyVal);
            const labelStr = String(labelVal);
            opts.push({ key: keyStr, label: labelStr });
            m[keyStr] = labelStr;
            // Also map by document id for safety (some sources store target doc id instead of key field)
            const docId = String(d.id);
            if (!(docId in m)) {
              m[docId] = labelStr;
            }
          });
          opts.sort((a, b) => a.label.localeCompare(b.label));
          // Store by human column
          optionsByCol[conf.column] = opts;
          mapByCol[conf.column] = m;
          // Also store by sanitized column key to handle mismatched saved keys
          const colAlias = sanitize(conf.column);
          if (!(colAlias in optionsByCol)) optionsByCol[colAlias] = opts;
          if (!(colAlias in mapByCol)) mapByCol[colAlias] = m;
        } catch (e) {
          console.error('Failed loading reference options for', conf.column, e);
        }
      }

      setRefOptions(optionsByCol);
      setRefLabelByKey(mapByCol);
    })();
  }, [refInputs, columnDefinitions]);

  // add/edit modals
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
      const k = sanitize(h);
      d[h] = rec[k] ?? rec[h] ?? '';
    });
    setDraft(d);
    setShowEdit(rec);
  };
  const onDraftChange = (h: string, v: string) => setDraft((prev) => ({ ...prev, [h]: v }));

  const makePayloadFromDraft = () => {
    const data: Record<string, any> = {};
    for (const h of Object.keys(draft)) {
      const k = sanitize(h);
      data[k] = draft[h];
    }
    return { data };
  };

  const [refreshTick, setRefreshTick] = useState(0);
  const hardRefresh = async () => setRefreshTick((t) => t + 1);

  // load records (server API)
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true); setError('');
    const run = async () => {
      try {
        const qs = new URLSearchParams({
          page: String(currentPage),
          limit: String(recordsPerPage),
          search: searchTerm,
          sortBy: sortByKey,
          sortOrder: sortDirection,
        });
        
        // Add filters to query parameters
        Object.entries(filters).forEach(([column, value]) => {
          if (value.trim()) {
            qs.append('filter', `${column}:${value}`);
          }
        });
        const res = await fetch(`/api/sheet-tabs/${encodeURIComponent(databaseId)}/records?${qs.toString()}`, { signal: ac.signal });
        if (!res.ok) throw new Error((await res.text()) || res.statusText);
        const data = await res.json();
        setRecords(Array.isArray(data.records) ? data.records : []);
        setTotalRecords(typeof data.total === 'number' ? data.total : 0);
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          setError(e?.message || 'Failed to load records');
          setRecords([]); setTotalRecords(0);
        }
      } finally { setLoading(false); }
    };
    const t = setTimeout(run, 250);
    return () => { clearTimeout(t); ac.abort(); };
  }, [databaseId, currentPage, recordsPerPage, searchTerm, sortByKey, sortDirection, refreshTick, filters]);

  // actions
  const createRecord = async () => {
    try {
      setSubmitting(true);
      const res = await fetch(`/api/sheet-tabs/${databaseId}/records`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(makePayloadFromDraft()),
      });
      if (!res.ok) throw new Error((await res.text()) || res.statusText);
      setShowAdd(false); toast('success', 'Record created'); await hardRefresh();
    } catch (e: any) {
      toast('error', `Create failed: ${e?.message || 'Unknown error'}`);
    } finally { setSubmitting(false); }
  };
  const saveEdit = async () => {
    if (!showEdit?.id) return;
    try {
      setSubmitting(true);
      const res = await fetch(`/api/sheet-tabs/${databaseId}/records?id=${encodeURIComponent(showEdit.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(makePayloadFromDraft()),
      });
      if (!res.ok) throw new Error((await res.text()) || res.statusText);
      setShowEdit(null); toast('success', 'Record updated'); await hardRefresh();
    } catch (e: any) {
      toast('error', `Update failed: ${e?.message || 'Unknown error'}`);
    } finally { setSubmitting(false); }
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
      const res = await fetch(`/api/sheet-tabs/${databaseId}/records?id=${encodeURIComponent(rec.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.text()) || res.statusText);
      toast('success', 'Record deleted'); await hardRefresh();
    } catch (e: any) {
      toast('error', `Delete failed: ${e?.message || 'Unknown error'}`);
    }
  };

  // helpers
  const handleSort = (human: string) => {
    if (sortColumnHuman === human) {
      setSortDirection((d) => {
        const nextDir = d === 'asc' ? 'desc' : 'asc';
        savePrefs(visibleCols, widths, sortColumnHuman, nextDir);
        return nextDir;
      });
    } else {
      setSortColumnHuman(human);
      setSortDirection('asc');
      setCurrentPage(1);
      // Persist new sort immediately
      savePrefs(visibleCols, widths, human, 'asc');
    }
  };
  const goToPage = (p: number) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));
  const getPageNumbers = () => {
    const last = totalPages; if (last <= 1) return [1];
    const delta = 2, left = Math.max(2, currentPage - delta), right = Math.min(last - 1, currentPage + delta);
    const out: (number | '...')[] = [1]; if (left > 2) out.push('...'); for (let i = left; i <= right; i++) out.push(i);
    if (right < last - 1) out.push('...'); out.push(last); return out;
  };
  const exportPageCsv = () => {
    const headers = visibleCols.join(',');
    const rows = records.map((r) =>
      visibleCols
        .map((h) => {
          const k = sanitize(h);
          let v = r[k] ?? r[h] ?? '';
          // if it's a ref column, output label in CSV
          const ref = refInputs.find((ri) => ri.column === h);
          if (ref && v) v = refLabelByKey[ref.column]?.[String(v)] ?? v;
          const txt = String(v).replace(/"/g, '""');
          return `"${txt}"`;
        })
        .join(',')
    );
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `${sanitize(databaseName)}_page${currentPage}.csv`; a.click();
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

      <div className="min-h-screen mt-10 bg-transparent">
        {/* Header */}
        <div className="bg-gray-900/40 border-b border-gray-700 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14 gap-4">
              {/* Database Name and Record Count */}
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{databaseName}</h1>
                <span className="text-sm text-gray-500 dark:text-gray-400">({totalRecords.toLocaleString()} records)</span>
              </div>

              {/* Controls Row */}
              <div className="flex items-center gap-3">
                {/* Add Record Button */}
                <button
                  onClick={startAdd}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Record
                </button>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search records..."
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    className="w-64 pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Icon-only Controls */}
                <button
                  onClick={() => setResizeMode((r) => !r)}
                  className={`p-2 rounded-md border transition-colors ${
                    resizeMode
                      ? 'border-blue-500 text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400'
                      : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                  title="Resize columns"
                >
                  <MoveHorizontal className="w-4 h-4" />
                </button>

                <button
                  onClick={() => hardRefresh()}
                  disabled={loading}
                  className="p-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>

                <button
                  onClick={exportPageCsv}
                  className="p-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                  title="Export page"
                >
                  <Download className="w-4 h-4" />
                </button>

                <details className="relative">
                  <summary className="list-none p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors" title="Show/hide columns">
                    <Eye className="w-4 h-4" />
                  </summary>
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 z-20">
                    <button onClick={showAllCols} className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300">Show all</button>
                    <button onClick={hideAllCols} className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 mb-1">Hide all</button>
                    <div className="max-h-64 overflow-y-auto pr-1">
                      {allColumnNames.map((h) => (
                        <label key={h} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-200">
                          <input type="checkbox" checked={visibleCols.includes(h)} onChange={() => toggleCol(h)} className="h-4 w-4" />
                          <span className="truncate" title={h}>{h}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </details>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 mt-6">
          {/* Page size selector and Filters */}
          <div className="mb-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              {/* Dynamic Filters - Only for dropdown columns */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters:</span>
                {visibleCols.filter(column => {
                  // Only show filters for enum, enumlist, and reference columns
                  const colDef = columnDefinitions[column];
                  return colDef && colDef.type && ['enum', 'enumlist', 'reference'].includes(colDef.type);
                }).slice(0, 4).map((column) => (
                  <details key={column} className="relative">
                    <summary className="list-none px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 inline-flex items-center gap-1">
                      {column}
                      <ChevronDown className="w-3 h-3" />
                    </summary>
                    <div className="absolute left-0 mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 z-20">
                      <div className="space-y-2">
                        {(() => {
                          const colDef = columnDefinitions[column];
                          if (colDef?.type === 'enum' || colDef?.type === 'enumlist') {
                            // Show predefined options for enum columns
                            const options = colDef.options || [];
                            return (
                              <div className="space-y-1">
                                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Select option:</div>
                                {options.map((option: string, idx: number) => (
                                  <label key={idx} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">
                                    <input
                                      type={colDef.type === 'enum' ? 'radio' : 'checkbox'}
                                      name={`filter-${column}`}
                                      checked={
                                        colDef.type === 'enum' 
                                          ? filters[column] === option
                                          : (filters[column] || '').split(',').includes(option)
                                      }
                                      onChange={(e) => {
                                        if (colDef.type === 'enum') {
                                          setFilters(prev => ({
                                            ...prev,
                                            [column]: e.target.checked ? option : ''
                                          }));
                                        } else {
                                          const currentValues = (filters[column] || '').split(',').filter(v => v);
                                          const newValues = e.target.checked
                                            ? [...currentValues, option]
                                            : currentValues.filter(v => v !== option);
                                          setFilters(prev => ({
                                            ...prev,
                                            [column]: newValues.join(',')
                                          }));
                                        }
                                        setCurrentPage(1);
                                      }}
                                      className="h-4 w-4"
                                    />
                                    <span className="truncate" title={option}>{option}</span>
                                  </label>
                                ))}
                              </div>
                            );
                          } else if (colDef?.type === 'reference') {
                            // Show reference options via searchable dropdown (labels shown, keys stored)
                            const options = refOptions[column] || [];
                            return (
                              <div className="space-y-1">
                                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Reference filter:</div>
                                <SearchableDropdown
                                  value={filters[column] || ''}
                                  onChange={(value) => {
                                    setFilters(prev => ({
                                      ...prev,
                                      [column]: value
                                    }));
                                    setCurrentPage(1);
                                  }}
                                  options={options}
                                  placeholder={`Filter by ${column}…`}
                                />
                              </div>
                            );
                          } else {
                            // Fallback for other column types
                            return (
                              <input
                                type="text"
                                placeholder={`Filter by ${column}...`}
                                value={filters[column] || ''}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                onChange={(e) => {
                                  setFilters(prev => ({
                                    ...prev,
                                    [column]: e.target.value
                                  }));
                                  setCurrentPage(1);
                                }}
                              />
                            );
                          }
                        })()}
                        <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                          <button
                            onClick={() => {
                              setFilters(prev => {
                                const newFilters = { ...prev };
                                delete newFilters[column];
                                return newFilters;
                              });
                              setCurrentPage(1);
                            }}
                            className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-500"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </div>
            
            <select
              value={recordsPerPage}
              onChange={(e) => { setRecordsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>

          {/* Table */}
          <div className="bg-gray-900/40 rounded-lg shadow overflow-hidden backdrop-blur-sm">
            {loading ? (
              <div className="flex items-center justify-center h-56">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                <span className="ml-2 text-sm text-gray-600 dark:text-gray-300">Loading…</span>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-56 text-red-600 dark:text-red-400 text-sm">{error}</div>
            ) : records.length === 0 ? (
              <div className="flex items-center justify-center h-56 text-gray-500 dark:text-gray-400 text-sm">No records found</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        {visibleCols.map((human) => {
                          const k = sanitize(human);
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
                                {sortColumnHuman === human && (sortDirection === 'asc' ? <SortAsc className="w-3.5 h-3.5" /> : <SortDesc className="w-3.5 h-3.5" />)}
                              </div>
                              {resizeMode && (
                                <div onMouseDown={(e) => onDownResize(e, human)} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400/50" />
                              )}
                            </th>
                          );
                        })}
                        <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-transparent divide-y divide-gray-200/20 dark:divide-gray-700/60">
                      {records.map((record, rowIdx) => (
                        <tr key={record.id || rowIdx} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                          {visibleCols.map((human) => {
                            const k = sanitize(human);
                            const raw = record[k] ?? record[human] ?? '';
                            let text = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);

                            // If it's a ref column, show label. Try columnDefinitions-based map first, then refInputs fallback
                            if (text) {
                              const directLbl = refLabelByKey[human]?.[String(text)];
                              if (directLbl) {
                                text = directLbl;
                              } else {
                                const ref = refInputs.find((ri) => ri.column === human);
                                if (ref) {
                                  const lbl = refLabelByKey[ref.column]?.[String(text)];
                                  if (lbl) text = lbl;
                                }
                              }
                            }

                            const w = widths[k];
                            return (
                              <td key={human} className="px-4 py-2 text-xs text-gray-900 dark:text-gray-100 align-top" style={w ? { width: w, maxWidth: w, minWidth: w } : undefined}>
                                <div className="whitespace-normal break-words">
                                  {isHttpsUrl(text) ? (
                                    <a href={text} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-words">{text}</a>
                                  ) : (
                                    text || '—'
                                  )}
                                </div>
                              </td>
                            );
                          })}
                          <td className="px-4 py-2 text-xs">
                            <div className="flex items-center gap-2">
                              <button onClick={() => startEdit(record)} className="inline-flex items-center px-2 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100" title="Edit">
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button onClick={() => requestDelete(record)} className="inline-flex items-center px-2 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100" title="Delete">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="bg-gray-900/40 px-4 py-2 border-t border-gray-700 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <div className="hidden sm:block text-xs text-gray-600 dark:text-gray-300">
                        Showing{' '}
                        <span className="font-medium">{totalRecords === 0 ? 0 : (currentPage - 1) * recordsPerPage + 1}</span>{' '}
                        to <span className="font-medium">{Math.min(currentPage * recordsPerPage, totalRecords)}</span>{' '}
                        of <span className="font-medium">{totalRecords}</span>
                      </div>
                      <nav className="inline-flex rounded-md shadow-sm -space-x-px">
                        <button onClick={() => goToPage(1)} disabled={currentPage === 1} className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-l-md disabled:opacity-50"><ChevronsLeft className="w-4 h-4" /></button>
                        <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
                        {getPageNumbers().map((n, i) =>
                          n === '...' ? (
                            <span key={`dots-${i}`} className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300">…</span>
                          ) : (
                            <button key={`p-${n}`} onClick={() => goToPage(Number(n))} className={`px-3 py-1.5 text-xs border ${
                              currentPage === n
                                ? 'bg-blue-50 dark:bg-blue-900 border-blue-500 text-blue-700 dark:text-blue-200'
                                : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                            }`}>{n}</button>
                          )
                        )}
                        <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
                        <button onClick={() => goToPage(totalPages)} disabled={currentPage === totalPages} className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-r-md disabled:opacity-50"><ChevronsRight className="w-4 h-4" /></button>
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
        <Modal title="Add Record" onClose={() => setShowAdd(false)} submitLabel="Create" submitting={submitting} onSubmit={createRecord}>
          <RecordForm
            columns={visibleCols}
            draft={draft}
            onChange={onDraftChange}
            keyColumn={keyColumn}
            mode="add"
            refInputs={refInputs}
            refOptions={refOptions}
          />
        </Modal>
      )}

      {/* Edit modal */}
      {showEdit && (
        <Modal title={`Edit Record ${showEdit.id}`} onClose={() => setShowEdit(null)} submitLabel="Save changes" submitting={submitting} onSubmit={saveEdit}>
          <RecordForm
            columns={visibleCols}
            draft={draft}
            onChange={onDraftChange}
            keyColumn={keyColumn}
            mode="edit"
            refInputs={refInputs}
            refOptions={refOptions}
          />
        </Modal>
      )}
    </>
  );
}

/* Modal + form */
function Modal({
  title, onClose, submitting, submitLabel, onSubmit, children,
}: { title: string; onClose: () => void; submitting: boolean; submitLabel: string; onSubmit: () => void; children: React.ReactNode; }) {
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
    <div ref={wrap} className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div ref={card} onClick={(e) => e.stopPropagation()} className="w-[720px] max-w-full rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">{title}</div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white" aria-label="Close">✕</button>
        </div>
        <div className="p-5">{children}</div>
        <div className="px-5 pb-5 flex justify-end">
          <button onClick={onSubmit} disabled={submitting} className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {submitting ? 'Saving…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Searchable Dropdown Component */
function SearchableDropdown({
  value, onChange, options, placeholder = "Choose...", className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: { key: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter options based on search term
  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    const searchLower = searchTerm.toLowerCase();
    return options.filter(opt => 
      opt.label.toLowerCase().includes(searchLower) ||
      opt.key.toLowerCase().includes(searchLower)
    );
  }, [options, searchTerm]);

  // Get display label for current value
  const selectedOption = options.find(opt => opt.key === value);
  const displayLabel = selectedOption?.label || placeholder;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (optionKey: string) => {
    onChange(optionKey);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 text-sm rounded-md border bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-left flex items-center justify-between"
      >
        <span className={value ? '' : 'text-gray-400'}>{displayLabel}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-200 dark:border-gray-600">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-48 overflow-y-auto">
            {value && (
              <button
                type="button"
                onClick={() => handleSelect('')}
                className="w-full px-3 py-2 text-left text-sm text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600"
              >
                Clear selection
              </button>
            )}
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                No options found
              </div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => handleSelect(option.key)}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 ${
                    option.key === value
                      ? 'bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-200'
                      : 'text-gray-900 dark:text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RecordForm({
  columns, draft, onChange, keyColumn, mode, refInputs = [], refOptions = {},
}: {
  columns: string[]; draft: Record<string, string>;
  onChange: (h: string, v: string) => void;
  keyColumn: string; mode: 'add' | 'edit';
  refInputs?: RefInput[]; refOptions?: Record<string, { key: string; label: string }[]>;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto pr-1">
      {columns.map((h) => {
        const isKey = h === keyColumn; // key column not editable
        const ref = refInputs.find((ri) => ri.column === h);
        const options = ref ? refOptions[ref.column] || [] : [];

        return (
          <label key={h} className="block">
            <span className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              {h} {isKey && <em className="text-[11px] text-gray-400">(read-only)</em>}
            </span>

            {ref ? (
              <SearchableDropdown
                value={draft[h] ?? ''}
                onChange={(value) => onChange(h, value)}
                options={options}
                placeholder="Choose…"
              />
            ) : (
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
            )}
          </label>
        );
      })}
    </div>
  );
}
