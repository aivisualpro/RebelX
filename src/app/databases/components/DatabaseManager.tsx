'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Edit,
  Trash2,
  Database,
  X,
  RefreshCw,
  XCircle,
} from 'lucide-react';

import { sheetTabService } from '@/lib/connections';
import SyncProgressModal from '@/components/SyncProgressModal';

import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

import { DatabaseEntry, ClientSheetTab, GoogleSheetTab, ColumnDefinition, ColumnType, EnumSourceType } from '@/types';

type SyncStatus = 'initializing' | 'syncing' | 'completed' | 'error';

interface SyncProgressData {
  totalRecords: number;
  processedRecords: number;
  createdRecords: number;
  updatedRecords: number;
  errorRecords: number;
  currentBatch: number;
  totalBatches: number;
  startTime: number;
  estimatedTimeRemaining?: number;
  recordsPerSecond?: number;
  status: SyncStatus;
  currentOperation?: string;
  errors?: string[];
}

export default function DatabaseManager() {
  const router = useRouter();

  const [databases, setDatabases] = useState<DatabaseEntry[]>([]);
  const [availableTabs, setAvailableTabs] = useState<GoogleSheetTab[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loadingColumns, setLoadingColumns] = useState(false);

  // Sync UI
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [showSync, setShowSync] = useState(false);
  const [syncData, setSyncData] = useState<SyncProgressData>({
    totalRecords: 0,
    processedRecords: 0,
    createdRecords: 0,
    updatedRecords: 0,
    errorRecords: 0,
    currentBatch: 0,
    totalBatches: 0,
    startTime: 0,
    status: 'initializing',
  });
  // Track when the sync modal opened and whether we've observed running state
  const [syncOpenAt, setSyncOpenAt] = useState<number>(0);
  const [seenRunning, setSeenRunning] = useState<boolean>(false);
  const [activeSyncDb, setActiveSyncDb] = useState<DatabaseEntry | null>(null);

  // lightweight confetti generator (no external deps)
  function triggerConfetti(durationMs = 1400, count = 80) {
    if (typeof document === 'undefined') return;
    const styleId = 'rx-confetti-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes rx-fall { to { transform: translateY(120vh) rotate(720deg); opacity: 0.9; } }
        .rx-confetti { position: fixed; top: -10vh; left: 0; width: 8px; height: 14px; opacity: 0.95; border-radius: 2px; z-index: 9999; pointer-events: none; }
      `;
      document.head.appendChild(style);
    }
    const colors = ['#16a34a', '#2563eb', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4'];
    const body = document.body;
    const pieces: HTMLElement[] = [];
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'rx-confetti';
      el.style.background = colors[Math.floor(Math.random() * colors.length)];
      el.style.left = Math.random() * 100 + 'vw';
      el.style.transform = `translateY(-10vh) rotate(${Math.random() * 360}deg)`;
      el.style.animation = `rx-fall ${0.9 + Math.random() * 1.6}s cubic-bezier(0.23, 1, 0.32, 1) ${Math.random() * 0.6}s forwards`;
      body.appendChild(el);
      pieces.push(el);
    }
    setTimeout(() => pieces.forEach((p) => p.remove()), durationMs);
  }

  // Add modal
  const [showAdd, setShowAdd] = useState(false);
  const [selectedTab, setSelectedTab] = useState<GoogleSheetTab | null>(null);
  const [selectedKeyColumn, setSelectedKeyColumn] = useState('');
  const [selectedLabelColumn, setSelectedLabelColumn] = useState(''); // optional
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [columnDefinitions, setColumnDefinitions] = useState<Record<string, any>>({});
  const [availableDatabases, setAvailableDatabases] = useState<DatabaseEntry[]>([]);
	const [columnsQuery, setColumnsQuery] = useState('');

	// Heuristics to improve UX: guess sensible defaults
	function guessKeyFromColumns(cols: { index: number; name: string }[]): string {
		const candidates = ['id', 'key', 'sku id', 'sku', 'tracking id', 'tracking_id'];
		const lower = cols.map((c) => ({ ...c, l: c.name.toLowerCase() }));
		for (const target of candidates) {
			const f = lower.find((c) => c.l === target);
			if (f) return f.name;
		}
		// fallback: first column
		return cols[0]?.name || '';
	}
	function guessLabelFromColumns(cols: { index: number; name: string }[], keyName: string): string {
		const candidates = ['name', 'title', 'product name', 'label'];
		const lower = cols.map((c) => ({ ...c, l: c.name.toLowerCase() }));
		for (const target of candidates) {
			const f = lower.find((c) => c.l === target);
			if (f && f.name !== keyName) return f.name;
		}
		// fallback: second column if exists and not same as key
		const second = cols[1]?.name || '';
		return second !== keyName ? second : '';
	}

  // Edit modal
  const [showEdit, setShowEdit] = useState(false);
  const [editing, setEditing] = useState<DatabaseEntry | null>(null);
  const [editSelectedColumns, setEditSelectedColumns] = useState<string[]>([]);
  const [editLabelColumn, setEditLabelColumn] = useState<string>(''); // optional
  const [editColumnDefinitions, setEditColumnDefinitions] = useState<Record<string, any>>({});

  // --------------------------------------------------------------------------
  // Load data
  // --------------------------------------------------------------------------
  useEffect(() => {
    loadDatabases();
  }, []);

  async function loadDatabases() {
    try {
      setLoading(true);
      setError('');

      // Your service returns sheetTabs; normalize here
      const tabs = await sheetTabService.getSheetTabs();

      const normalized: DatabaseEntry[] = (tabs as ClientSheetTab[]).map((t) => {
        // Prefer selectedColumns; fall back to legacy selectedHeaders
        const selCols =
          Array.isArray((t as any).selectedColumns)
            ? (t as any).selectedColumns
            : Array.isArray((t as any).selectedHeaders)
            ? (t as any).selectedHeaders
            : [];

        return {
          id: t.id,
          tabName: t.sheetName,
          collectionName: t.collectionName,
          keyColumn: t.keyColumn,
          labelColumn: (t as any).labelColumn || undefined, // <— NEW: read labelColumn
          selectedColumns: selCols,
          columnDefinitions: (t as any).columnDefinitions || {}, // <— NEW: read column definitions
          createdAt: t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt),
          lastSyncAt: t.lastSyncAt?.toDate ? t.lastSyncAt.toDate() : (t.lastSyncAt ? new Date(t.lastSyncAt) : undefined),
        } as DatabaseEntry;
      });

      setDatabases(normalized);
      setAvailableDatabases(normalized);
    } catch (e: any) {
      console.error('loadDatabases error', e);
      setError('Failed to load databases');
    } finally {
      setLoading(false);
    }
  }

  async function loadAvailableTabs() {
    try {
      // Fetch live sheet tabs from Google Sheets via the default connection (env-based)
      const res = await fetch('/api/client-connections/default/sheets');
      if (!res.ok) throw new Error('Failed to fetch sheets from Google');
      const data = await res.json();

      const sheets = Array.isArray(data.sheets) ? data.sheets : [];
      const mapped: GoogleSheetTab[] = sheets.map((t: any) => {
        // API already provides columns as [{ index, name }]
        const cols = Array.isArray(t.columns)
          ? t.columns.map((c: any) => ({ index: Number(c.index) || 0, name: String(c.name || '') }))
          : [];
        return {
          sheetId: typeof t.sheetId === 'number' ? t.sheetId : 0,
          sheetTitle: t.sheetTitle || t.sheetName || 'Untitled',
          columns: cols,
          hasData: Boolean(t.hasData),
        } as GoogleSheetTab;
      });

      setAvailableTabs(mapped);
    } catch (e) {
      console.error('loadAvailableTabs error', e);
      setError('Failed to load available tabs');
    }
  }

  // Only load available tabs when needed: opening Add modal or Sync modal
  useEffect(() => {
    if ((showAdd || showSync) && availableTabs.length === 0) {
      loadAvailableTabs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdd, showSync]);

  // --------------------------------------------------------------------------
  // Add database
  // --------------------------------------------------------------------------
  async function handleAddDatabase() {
    if (!selectedTab || !selectedKeyColumn || selectedColumns.length === 0) {
      setError('Please pick a tab, key column, and at least one column.');
      return;
    }
    try {
      setSubmitting(true);
      setError('');

      const collectionName = selectedTab.sheetTitle
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_');

      // Save labelColumn and columnDefinitions too (optional)
      const created = await sheetTabService.createSheetTab({
        clientId: 'default',
        connectionId: 'default',
        tabName: selectedTab.sheetTitle,
        collectionName,
        keyColumn: selectedKeyColumn,
        labelColumn: selectedLabelColumn || undefined, // <— persist
        selectedColumns,
        columnDefinitions, // <— NEW: persist column definitions
        createdBy: 'admin',
      });

      // Add to UI
      const newDb: DatabaseEntry = {
        id: created.id,
        tabName: created.sheetName || selectedTab.sheetTitle,
        collectionName: created.collectionName,
        keyColumn: created.keyColumn,
        labelColumn: (created as any).labelColumn || selectedLabelColumn || undefined,
        selectedColumns: created.selectedColumns || selectedColumns,
        createdAt: created.createdAt.toDate().toISOString() as unknown as Date,
        lastSyncAt: created.lastSyncAt?.toDate().toISOString() as unknown as Date,
      } as unknown as DatabaseEntry;

      setDatabases((prev) => [...prev, newDb]);

      // reset modal
      setShowAdd(false);
      setSelectedTab(null);
      setSelectedKeyColumn('');
      setSelectedLabelColumn('');
      setSelectedColumns([]);
    } catch (e) {
      console.error('add error', e);
      setError('Failed to add database');
    } finally {
      setSubmitting(false);
    }
  }

  // --------------------------------------------------------------------------
  // Delete database
  // --------------------------------------------------------------------------
  async function handleDeleteDatabase(id: string) {
    try {
      // (You said you didn’t want browser confirms; keeping simple here)
      const ok = window.confirm('Delete this database and all synced records?');
      if (!ok) return;

      await sheetTabService.deleteSheetTab(id);
      setDatabases((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      console.error('delete error', e);
      setError('Failed to delete database');
    }
  }

  // --------------------------------------------------------------------------
  // Edit modal open/save
  // --------------------------------------------------------------------------
  function handleEditDatabase(db: DatabaseEntry) {
    setEditing(db);
    setEditSelectedColumns([...(db.selectedColumns || [])]); // pre-select
    setEditLabelColumn(db.labelColumn || ''); // pre-select
    setEditColumnDefinitions(db.columnDefinitions || {}); // pre-select column definitions
    setShowEdit(true);
  }

  // Ensure label column value persists when editing changes
  useEffect(() => {
    if (editing && typeof editing.labelColumn === 'string') {
      const timer = setTimeout(() => {
        setEditLabelColumn(editing.labelColumn || '');
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [editing]);

  async function handleSaveEdit() {
    if (!editing) return;
    if (editSelectedColumns.length === 0) {
      setError('Please select at least one column.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      // Persist labelColumn + selectedColumns + columnDefinitions
      const res = await fetch(`/api/sheet-tabs/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedColumns: editSelectedColumns,
          labelColumn: editLabelColumn || undefined,
          columnDefinitions: editColumnDefinitions,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'Update failed');
      }

      // Update UI row
      setDatabases((prev) =>
        prev.map((d) =>
          d.id === editing.id
            ? {
                ...d,
                labelColumn: editLabelColumn || undefined,
                selectedColumns: [...editSelectedColumns],
                columnDefinitions: editColumnDefinitions,
              }
            : d
        )
      );

      setShowEdit(false);
      setEditing(null);
      setEditSelectedColumns([]);
      setEditLabelColumn('');
      setEditColumnDefinitions({});
    } catch (e) {
      console.error('save edit error', e);
      setError(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setSubmitting(false);
    }
  }

  // Edit modal: label options should come from persisted database columns only (Firestore)
  const labelColumnOptions = useMemo(() => {
    if (!editing) return [];
    const base = [editing.keyColumn, ...(editing.selectedColumns || [])];
    const uniq: string[] = [];
    for (const name of base) {
      if (name && !uniq.includes(name)) uniq.push(name);
    }
    return uniq;
  }, [editing]);

  // Edit modal column list should come strictly from persisted database (Firestore)
  const editColumnsSource = useMemo(() => {
    if (!editing) return [] as { index: number; name: string }[];
    const ordered = [editing.keyColumn, ...(editing.selectedColumns || [])];
    const uniq: string[] = [];
    for (const name of ordered) {
      if (name && !uniq.includes(name)) uniq.push(name);
    }
    return uniq.map((name, i) => ({ index: i, name }));
  }, [editing]);

  // Ensure label column value persists when editColumnsSource updates
  useEffect(() => {
    if (editing && editing.labelColumn) {
      // Small delay to ensure the DOM has updated
      const timer = setTimeout(() => {
        setEditLabelColumn(editing.labelColumn || '');
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [editing, availableTabs]);

  // --------------------------------------------------------------------------
  // Sync (server-driven; UI listens to Firestore)
  // --------------------------------------------------------------------------
  async function handleSyncDatabase(db: DatabaseEntry) {
    try {
      setActiveSyncDb(db);
      setShowSync(true);
      setSyncOpenAt(Date.now());
      setSeenRunning(false);
      setSyncingIds((s) => new Set(s).add(db.id));
      setSyncData((p) => ({
        ...p,
        startTime: Date.now(),
        status: 'initializing',
        currentOperation: 'Starting…',
      }));

      const res = await fetch(`/api/sheet-tabs/${db.id}/sync`, { method: 'POST' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Sync start failed: ${res.status} ${res.statusText}${text ? ` – ${text}` : ''}`);
      }
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to start sync');
    }
  }

  async function handleCancelSync() {
    if (!activeSyncDb?.id) return;
    
    try {
      // Optimistically update UI to reflect cancellation in progress
      setSyncData((p) => ({
        ...p,
        status: 'cancelling' as any,
        currentOperation: 'Stopping…',
      }));

      const res = await fetch(`/api/sheet-tabs/${activeSyncDb.id}/sync`, { method: 'DELETE' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Cancel sync failed: ${res.status} ${res.statusText}${text ? ` – ${text}` : ''}`);
      }
      
      // The sync status will be updated via the Firestore listener
      console.log('Sync cancellation requested');
    } catch (e) {
      console.error('Failed to cancel sync:', e);
      setError(e instanceof Error ? e.message : 'Failed to cancel sync');
    }
  }

  // Listen live to progress for the active sheetTab
  useEffect(() => {
    if (!showSync || !activeSyncDb?.id) return;
    const ref = doc(db, 'sheetTabs', activeSyncDb.id);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const s = snap.data() as any;
        if (!s) return;

        const total = Number(s.total ?? 0);
        const processed = Number(s.processed ?? 0);
        const created = Number(s.created ?? 0);
        const updated = Number(s.updated ?? 0);
        const errors = Number(s.skippedRowCount ?? 0);
        const lastBatch = Number(s.lastBatchIndex ?? 0);
        const elapsed = Number(s.elapsedMs ?? 0);
        const eta = Number(s.etaMs ?? 0);

        const rps = elapsed > 0 ? Math.round(processed / (elapsed / 1000)) : 0;

        // derive status with a guard: if processed >= total and total > 0, mark completed
        const derivedCompleted = total > 0 && processed >= total;
        // flip seenRunning once the server reports running/initializing for this session
        if (!seenRunning && (s.syncStatus === 'running' || s.syncStatus === 'initializing')) {
          setSeenRunning(true);
        }

        const nextStatus: SyncStatus =
          s.syncStatus === 'running'
            ? (derivedCompleted ? 'completed' : 'syncing')
            : s.syncStatus === 'completed'
            ? 'completed'
            : s.syncStatus === 'completed_with_warnings'
            ? 'completed'
            : s.syncStatus === 'failed'
            ? 'error'
            : derivedCompleted
            ? 'completed'
            : 'initializing';

        // Guard against showing previous run as completed when opening the modal
        const lastSyncMs = s.lastSyncAt?.toMillis ? s.lastSyncAt.toMillis() : (s.lastSyncAt ? new Date(s.lastSyncAt).getTime() : 0);
        const isStaleCompletion = nextStatus === 'completed' && lastSyncMs > 0 && syncOpenAt > 0 && lastSyncMs <= syncOpenAt;
        const uiStatus: SyncStatus = isStaleCompletion ? 'initializing' : nextStatus;

        setSyncData((p) => ({
          ...p,
          totalRecords: isStaleCompletion ? 0 : total,
          processedRecords: isStaleCompletion ? 0 : processed,
          createdRecords: created,
          updatedRecords: updated,
          errorRecords: errors,
          currentBatch: lastBatch,
          totalBatches: total > 0 ? Math.ceil(total / 500) : p.totalBatches,
          estimatedTimeRemaining: eta,
          recordsPerSecond: rps,
          status: uiStatus,
          currentOperation:
            uiStatus === 'syncing'
              ? `Batch ${lastBatch} • ${processed}/${total}`
              : uiStatus === 'completed'
              ? 'Completed'
              : (s.syncStatus || 'idle'),
        }));

        // done?
        if (uiStatus === 'completed' || ['completed', 'completed_with_warnings', 'failed'].includes(s.syncStatus)) {
          setSyncingIds((prev) => {
            const cp = new Set(prev);
            cp.delete(activeSyncDb.id);
            return cp;
          });
          // Only celebrate if this completion is for the current session
          if (uiStatus === 'completed' && !isStaleCompletion && (seenRunning || (lastSyncMs > syncOpenAt))) {
            // Celebration confetti; keep modal open per request
            triggerConfetti(2000, 140);
            // Optional: a second smaller burst shortly after
            setTimeout(() => triggerConfetti(1400, 80), 400);
          }
        }
      },
      (err) => {
        console.error('progress subscribe error', err);
        setError(err?.message || 'Failed to read progress');
      }
    );
    return () => unsub();
  }, [showSync, activeSyncDb?.id]);

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------
  function columnsPreview(cols?: string[]) {
    if (!cols || cols.length === 0) return <span className="text-gray-400">No columns selected</span>;
    if (cols.length <= 3) return cols.join(', ');
    return `${cols.slice(0, 3).join(', ')} +${cols.length - 3} more`;
  }

  function availableTabsForAdd() {
    return availableTabs.filter((t) => !databases.some((d) => d.tabName === t.sheetTitle));
  }

  // Ensure columns are present for a selected tab by fetching headers on-demand
  async function ensureColumnsForTab(sheetTitle: string) {
    const current = availableTabs.find((t) => t.sheetTitle === sheetTitle);
    if (!current || (current.columns && current.columns.length > 0)) return; // already have columns
    try {
      setLoadingColumns(true);
      const resp = await fetch(`/api/client-connections/default/sheets?sheet=${encodeURIComponent(sheetTitle)}`);
      if (!resp.ok) throw new Error('Failed to fetch sheet headers');
      const data = await resp.json();
      const sheets = Array.isArray(data.sheets) ? data.sheets : [];
      const s = sheets[0];
      if (s && Array.isArray(s.columns)) {
        // update availableTabs
        setAvailableTabs((prev) => prev.map((t) => (t.sheetTitle === sheetTitle ? { ...t, columns: s.columns } : t)));
        // update selectedTab if it matches
        setSelectedTab((prev) => (prev && prev.sheetTitle === sheetTitle ? { ...prev, columns: s.columns } : prev));
      }
    } catch (e) {
      console.error('ensureColumnsForTab error', e);
      setError('Failed to fetch columns for selected tab');
    } finally {
      setLoadingColumns(false);
    }
  }

  // --------------------------------------------------------------------------
  // UI
  // --------------------------------------------------------------------------
  // Lock background scroll when modals open
  useEffect(() => {
    const anyModal = showAdd || showEdit || showSync;
    if (typeof document !== 'undefined') {
      const prev = document.body.style.overflow;
      if (anyModal) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = prev || '';
        document.body.style.overflow = '';
      }
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [showAdd, showEdit, showSync]);
  return (
    <div className="max-w-7xl mx-auto">
		<div className="bg-gray-900/40 shadow-sm rounded-xl border border-gray-700 overflow-hidden backdrop-blur-sm">
			<div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between bg-gray-900/40">
          <div className="flex items-center space-x-3">
					<Database className="w-6 h-6 text-blue-400" />
            
          </div>
          <button
            onClick={() => setShowAdd(true)}
					className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Database
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
            <XCircle className="w-5 h-5 text-red-500" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

			<div className="overflow-x-auto">
				<table className="min-w-full divide-y divide-gray-700">
					<thead className="bg-gray-800">
              <tr>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Name</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Key Column</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Label Column</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Selected Columns</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Actions</th>
              </tr>
            </thead>
					<tbody className="bg-transparent divide-y divide-gray-700/60">
              {loading ? (
                <tr>
								<td colSpan={5} className="px-6 py-8 text-center text-gray-300">
									<div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
									<p>Loading databases…</p>
                  </td>
                </tr>
              ) : databases.length === 0 ? (
                <tr>
								<td colSpan={5} className="px-6 py-10 text-center text-gray-400">
                    No databases yet. Click “Add Database” to begin.
                  </td>
                </tr>
              ) : (
                databases.map((d) => (
								<tr key={d.id} className="hover:bg-gray-800/50">
									<td className="px-6 py-4">
                      <button
                        onClick={() => router.push(`/databases/${d.id}/records`)}
											className="text-sm font-medium text-blue-300 hover:underline"
                      >
                        {d.tabName}
                      </button>
										{d.lastSyncAt && (
											<div className="text-xs text-gray-400 mt-1">
                          Last sync: {new Date(d.lastSyncAt).toLocaleString()}
                        </div>
                      )}
                    </td>
									<td className="px-6 py-4 text-sm text-gray-100">{d.keyColumn}</td>
									<td className="px-6 py-4 text-sm text-gray-100">{d.labelColumn || <span className="text-gray-500">—</span>}</td>
									<td className="px-6 py-4 text-sm text-gray-100">{columnsPreview(d.selectedColumns)}</td>
									<td className="px-6 py-4 text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSyncDatabase(d)}
                          disabled={syncingIds.has(d.id)}
												className="inline-flex items-center px-3 py-1 bg-green-900/30 text-green-300 rounded-md hover:bg-green-900/50 disabled:opacity-50"
                        >
												<RefreshCw className={`w-4 h-4 mr-1 ${syncingIds.has(d.id) ? 'animate-spin' : ''}`} />
                          Sync
                        </button>
                        <button
                          onClick={() => handleEditDatabase(d)}
												className="inline-flex items-center px-3 py-1 bg-blue-900/30 text-blue-300 rounded-md hover:bg-blue-900/50"
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteDatabase(d.id)}
												className="inline-flex items-center px-3 py-1 bg-red-900/30 text-red-300 rounded-md hover:bg-red-900/50"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
		{showAdd && (
			<div className="fixed inset-0 bg-black/60 grid place-items-center z-[100]">
				<div className="bg-gray-900 text-gray-100 rounded-xl shadow-2xl border border-gray-800 max-w-3xl w-full mx-4 sm:mx-6 max-h-[90vh] h-[90vh] sm:h-auto flex flex-col z-[101] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-700 sticky top-0 bg-gray-900 z-10">
              <h3 className="text-lg font-semibold text-white">Add New Database</h3>
              <button
                onClick={() => {
                  setShowAdd(false);
                  setSelectedTab(null);
                  setSelectedKeyColumn('');
                  setSelectedLabelColumn('');
                  setSelectedColumns([]);
                  setColumnDefinitions({});
                }}
                className="text-gray-400 hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						{/* Select Google Sheet */}
						<div>
                        <label className="block text-sm font-medium mb-1 text-gray-200">Select Google Sheet Tab</label>
                        <div className="text-[11px] h-4 text-transparent select-none">placeholder</div>
                            <select
								value={selectedTab?.sheetTitle || ''}
								onChange={(e) => {
									const tab = availableTabsForAdd().find((t) => t.sheetTitle === e.target.value) || null;
									setSelectedTab(tab);
                                // Auto-suggest key/label based on headers
                                if (tab && Array.isArray(tab.columns) && tab.columns.length) {
                                  const suggestedKey = guessKeyFromColumns(tab.columns);
                                  const suggestedLabel = guessLabelFromColumns(tab.columns, suggestedKey);
                                  setSelectedKeyColumn(suggestedKey);
                                  setSelectedLabelColumn(suggestedLabel);
                                } else {
                                  setSelectedKeyColumn('');
                                  setSelectedLabelColumn('');
                                }
									setSelectedColumns([]);
									if (tab && (!tab.columns || tab.columns.length === 0)) {
										// fetch headers on-demand for this tab
										void ensureColumnsForTab(tab.sheetTitle);
									}
								}}
								className="w-full px-3 py-2 border border-gray-700 rounded-lg bg-gray-800 text-gray-100"
							>
								<option value="">Choose a tab…</option>
								{availableTabsForAdd().map((t) => (
									<option key={t.sheetId} value={t.sheetTitle}>
										{t.sheetTitle}
									</option>
								))}
							</select>
                  
						</div>

						{/* Key Column */}
						<div>
                        <label className="block text-sm font-medium mb-1 text-gray-200">Key Column</label>
                        <div className="text-[11px] h-4 text-gray-400">cannot be changed later</div>
                            <select
								value={selectedKeyColumn}
								onChange={(e) => setSelectedKeyColumn(e.target.value)}
								className="w-full px-3 py-2 border border-gray-700 rounded-lg bg-gray-800 text-gray-100"
								disabled={!selectedTab || loadingColumns || ((selectedTab?.columns?.length || 0) === 0)}
							>
								<option value="">Choose key column…</option>
								{(selectedTab?.columns || []).map((c) => (
									<option key={c.index} value={c.name}>
										{c.name}
									</option>
								))}
							</select>
                        {loadingColumns && selectedTab && (
                            <p className="text-xs text-gray-400 mt-2">Loading columns…</p>
                        )}
						</div>

						{/* Label Column */}
						<div>
                        <label className="block text-sm font-medium mb-1 text-gray-200">Label Column (optional)</label>
                        <div className="text-[11px] h-4 text-transparent select-none">placeholder</div>
                            <select
								value={selectedLabelColumn}
								onChange={(e) => setSelectedLabelColumn(e.target.value)}
								className="w-full px-3 py-2 border border-gray-700 rounded-lg bg-gray-800 text-gray-100"
								disabled={!selectedTab || loadingColumns || ((selectedTab?.columns?.length || 0) === 0)}
							>
								<option value="">— None —</option>
								{(selectedTab?.columns || []).map((c) => (
									<option key={c.index} value={c.name} disabled={c.name === selectedKeyColumn}>
										{c.name}
									</option>
								))}
							</select>
                        
						</div>
					</div>

              {selectedTab && (
                <>
                  <div>
									<label className="block text-sm font-medium mb-2 text-gray-200">
                      Key Column <span className="text-gray-500">(cannot be changed later)</span>
                    </label>
						<select
                      value={selectedKeyColumn}
                      onChange={(e) => setSelectedKeyColumn(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-700 rounded-lg bg-gray-800 text-gray-100"
                      disabled={loadingColumns || (selectedTab.columns?.length || 0) === 0}
                    >
                      <option value="">Choose key column…</option>
                      {selectedTab.columns.map((c) => (
                        <option key={c.index} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
									{loadingColumns && (
                      <p className="text-xs text-gray-400 mt-1">Loading columns…</p>
                    )}
                  </div>

                  <div>
									<label className="block text-sm font-medium mb-2 text-gray-200">Label Column (optional)</label>
						<select
                      value={selectedLabelColumn}
                      onChange={(e) => setSelectedLabelColumn(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-700 rounded-lg bg-gray-800 text-gray-100"
                      disabled={loadingColumns || (selectedTab.columns?.length || 0) === 0}
                    >
                      <option value="">— None —</option>
                      {selectedTab.columns.map((c) => (
                        <option key={c.index} value={c.name} disabled={c.name === selectedKeyColumn}>
                          {c.name}
                        </option>
                      ))}
                    </select>
								<p className="mt-1 text-xs text-gray-400">Shown in dropdowns when this table is referenced.</p>
							</div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
									<label className="block text-sm font-medium text-gray-200">Configure Columns
										<span className="ml-2 text-xs text-gray-400">{selectedColumns.length} selected</span>
									</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const allColumns = selectedTab.columns.map((c) => c.name);
                            setSelectedColumns(allColumns);
                            const newDefs: Record<string, any> = {};
                            allColumns.forEach((col) => {
                              newDefs[col] = { type: 'text', options: [] };
                            });
                            setColumnDefinitions(newDefs);
                          }}
                          className="text-xs text-blue-300 hover:text-blue-200"
                          disabled={loadingColumns || (selectedTab.columns?.length || 0) === 0}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedColumns([])}
                          className="text-xs text-gray-400 hover:text-gray-300"
                        >
                          Deselect All
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            // Prefer name-like and ID-like columns
                            const preferred = new Set<string>();
                            const cols = selectedTab.columns;
                            const key = selectedKeyColumn;
                            const label = selectedLabelColumn;
                            if (key) preferred.add(key);
                            if (label) preferred.add(label);
                            cols.forEach((c) => {
                              const l = c.name.toLowerCase();
                              if (l.includes('name') || l.includes('title')) preferred.add(c.name);
                              if (l.endsWith('id') || l === 'id') preferred.add(c.name);
                            });
                            const pick = Array.from(preferred);
                            setSelectedColumns(pick);
                            const defs: Record<string, any> = {};
                            pick.forEach((n) => (defs[n] = { type: 'text', options: [] }));
                            setColumnDefinitions(defs);
                          }}
                          className="text-xs text-emerald-300 hover:text-emerald-200"
                        >
                          Smart select
                        </button>
                      </div>
								</div>
								<div className="max-h-96 overflow-y-auto border border-gray-700 rounded-lg p-3 space-y-3 bg-gray-800">
									<div className="sticky top-0 bg-gray-800 pb-3">
										<input
											value={columnsQuery}
											onChange={(e) => setColumnsQuery(e.target.value)}
											placeholder="Search columns…"
											className="w-full px-3 py-2 text-sm rounded-md border border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500"
										/>
									</div>
									{(columnsQuery ? selectedTab.columns.filter((c) => c.name.toLowerCase().includes(columnsQuery.toLowerCase())) : selectedTab.columns).map((c) => (
                        <div key={c.index} className="border border-gray-700 rounded-lg p-3 bg-gray-800">
                          <div className="flex items-center gap-3 mb-2">
                            <input
                              type="checkbox"
                              className="rounded border-gray-600"
                              checked={selectedColumns.includes(c.name)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedColumns((s) => [...s, c.name]);
                                  setColumnDefinitions(prev => ({
                                    ...prev,
                                    [c.name]: { type: 'text', options: [] }
                                  }));
                                } else {
                                  setSelectedColumns((s) => s.filter((n) => n !== c.name));
                                  setColumnDefinitions(prev => {
                                    const newDefs = { ...prev };
                                    delete newDefs[c.name];
                                    return newDefs;
                                  });
                                }
                              }}
                            />
                            <span className="font-medium text-sm text-gray-100">{c.name}</span>
                            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-gray-900 text-gray-400 border border-gray-700">{c.index}</span>
                          </div>
                          
                          {selectedColumns.includes(c.name) && (
                            <div className="ml-6 space-y-2">
                              <div>
                                <label className="block text-xs font-medium text-gray-300 mb-1">Column Type</label>
								<select
                                  value={columnDefinitions[c.name]?.type || 'text'}
                                  onChange={(e) => {
                                    const newType = e.target.value as ColumnType;
                                    setColumnDefinitions(prev => ({
                                      ...prev,
                                      [c.name]: {
                                        ...prev[c.name],
                                        type: newType,
                                        enumSource: newType === 'enum' || newType === 'enumlist' ? 'manual' : undefined,
                                        options: newType === 'enum' || newType === 'enumlist' ? [] : undefined,
                                        referenceCollection: newType === 'reference' ? '' : undefined,
                                        referenceKeyColumn: newType === 'reference' ? '' : undefined,
                                        referenceLabelColumn: newType === 'reference' ? '' : undefined,
                                      }
                                    }));
                                  }}
                                  className="w-full px-2 py-1 text-xs border border-gray-700 rounded bg-gray-800 text-gray-100"
                                >
                                  <option value="text">Text</option>
                                  <option value="number">Number</option>
                                  <option value="price">Price</option>
                                  <option value="date">Date</option>
                                  <option value="datetime">DateTime</option>
                                  <option value="enum">Enum (Single Select)</option>
                                  <option value="enumlist">Enum List (Multi Select)</option>
                                  <option value="reference">Reference</option>
                                </select>
                              </div>
                              
                              {(columnDefinitions[c.name]?.type === 'enum' || columnDefinitions[c.name]?.type === 'enumlist') && (
                                <div className="space-y-2">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-300 mb-1">Source Type</label>
								<select
                                      value={columnDefinitions[c.name]?.enumSource || 'manual'}
                                      onChange={(e) => {
                                        const newSource = e.target.value as 'auto' | 'manual' | 'ref';
                                        setColumnDefinitions(prev => ({
                                          ...prev,
                                          [c.name]: {
                                            ...prev[c.name],
                                            enumSource: newSource,
                                            options: newSource === 'manual' ? (prev[c.name]?.options || []) : undefined,
                                            referenceCollection: newSource === 'ref' ? '' : undefined,
                                            referenceKeyColumn: newSource === 'ref' ? 'id' : undefined,
                                            referenceLabelColumn: newSource === 'ref' ? 'name' : undefined,
                                          }
                                        }));
                                      }}
                                      className="w-full px-2 py-1 text-xs border border-gray-700 rounded bg-gray-800 text-gray-100"
                                    >
                                      <option value="auto">Auto (Unique values from collection)</option>
                                      <option value="manual">Manual (Enter values)</option>
                                      <option value="ref">Reference (From another database)</option>
                                    </select>
                                  </div>
                                  
                                  {columnDefinitions[c.name]?.enumSource === 'manual' && (
                                    <div>
                                      <label className="block text-xs font-medium text-gray-300 mb-1">Options</label>
                                      <div className="space-y-1">
                                    {(columnDefinitions[c.name]?.options || []).map((option: string, idx: number) => (
                                      <div key={idx} className="flex gap-1">
											<input
                                          type="text"
                                          value={option}
                                          onChange={(e) => {
                                            const newOptions = [...(columnDefinitions[c.name]?.options || [])];
                                            newOptions[idx] = e.target.value;
                                            setColumnDefinitions(prev => ({
                                              ...prev,
                                              [c.name]: { ...prev[c.name], options: newOptions }
                                            }));
                                          }}
                                          className="flex-1 px-2 py-1 text-xs border border-gray-700 rounded bg-gray-800 text-gray-100"
                                          placeholder="Option value"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const newOptions = (columnDefinitions[c.name]?.options || []).filter((_: any, i: number) => i !== idx);
                                            setColumnDefinitions(prev => ({
                                              ...prev,
                                              [c.name]: { ...prev[c.name], options: newOptions }
                                            }));
                                          }}
                                          className="px-2 py-1 text-xs bg-red-900/30 text-red-300 rounded hover:bg-red-900/50"
                                        >
                                          ×
                                        </button>
                                      </div>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newOptions = [...(columnDefinitions[c.name]?.options || []), ''];
                                        setColumnDefinitions(prev => ({
                                          ...prev,
                                          [c.name]: { ...prev[c.name], options: newOptions }
                                        }));
                                      }}
                                      className="w-full px-2 py-1 text-xs bg-blue-600/20 text-blue-300 rounded hover:bg-blue-600/30"
                                    >
                                       + Add Option
                                     </button>
                                      </div>
                                    </div>
                                  )}
                                  
                                  {columnDefinitions[c.name]?.enumSource === 'ref' && (
                                    <div className="space-y-2">
                                      <div>
                                        <label className="block text-xs font-medium text-gray-300 mb-1">Reference Collection</label>
											<select
                                          value={columnDefinitions[c.name]?.referenceCollection || ''}
                                          onChange={(e) => {
                                            setColumnDefinitions(prev => ({
                                              ...prev,
                                              [c.name]: { ...prev[c.name], referenceCollection: e.target.value }
                                            }));
                                          }}
                                            className="w-full px-2 py-1 text-xs border border-gray-700 rounded bg-gray-800 text-gray-100"
                                        >
                                          <option value="">Select collection...</option>
                                          {availableDatabases.map(db => (
                                            <option key={db.id} value={db.collectionName}>
                                              {db.tabName} ({db.collectionName})
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div>
                                      <label className="block text-xs font-medium text-gray-300 mb-1">Key Column (stored value)</label>
											<input
                                          type="text"
                                          value={columnDefinitions[c.name]?.referenceKeyColumn || ''}
                                          onChange={(e) => {
                                            setColumnDefinitions(prev => ({
                                              ...prev,
                                              [c.name]: { ...prev[c.name], referenceKeyColumn: e.target.value }
                                            }));
                                          }}
                                            className="w-full px-2 py-1 text-xs border border-gray-700 rounded bg-gray-800 text-gray-100"
                                          placeholder="e.g., id"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-gray-300 mb-1">Label Column (displayed value)</label>
											<input
                                          type="text"
                                          value={columnDefinitions[c.name]?.referenceLabelColumn || ''}
                                          onChange={(e) => {
                                            setColumnDefinitions(prev => ({
                                              ...prev,
                                              [c.name]: { ...prev[c.name], referenceLabelColumn: e.target.value }
                                            }));
                                          }}
                                            className="w-full px-2 py-1 text-xs border border-gray-700 rounded bg-gray-800 text-gray-100"
                                          placeholder="e.g., name"
                                        />
                                      </div>
                                    </div>
                                  )}
                                  
                                  {columnDefinitions[c.name]?.enumSource === 'auto' && (
                                    <div className="p-2 bg-blue-50 rounded text-xs text-blue-700">
                                      <strong>Auto Mode:</strong> Options will be automatically generated from unique values in this column when the database is synced.
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              {columnDefinitions[c.name]?.type === 'reference' && (
                                <div className="space-y-2">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Reference Collection</label>
                                    <select
                                      value={columnDefinitions[c.name]?.referenceCollection || ''}
                                      onChange={(e) => {
                                        setColumnDefinitions(prev => ({
                                          ...prev,
                                          [c.name]: { ...prev[c.name], referenceCollection: e.target.value }
                                        }));
                                      }}
                                      className="w-full px-2 py-1 text-xs border rounded"
                                    >
                                      <option value="">Select collection...</option>
                                      {availableDatabases.map(db => (
                                        <option key={db.id} value={db.collectionName}>
                                          {db.tabName} ({db.collectionName})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Key Column (stored value)</label>
                                    <input
                                      type="text"
                                      value={columnDefinitions[c.name]?.referenceKeyColumn || ''}
                                      onChange={(e) => {
                                        setColumnDefinitions(prev => ({
                                          ...prev,
                                          [c.name]: { ...prev[c.name], referenceKeyColumn: e.target.value }
                                        }));
                                      }}
                                      className="w-full px-2 py-1 text-xs border rounded"
                                      placeholder="e.g., id"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Label Column (displayed value)</label>
                                    <input
                                      type="text"
                                      value={columnDefinitions[c.name]?.referenceLabelColumn || ''}
                                      onChange={(e) => {
                                        setColumnDefinitions(prev => ({
                                          ...prev,
                                          [c.name]: { ...prev[c.name], referenceLabelColumn: e.target.value }
                                        }));
                                      }}
                                      className="w-full px-2 py-1 text-xs border rounded"
                                      placeholder="e.g., name"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="p-4 sm:p-6 border-t border-gray-700 flex justify-end gap-3 sticky bottom-0 bg-gray-900">
              <button
                onClick={() => {
                  setShowAdd(false);
                  setSelectedTab(null);
                  setSelectedKeyColumn('');
                  setSelectedLabelColumn('');
                  setSelectedColumns([]);
                }}
                className="px-4 py-2 border border-gray-600 rounded-lg text-gray-200 hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleAddDatabase}
                disabled={
                  submitting ||
                  !selectedTab ||
                  !selectedKeyColumn ||
                  selectedColumns.length === 0
                }
                className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-500"
              >
                {submitting ? 'Adding…' : 'Add Database'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEdit && editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 text-gray-100 rounded-2xl shadow-2xl max-w-7xl w-full h-[95vh] flex flex-col border border-gray-700 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-300">
                    Key Column <span className="text-gray-400 font-normal">(cannot be changed)</span>
                  </label>
                  <div className="w-full px-3 py-2 border border-gray-700 rounded-lg bg-gray-800 text-gray-100 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                      {editing.keyColumn}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-300">Label Column (optional)</label>
                  <select
                    value={editLabelColumn}
                    onChange={(e) => setEditLabelColumn(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-700 rounded-lg bg-gray-800 text-gray-100 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                  >
                    <option value="">— None —</option>
                    {editColumnsSource.map((col, i) => (
                      <option key={i} value={col.name} disabled={col.name === editing.keyColumn}>
                        {col.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-lg font-semibold text-white">Configure Columns ({editing.tabName})</h4>
                    <p className="text-xs text-gray-400 mt-0.5">Select columns and configure their data types</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const allColumns = editColumnsSource.map(c => c.name);
                        setEditSelectedColumns(allColumns);
                        // Initialize column definitions for all columns
                        const newDefs: Record<string, ColumnDefinition> = {};
                        allColumns.forEach(name => {
                          newDefs[name] = editColumnDefinitions[name] || {
                            type: 'text',
                            enumSource: 'manual',
                            options: []
                          };
                        });
                        setEditColumnDefinitions(newDefs);
                      }}
                      className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-500 transition-colors duration-200 font-medium"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditSelectedColumns([]);
                        setEditColumnDefinitions({});
                      }}
                      className="px-3 py-1.5 text-xs bg-gray-800 text-gray-200 border border-gray-700 rounded-md hover:bg-gray-700 transition-colors duration-200 font-medium"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>
                <div className="border border-gray-700 rounded-lg shadow-sm">
                  {/* Table Header */}
                  <div className="grid grid-cols-5 gap-3 p-3 bg-gray-800 border-b border-gray-700 font-medium text-xs text-gray-300 sticky top-0">
                    <div className="flex items-center gap-2">
                      <div className="w-0.5 h-3 bg-blue-400 rounded-full"></div>
                      Column Name
                    </div>
                    <div className="text-center">Select</div>
                    <div>Data Type</div>
                    <div>Configuration</div>
                    <div>Reference</div>
                  </div>
                  
                  {/* Table Rows */}
                  {editColumnsSource.map((c) => (
                    <div key={c.name} className="grid grid-cols-5 gap-3 p-3 border-b border-gray-800 hover:bg-gray-800/50 transition-colors duration-150">
                      {/* Column Name */}
                      <div className="flex items-center">
                        <span className="text-sm font-medium text-gray-100">{c.name}</span>
                      </div>
                      
                      {/* Select Checkbox */}
                      <div className="flex justify-center">
                        <label className="inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editSelectedColumns.includes(c.name)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditSelectedColumns(prev => [...prev, c.name]);
                                // Initialize column definition if not exists
                                setEditColumnDefinitions(prev => ({
                                  ...prev,
                                  [c.name]: prev[c.name] || {
                                    type: 'text',
                                    enumSource: 'manual',
                                    options: []
                                  }
                                }));
                              } else {
                                setEditSelectedColumns(prev => prev.filter(name => name !== c.name));
                                // Remove column definition
                              }
                            }}
                            className="rounded border-gray-600 text-blue-500 focus:ring-blue-500"
                          />
                        </label>
                      </div>

                      {/* Type Dropdown */}
                      <div>
                        {editSelectedColumns.includes(c.name) ? (
                          <select
                            value={editColumnDefinitions[c.name]?.type || 'text'}
                            onChange={(e) => {
                              const newType = e.target.value as ColumnType;
                              setEditColumnDefinitions(prev => ({
                                ...prev,
                                [c.name]: {
                                  ...prev[c.name],
                                  type: newType,
                                  // Reset enum-specific fields when changing away from enum types
                                  enumSource: newType === 'enum' || newType === 'enumlist' ? (prev[c.name]?.enumSource || 'manual') : undefined,
                                  options: newType === 'enum' || newType === 'enumlist' ? (prev[c.name]?.options || []) : undefined,
                                  referenceCollection: newType === 'reference' || (newType === 'enum' || newType === 'enumlist') ? (prev[c.name]?.referenceCollection || '') : undefined,
                                  referenceKeyColumn: newType === 'reference' || (newType === 'enum' || newType === 'enumlist') ? (prev[c.name]?.referenceKeyColumn || 'id') : undefined,
                                  referenceLabelColumn: newType === 'reference' || (newType === 'enum' || newType === 'enumlist') ? (prev[c.name]?.referenceLabelColumn || 'name') : undefined,
                                }
                              }));
                            }}
                            className="w-full px-2 py-1.5 text-xs border border-gray-700 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-800 text-gray-100"
                          >
                            <option value="text">📝 Text</option>
                            <option value="number">🔢 Number</option>
                            <option value="price">💰 Price</option>
                            <option value="date">📅 Date</option>
                            <option value="datetime">🕰️ DateTime</option>
                            <option value="enum">🎯 Enum (Single)</option>
                            <option value="enumlist">📋 Enumlist (Multi)</option>
                            <option value="reference">🔗 Reference</option>
                          </select>
                        ) : (
                          <span className="text-sm text-gray-400 italic">Select column first</span>
                        )}
                      </div>
                      
                      {/* Configuration */}
                      <div>
                        {editSelectedColumns.includes(c.name) && (editColumnDefinitions[c.name]?.type === 'enum' || editColumnDefinitions[c.name]?.type === 'enumlist') ? (
                          <div className="space-y-2">
                            <select
                              value={editColumnDefinitions[c.name]?.enumSource || 'manual'}
                              onChange={(e) => {
                                const newSource = e.target.value as 'auto' | 'manual' | 'ref';
                                setEditColumnDefinitions(prev => ({
                                  ...prev,
                                  [c.name]: {
                                    ...prev[c.name],
                                    enumSource: newSource,
                                    options: newSource === 'manual' ? (prev[c.name]?.options || []) : undefined,
                                    referenceCollection: newSource === 'ref' ? (prev[c.name]?.referenceCollection || '') : undefined,
                                    // Auto-detect standard key/label columns for references
                                    referenceKeyColumn: newSource === 'ref' ? 'id' : undefined,
                                    referenceLabelColumn: newSource === 'ref' ? 'name' : undefined,
                                  }
                                }));
                              }}
                              className="w-full px-2 py-1.5 text-xs border border-gray-700 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-800 text-gray-100"
                            >
                              <option value="auto">🤖 Auto-generated</option>
                              <option value="manual">✏️ Manual entry</option>
                              <option value="ref">🔗 Reference</option>
                            </select>
                            

                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">{editSelectedColumns.includes(c.name) ? '-' : 'Select column first'}</span>
                        )}
                      </div>
                      
                      {/* Reference Collection */}
                      <div>
                        {editSelectedColumns.includes(c.name) ? (
                          <div className="w-full">
                            {/* Manual Enum Options */}
                            {(editColumnDefinitions[c.name]?.type === 'enum' || editColumnDefinitions[c.name]?.type === 'enumlist') && editColumnDefinitions[c.name]?.enumSource === 'manual' && (
                              <div className="space-y-2">

                                {(editColumnDefinitions[c.name]?.options || []).slice(0, 3).map((option: string, idx: number) => (
                                  <div key={idx} className="flex gap-1">
                                    <input
                                      type="text"
                                      value={option}
                                      onChange={(e) => {
                                        const newOptions = [...(editColumnDefinitions[c.name]?.options || [])];
                                        newOptions[idx] = e.target.value;
                                        setEditColumnDefinitions(prev => ({
                                          ...prev,
                                          [c.name]: { ...prev[c.name], options: newOptions }
                                        }));
                                      }}
                                      className="flex-1 px-2 py-1 text-xs border border-gray-700 rounded bg-gray-800 text-gray-100 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                      placeholder={`Option ${idx + 1}`}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newOptions = (editColumnDefinitions[c.name]?.options || []).filter((_: string, i: number) => i !== idx);
                                        setEditColumnDefinitions(prev => ({
                                          ...prev,
                                          [c.name]: { ...prev[c.name], options: newOptions }
                                        }));
                                      }}
                                      className="px-1 py-1 text-xs bg-red-900/30 text-red-300 rounded hover:bg-red-900/50"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                                {(editColumnDefinitions[c.name]?.options || []).length > 3 && (
                                  <div className="text-xs text-gray-400 italic">+{(editColumnDefinitions[c.name]?.options || []).length - 3} more options</div>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newOptions = [...(editColumnDefinitions[c.name]?.options || []), ''];
                                    setEditColumnDefinitions(prev => ({
                                      ...prev,
                                      [c.name]: { ...prev[c.name], options: newOptions }
                                    }));
                                  }}
                                  className="w-full px-2 py-1 text-xs bg-blue-600/20 text-blue-300 rounded hover:bg-blue-600/30 transition-colors"
                                >
                                  + Add Option
                                </button>
                              </div>
                            )}
                            
                            {/* Reference Configuration */}
                            {(editColumnDefinitions[c.name]?.type === 'reference' || 
                              ((editColumnDefinitions[c.name]?.type === 'enum' || editColumnDefinitions[c.name]?.type === 'enumlist') && editColumnDefinitions[c.name]?.enumSource === 'ref')) && (
                              <div className="space-y-2">

                                <select
                                  value={editColumnDefinitions[c.name]?.referenceCollection || ''}
                                  onChange={(e) => {
                                    setEditColumnDefinitions(prev => ({
                                      ...prev,
                                      [c.name]: { 
                                        ...prev[c.name], 
                                        referenceCollection: e.target.value,
                                        // Auto-set standard key/label columns
                                        referenceKeyColumn: 'id',
                                        referenceLabelColumn: 'name'
                                      }
                                    }));
                                  }}
                                  className="w-full px-2 py-1 text-xs border border-gray-700 rounded bg-gray-800 text-gray-100 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                >
                                  <option value="">Select collection...</option>
                                  {availableDatabases.map(db => (
                                    <option key={db.id} value={db.collectionName}>
                                      🗂️ {db.tabName}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                            

                          </div>
                        ) : (
                          <span className="text-sm text-gray-400 italic">Select column first</span>
                        )}
                      </div>
                      

                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-shrink-0 p-8 border-t border-gray-700 bg-gray-900 flex justify-between items-center">
              <div className="text-sm text-gray-300">
                {editSelectedColumns.length} of {editColumnsSource.length} columns selected
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setShowEdit(false);
                    setEditing(null);
                    setEditSelectedColumns([]);
                    setEditLabelColumn('');
                    setEditColumnDefinitions({});
                  }}
                  className="px-6 py-3 border border-gray-600 rounded-xl text-gray-200 hover:bg-gray-800 transition-all duration-200 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={submitting || !editing || editSelectedColumns.length === 0}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:from-blue-500 hover:to-indigo-500 transition-all duration-200 font-medium shadow-lg"
                >
                  {submitting ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Saving…
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Save Changes
                    </div>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sync Modal (progress fed by Firestore) */}
      <SyncProgressModal
        isOpen={showSync}
        onClose={() => {
          setShowSync(false);
          // If sync was completed, refresh databases to show updated status
          if (syncData.status === 'completed') {
            loadDatabases();
          }
        }}
        // Show Stop only while actively running/initializing; otherwise show Done
        onCancel={['syncing', 'initializing'].includes(syncData.status) ? handleCancelSync : undefined}
        databaseName={activeSyncDb?.tabName || ''}
        collectionName={activeSyncDb?.collectionName || ''}
        progressData={syncData}
      />
    </div>
  );
}
