'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit, Trash2, Database, X, RefreshCw, XCircle } from 'lucide-react';
import { sheetTabService } from '@/lib/connections';
import SyncProgressModal from '@/components/SyncProgressModal';

// 🔥 progress subscription
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

import type { ClientSheetTab, DatabaseEntry, GoogleSheetTab } from '@/types';

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
  status: 'initializing' | 'syncing' | 'completed' | 'error';
  currentOperation?: string;
  errors?: string[];
}

export default function DatabaseManager() {
  const router = useRouter();
  const [databases, setDatabases] = useState<DatabaseEntry[]>([]);
  const [availableTabs, setAvailableTabs] = useState<GoogleSheetTab[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [syncingDatabases, setSyncingDatabases] = useState<Set<string>>(new Set());
  const [syncResults, setSyncResults] = useState<Map<string, {
    success: boolean;
    message: string;
    syncedCount: number;
  }>>(new Map());

  // Sync progress modal state
  const [showSyncProgress, setShowSyncProgress] = useState(false);
  const [syncProgressData, setSyncProgressData] = useState<SyncProgressData>({
    totalRecords: 0,
    processedRecords: 0,
    createdRecords: 0,
    updatedRecords: 0,
    errorRecords: 0,
    currentBatch: 0,
    totalBatches: 0,
    startTime: 0,
    status: 'initializing'
  });
  const [currentSyncDatabase, setCurrentSyncDatabase] = useState<DatabaseEntry | null>(null);

  // Add database modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTab, setSelectedTab] = useState<GoogleSheetTab | null>(null);
  const [selectedKeyColumn, setSelectedKeyColumn] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDatabase, setEditingDatabase] = useState<DatabaseEntry | null>(null);
  const [editSelectedColumns, setEditSelectedColumns] = useState<string[]>([]);

  useEffect(() => {
    loadDatabases();
    loadAvailableTabs();
  }, []);

  const loadDatabases = async () => {
    try {
      setLoading(true);
      const response = await sheetTabService.getSheetTabs('default', 'default');

      const mappedDatabases: DatabaseEntry[] = response.map((tab: ClientSheetTab) => {
        const selCols = Array.isArray(tab.selectedColumns)
          ? tab.selectedColumns
          : (tab.selectedColumns ? [tab.selectedColumns] : []);

        return {
          id: tab.id,
          tabName: tab.sheetName,
          collectionName: tab.collectionName,
          keyColumn: tab.keyColumn,
          selectedColumns: selCols,
          createdAt: tab.createdAt?.toDate ? tab.createdAt.toDate() : new Date(tab.createdAt),
          lastSyncAt: tab.lastSyncAt?.toDate ? tab.lastSyncAt.toDate() : (tab.lastSyncAt ? new Date(tab.lastSyncAt) : undefined)
        };
      });

      setDatabases(mappedDatabases);
    } catch (e) {
      console.error('Error loading databases:', e);
      setError('Failed to load databases');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableTabs = async () => {
    try {
      const response = await fetch('/api/client-connections/default/sheets');

      if (!response.ok) {
        if (response.status === 429) {
          setError('Google Sheets quota exceeded. Please wait and try again.');
          const fallbackTabs = [
            {
              sheetId: 1,
              sheetTitle: 'Activity Tracking',
              columns: [
                { index: 0, name: 'Tracking_id' },
                { index: 1, name: 'Activity' },
                { index: 2, name: 'Client' },
                { index: 3, name: 'Date' },
                { index: 4, name: 'Status' }
              ],
              hasData: true
            }
          ];
          setAvailableTabs(fallbackTabs as any);
          return;
        }
        throw new Error('Failed to fetch available tabs');
      }

      const data = await response.json();
      setAvailableTabs(data.sheets || []);
      setError('');
    } catch (e) {
      console.error('Error loading available tabs:', e);
      setError('Failed to load available tabs. Please try again.');
    }
  };

  const handleAddDatabase = async () => {
    if (!selectedTab || !selectedKeyColumn || selectedColumns.length === 0) {
      setError('Please select a tab, key column, and at least one column');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      const collectionName = selectedTab.sheetTitle.toLowerCase().replace(/[^a-z0-9]/g, '_');

      const createdTab = await sheetTabService.createSheetTab({
        clientId: 'default',
        connectionId: 'default',
        tabName: selectedTab.sheetTitle,
        collectionName,
        keyColumn: selectedKeyColumn,
        selectedColumns,
        createdBy: 'admin',
      });

      const newDatabase: DatabaseEntry = {
        id: createdTab.id,
        tabName: createdTab.sheetName || selectedTab.sheetTitle,
        collectionName: createdTab.collectionName,
        keyColumn: createdTab.keyColumn,
        selectedColumns: createdTab.selectedColumns || selectedColumns,
        createdAt: createdTab.createdAt.toDate().toISOString(),
        lastSyncAt: createdTab.lastSyncAt?.toDate().toISOString()
      };

      setDatabases(prev => [...prev, newDatabase]);
      setShowAddModal(false);
      setSelectedTab(null);
      setSelectedKeyColumn('');
      setSelectedColumns([]);

    } catch (e) {
      console.error('Error adding database:', e);
      setError('Failed to add database');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDatabase = async (databaseId: string) => {
    if (!confirm('Are you sure you want to delete this database? This will delete all records in the collection.')) {
      return;
    }
    try {
      await sheetTabService.deleteSheetTab(databaseId);
      setDatabases(prev => prev.filter(db => db.id !== databaseId));
    } catch (e) {
      console.error('Error deleting database:', e);
      setError('Failed to delete database');
    }
  };

  // 🔥 Start sync ONCE and show modal. Progress comes from Firestore subscription below.
  const handleSyncDatabase = async (database: DatabaseEntry) => {
    if (!database.id) return;

    setCurrentSyncDatabase(database);
    setShowSyncProgress(true);
    setSyncingDatabases(prev => new Set(prev).add(database.id));
    setError('');

    // Reset UI fields
    const startTime = Date.now();
    setSyncProgressData({
      totalRecords: 0,
      processedRecords: 0,
      createdRecords: 0,
      updatedRecords: 0,
      errorRecords: 0,
      currentBatch: 0,
      totalBatches: 0,
      startTime,
      status: 'initializing',
      currentOperation: 'Starting sync...',
      errors: []
    });

    // Kick off server sync (server will batch & update Firestore)
    try {
      const res = await fetch(`/api/sheet-tabs/${database.id}/sync`, { method: 'POST' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || res.statusText || 'Failed to start sync');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to start sync');
    }
  };

  // 🔥 Subscribe to server-side progress on the current sheetTab
  useEffect(() => {
    if (!showSyncProgress || !currentSyncDatabase?.id) return;

    const ref = doc(db, 'sheetTabs', currentSyncDatabase.id);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const s = snap.data() as any;
        if (!s) return;

        const total = Number(s.total ?? 0);
        const processed = Number(s.processed ?? 0);
        const created = Number(s.created ?? 0);
        const updated = Number(s.updated ?? 0);
        const skipped = Number(s.skippedRowCount ?? 0);
        const lastBatch = Number(s.lastBatchIndex ?? 0);
        const elapsedMs = Number(s.elapsedMs ?? 0);
        const etaMs = Number(s.etaMs ?? 0);

        // estimate records/sec
        const rps = elapsedMs > 0 ? Math.round(processed / (elapsedMs / 1000)) : 0;

        setSyncProgressData(prev => ({
          ...prev,
          totalRecords: total,
          processedRecords: processed,
          createdRecords: created,
          updatedRecords: updated,
          errorRecords: skipped,
          currentBatch: lastBatch,
          totalBatches: total > 0 ? Math.ceil(total / 500) : prev.totalBatches, // server batch size 500
          estimatedTimeRemaining: etaMs,
          recordsPerSecond: rps,
          status:
            s.syncStatus === 'running' ? 'syncing' :
            s.syncStatus === 'completed' ? 'completed' :
            s.syncStatus === 'completed_with_warnings' ? 'completed' :
            s.syncStatus === 'failed' ? 'error' : 'initializing',
          currentOperation:
            s.syncStatus === 'running'
              ? `Batch ${lastBatch} • ${processed}/${total}`
              : (s.syncStatus || 'idle')
        }));

        // When finished, clear the spinner badge
        if (['completed', 'completed_with_warnings', 'failed'].includes(s.syncStatus)) {
          setSyncingDatabases(prev => {
            const cp = new Set(prev);
            if (currentSyncDatabase?.id) cp.delete(currentSyncDatabase.id);
            return cp;
          });

          // Store a simple result message
          setSyncResults(prev => new Map(prev).set(currentSyncDatabase.id!, {
            success: s.syncStatus !== 'failed',
            message: s.syncStatus === 'failed' ? 'Sync failed' : 'Sync completed',
            syncedCount: processed
          }));
        }
      },
      (err) => {
        console.error('Progress subscribe error:', err);
        setError(err?.message || 'Failed to read progress');
      }
    );

    return () => unsub();
  }, [showSyncProgress, currentSyncDatabase?.id]);

  const handleCancelSync = () => {
    // Client-side cancel = just hide modal (server continues).
    // If you want server cancel, we can add a cancel flag.
    setShowSyncProgress(false);
  };

  const handleEditDatabase = (database: DatabaseEntry) => {
    setEditingDatabase(database);
    setEditSelectedColumns([...database.selectedColumns]);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingDatabase || editSelectedColumns.length === 0) {
      setError('Please select at least one column');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      await sheetTabService.updateSheetTab(editingDatabase.id!, 'default', 'default', {
        selectedColumns: editSelectedColumns
      });

      setDatabases(prev => prev.map(db =>
        db.id === editingDatabase.id
          ? { ...db, selectedColumns: editSelectedColumns }
          : db
      ));

      setShowEditModal(false);
      setEditingDatabase(null);
      setEditSelectedColumns([]);

    } catch (e) {
      console.error('Error updating database:', e);
      setError('Failed to update database');
    } finally {
      setSubmitting(false);
    }
  };

  const getAvailableTabsForAdd = () => {
    if (!Array.isArray(availableTabs)) return [];
    return availableTabs.filter(tab =>
      !databases.some(db => db.tabName === tab.sheetTitle)
    );
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white shadow-sm rounded-lg border border-gray-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <Database className="w-6 h-6 text-blue-600" />
              <h1 className="text-xl font-semibold text-gray-900">Database Management</h1>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Database
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {/* Databases Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Key Column
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Selected Columns
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading databases...</p>
                  </td>
                </tr>
              ) : databases.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center">
                    <div className="text-gray-500">
                      <Database className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p className="text-lg font-medium mb-2">No databases found</p>
                      <p className="text-sm">Add your first database to get started</p>
                    </div>
                  </td>
                </tr>
              ) : (
                databases.map((database) => (
                  <tr key={database.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <button
                          onClick={() => router.push(`/databases/${database.id}/records`)}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer transition-colors"
                        >
                          {database.tabName}
                        </button>
                        {database.lastSyncAt && (
                          <div className="text-xs text-gray-500 mt-1">
                            Last sync: {new Date(database.lastSyncAt).toLocaleString()}
                          </div>
                        )}
                        {syncResults.has(database.id!) && syncResults.get(database.id!)?.success && (
                          <div className="text-xs text-green-600 mt-1">
                            Synced {syncResults.get(database.id!)?.syncedCount || 0} records successfully
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {database.keyColumn}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {database.selectedColumns && database.selectedColumns.length > 0 ? (
                          database.selectedColumns.length > 3
                            ? `${database.selectedColumns.slice(0, 3).join(', ')} +${database.selectedColumns.length - 3} more`
                            : database.selectedColumns.join(', ')
                        ) : (
                          <span className="text-gray-400 italic">No columns selected</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleSyncDatabase(database)}
                          disabled={syncingDatabases.has(database.id!)}
                          className="inline-flex items-center px-3 py-1 bg-green-100 text-green-700 rounded-md hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <RefreshCw className={`w-4 h-4 mr-1 ${syncingDatabases.has(database.id!) ? 'animate-spin' : ''}`} />
                          Sync
                        </button>
                        <button
                          onClick={() => handleEditDatabase(database)}
                          className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteDatabase(database.id!)}
                          className="inline-flex items-center px-3 py-1 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
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

      {/* Add Database Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Add New Database</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedTab(null);
                  setSelectedKeyColumn('');
                  setSelectedColumns([]);
                  setError('');
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {/* Tab Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Google Sheet Tab
                </label>
                <select
                  value={selectedTab?.sheetTitle || ''}
                  onChange={(e) => {
                    const tab = getAvailableTabsForAdd().find(t => t.sheetTitle === e.target.value) || null;
                    setSelectedTab(tab);
                    setSelectedKeyColumn('');
                    setSelectedColumns([]);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Choose a tab...</option>
                  {getAvailableTabsForAdd().map((tab) => (
                    <option key={tab.sheetId} value={tab.sheetTitle}>
                      {tab.sheetTitle}
                    </option>
                  ))}
                </select>
              </div>

              {/* Key Column Selection */}
              {selectedTab && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Key Column (Cannot be changed later)
                  </label>
                  <select
                    value={selectedKeyColumn}
                    onChange={(e) => setSelectedKeyColumn(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Choose key column...</option>
                    {selectedTab.columns.map((column) => (
                      <option key={column.index} value={column.name}>
                        {column.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Column Selection */}
              {selectedTab && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Columns to Sync
                  </label>
                  <div className="mb-3 flex space-x-2">
                    <button
                      onClick={() => setSelectedColumns(selectedTab.columns.map(col => col.name))}
                      className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => setSelectedColumns([])}
                      className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                    >
                      Deselect All
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                    {selectedTab.columns.map((column) => (
                      <label key={column.index} className="flex items-center space-x-2 py-1">
                        <input
                          type="checkbox"
                          checked={selectedColumns.includes(column.name)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedColumns(prev => [...prev, column.name]);
                            } else {
                              setSelectedColumns(prev => prev.filter(col => col !== column.name));
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{column.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedTab(null);
                    setSelectedKeyColumn('');
                    setSelectedColumns([]);
                    setError('');
                  }}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddDatabase}
                  disabled={submitting || !selectedTab || !selectedKeyColumn || selectedColumns.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Adding...' : 'Add Database'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Database Modal */}
      {showEditModal && editingDatabase && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Edit Database: {editingDatabase.tabName}</h3>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingDatabase(null);
                  setEditSelectedColumns([]);
                  setError('');
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  <strong>Key Column:</strong> {editingDatabase.keyColumn} (cannot be changed)
                </p>
              </div>

              {/* Column Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Columns to Sync
                </label>
                <div className="mb-3 flex space-x-2">
                  <button
                    onClick={() => {
                      const tab = availableTabs.find(t => t.sheetTitle === editingDatabase.tabName);
                      if (tab) setEditSelectedColumns(tab.columns.map(col => col.name));
                    }}
                    className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => setEditSelectedColumns([])}
                    className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    Deselect All
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                  {availableTabs
                    .find(tab => tab.sheetTitle === editingDatabase.tabName)
                    ?.columns.map((column) => (
                      <label key={column.index} className="flex items-center space-x-2 py-1">
                        <input
                          type="checkbox"
                          checked={editSelectedColumns.includes(column.name)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditSelectedColumns(prev => [...prev, column.name]);
                            } else {
                              setEditSelectedColumns(prev => prev.filter(col => col !== column.name));
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{column.name}</span>
                      </label>
                    ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingDatabase(null);
                    setEditSelectedColumns([]);
                    setError('');
                  }}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={submitting || editSelectedColumns.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sync Progress Modal (driven by Firestore updates) */}
      <SyncProgressModal
        isOpen={showSyncProgress}
        onClose={() => setShowSyncProgress(false)}
        onCancel={handleCancelSync}
        databaseName={currentSyncDatabase?.tabName || ''}
        collectionName={currentSyncDatabase?.collectionName || ''}
        progressData={syncProgressData}
      />
    </div>
  );
}
