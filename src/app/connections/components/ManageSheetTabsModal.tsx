'use client';

import { useState, useEffect } from 'react';
import { X, RefreshCw, Eye, Database, Plus, AlertCircle, Check, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { sheetTabService } from '@/lib/connections';
import type { ClientConnection, ClientSheetTab } from '@/lib/types';

interface ManageSheetTabsModalProps {
  clientConnection: ClientConnection;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ManageSheetTabsModal({ clientConnection, onClose, onSuccess }: ManageSheetTabsModalProps) {
  const [sheetTabs, setSheetTabs] = useState<ClientSheetTab[]>([]);
  const [newTab, setNewTab] = useState({
    tabName: '',
    collectionName: '',
    keyColumn: '',
    selectedColumns: [] as string[],
  });
  const [availableSheets, setAvailableSheets] = useState<Array<{
    sheetId: number;
    sheetName: string;
    rowCount: number;
    columnCount: number;
    availableColumns: Array<{
      name: string;
      letter: string;
      index: number;
    }>;
  }>>([]);
  const [selectedSheet, setSelectedSheet] = useState<typeof availableSheets[0] | null>(null);
  const [allColumnsSelected, setAllColumnsSelected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [syncingTabs, setSyncingTabs] = useState<Set<string>>(new Set());
  const [syncResults, setSyncResults] = useState<Map<string, {
    success: boolean;
    message: string;
    syncedCount: number;
    skippedCount?: number;
    errorCount: number;
    errors?: string[];
    skippedRows?: string[];
    storagePath?: string;
  }>>(new Map());
  const [viewingRecords, setViewingRecords] = useState<{
    tabId: string;
    records: any[];
    sheetTabInfo: any;
    storagePath: string;
  } | null>(null);

  // Load existing sheet tabs for this client connection
  useEffect(() => {
    loadSheetTabs();
    loadAvailableSheets();
  }, [clientConnection.id]);

  const loadSheetTabs = async () => {
    try {
      setLoading(true);
      const tabs = await sheetTabService.getClientSheetTabs(clientConnection.clientId, clientConnection.id);
      setSheetTabs(tabs);
    } catch (error) {
      console.error('Error loading sheet tabs:', error);
      setError('Failed to load existing sheet tabs');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableSheets = async () => {
    try {
      setLoading(true);
      console.log('Loading sheets for connection ID:', clientConnection.id);
      const response = await fetch(`/api/client-connections/${clientConnection.id}/sheets`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to fetch sheets:', response.status, errorText);
        throw new Error(`Failed to fetch available sheets: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      console.log('API Response:', data);
      
      if (data.success && data.sheets && Array.isArray(data.sheets)) {
        console.log('Fetched sheets data:', data.sheets);
        // Convert API format to frontend format
        const convertedSheets = data.sheets.map((sheet: any) => {
          // Try multiple possible fields for sheet name
          const sheetName = sheet.sheetTitle || sheet.sheetName || sheet.title || `Sheet ${sheet.sheetId || ''}`.trim();
          console.log('Processing sheet:', { 
            sheetId: sheet.sheetId, 
            sheetTitle: sheet.sheetTitle,
            sheetName: sheet.sheetName,
            title: sheet.title,
            finalSheetName: sheetName,
            hasColumns: !!sheet.columns,
            columnCount: sheet.columns ? sheet.columns.length : 0
          });
          
          const sheetData = {
            sheetId: sheet.sheetId || Date.now(), // Fallback to timestamp if no ID
            sheetName: sheetName,
            rowCount: sheet.rowCount || (sheet.hasData ? 100 : 0),
            columnCount: sheet.columns ? sheet.columns.length : 0,
            availableColumns: (sheet.columns || []).map((col: any, index: number) => {
              const colName = col.name || `Column ${col.index !== undefined ? col.index + 1 : index + 1}`;
              const colIndex = col.index !== undefined ? col.index : index;
              return {
                name: colName,
                letter: String.fromCharCode(65 + colIndex),
                index: colIndex + 1,
              };
            }),
          };
          
          console.log('Created sheet data:', sheetData);
          return sheetData;
        });
        
        console.log('Setting available sheets:', convertedSheets);
        setAvailableSheets(convertedSheets);
      } else {
        throw new Error(data.error || 'Failed to fetch sheets');
      }
    } catch (error) {
      console.error('Error loading available sheets:', error);
      setError('Failed to load available sheets from Google Sheets');
      
      // Fallback to mock data for development
      setAvailableSheets([
        {
          sheetId: 0,
          sheetName: 'Users',
          rowCount: 100,
          columnCount: 5,
          availableColumns: [
            { name: 'id', letter: 'A', index: 1 },
            { name: 'name', letter: 'B', index: 2 },
            { name: 'email', letter: 'C', index: 3 },
            { name: 'created_at', letter: 'D', index: 4 },
            { name: 'status', letter: 'E', index: 5 },
          ],
        },
        {
          sheetId: 1,
          sheetName: 'Orders',
          rowCount: 250,
          columnCount: 7,
          availableColumns: [
            { name: 'order_id', letter: 'A', index: 1 },
            { name: 'user_id', letter: 'B', index: 2 },
            { name: 'product', letter: 'C', index: 3 },
            { name: 'amount', letter: 'D', index: 4 },
            { name: 'status', letter: 'E', index: 5 },
            { name: 'created_at', letter: 'F', index: 6 },
            { name: 'updated_at', letter: 'G', index: 7 },
          ],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTab = async () => {
    if (!newTab.tabName.trim() || !newTab.collectionName.trim() || !newTab.keyColumn.trim()) {
      setError('All fields are required');
      return;
    }
    if (!newTab.selectedColumns || newTab.selectedColumns.length === 0) {
      setError('Please select at least one column to sync');
      return;
    }
    // Check if tab name already exists
    if (sheetTabs.some(tab => tab.sheetName === newTab.tabName)) {
      setError('A sheet tab with this name already exists');
      return;
    }
    // Check if collection name already exists
    if (sheetTabs.some(tab => tab.collectionName === newTab.collectionName)) {
      setError('A collection with this name already exists');
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      const createdTab = await sheetTabService.createSheetTab({
        clientId: clientConnection.clientId,
        connectionId: clientConnection.id,
        ...newTab,
        createdBy: 'current-user',
      });
      setSheetTabs(prev => [...prev, createdTab]);
      setNewTab({ tabName: '', collectionName: '', keyColumn: '', selectedColumns: [] });
      setAllColumnsSelected(false);
    } catch (error) {
      console.error('Error creating sheet tab:', error);
      setError(error instanceof Error ? error.message : 'Failed to create sheet tab');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTab = async (tabId: string) => {
    if (!confirm('Are you sure you want to delete this sheet tab configuration? This will not delete the Firebase collection.')) {
      return;
    }

    try {
      await sheetTabService.deleteSheetTab(tabId);
      setSheetTabs(prev => prev.filter(tab => tab.id !== tabId));
    } catch (error) {
      console.error('Error deleting sheet tab:', error);
      setError('Failed to delete sheet tab');
    }
  };

  const handleSyncTab = async (tab: ClientSheetTab) => {
    if (!tab.id) {
      setError('Cannot sync: Sheet tab ID is missing');
      return;
    }

    try {
      setSyncingTabs(prev => new Set(prev).add(tab.id));
      setSyncResults(prev => {
        const newMap = new Map(prev);
        newMap.delete(tab.id); // Clear previous result
        return newMap;
      });
      setError('');

      console.log('Syncing tab:', tab.id, 'for client:', clientConnection.clientId, 'connection:', clientConnection.id);

      const result = await sheetTabService.syncSheetTab(
        tab.id,
        clientConnection.clientId,
        clientConnection.id
      );

      setSyncResults(prev => new Map(prev).set(tab.id, {
        success: true,
        message: result.message,
        syncedCount: result.syncedCount,
        skippedCount: result.skippedCount || 0,
        errorCount: result.errorCount,
        errors: result.errors,
        skippedRows: result.skippedRows,
        storagePath: result.storagePath,
      }));

      // Refresh the sheet tabs to get updated sync metadata
      await loadSheetTabs();

    } catch (error) {
      console.error('Error syncing sheet tab:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to sync sheet tab';
      
      setSyncResults(prev => new Map(prev).set(tab.id, {
        success: false,
        message: errorMessage,
        syncedCount: 0,
        errorCount: 1,
      }));
    } finally {
      setSyncingTabs(prev => {
        const newSet = new Set(prev);
        newSet.delete(tab.id);
        return newSet;
      });
    }
  };

  const handleViewRecords = async (tab: ClientSheetTab) => {
    if (!tab.id) {
      setError('Cannot view records: Sheet tab ID is missing');
      return;
    }

    try {
      console.log('Fetching records for tab:', tab.id, 'client:', clientConnection.clientId, 'connection:', clientConnection.id);

      const result = await sheetTabService.getSheetTabRecords(
        tab.id,
        clientConnection.clientId,
        clientConnection.id,
        50 // Limit to first 50 records for preview
      );

      setViewingRecords({
        tabId: tab.id,
        records: result.records,
        sheetTabInfo: result.sheetTabInfo,
        storagePath: result.storagePath,
      });

    } catch (error) {
      console.error('Error fetching records:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch records';
      setError(errorMessage);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    if (field === 'tabName' && value) {
      // Find the selected sheet from availableSheets when tabName changes
      const sheet = availableSheets.find(s => s.sheetName === value);
      if (sheet) {
        setSelectedSheet(sheet);
        // Reset selected columns and key column when sheet changes
        setNewTab(prev => ({
          ...prev,
          [field]: value,
          selectedColumns: [],
          keyColumn: ''
        }));
        setAllColumnsSelected(false);
        return;
      }
      const collectionName = value
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
      setNewTab(prev => ({ ...prev, collectionName, keyColumn: '' }));
    }
    
    if (error) setError('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Manage Sheet Tabs</h2>
            <p className="text-sm text-gray-600 mt-1">Connection: {clientConnection.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              <strong>How it works:</strong> Each sheet tab you configure here will create a corresponding Firebase collection. 
              The key column you specify will be used as the document ID in Firebase for data synchronization.
            </p>
          </div>

          {/* Add New Tab Form */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Add New Sheet Tab</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {/* Tab Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sheet Tab Name
                </label>
                <select
                  value={newTab.tabName}
                  onChange={(e) => handleInputChange('tabName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                >
                  <option value="">Select a sheet...</option>
                  {availableSheets.map(sheet => (
                    <option key={sheet.sheetId} value={sheet.sheetName}>
                      {sheet.sheetName} ({sheet.rowCount} rows, {sheet.columnCount} cols)
                    </option>
                  ))}
                </select>
              </div>

              {/* Collection Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Firebase Collection
                </label>
                <input
                  type="text"
                  value={newTab.collectionName}
                  onChange={(e) => handleInputChange('collectionName', e.target.value)}
                  placeholder="collection_name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                />
              </div>

              {/* Key Column */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Key Column *
                </label>
                {selectedSheet && selectedSheet.availableColumns.length > 0 ? (
                  <select
                    value={newTab.keyColumn}
                    onChange={(e) => handleInputChange('keyColumn', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                  >
                    <option value="">Select key column...</option>
                    {selectedSheet.availableColumns.map(col => (
                      <option key={col.index} value={col.name}>
                        {col.letter}: {col.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={newTab.keyColumn}
                    onChange={(e) => handleInputChange('keyColumn', e.target.value)}
                    placeholder="e.g., id, email, user_id"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                  />
                )}
                <p className="text-xs text-gray-500 mt-1">
                  This column's values will be used as document IDs in Firebase
                </p>
              </div>
            </div>

            {/* Multi-select columns UI */}
            {selectedSheet && selectedSheet.availableColumns.length > 0 && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Select Columns to Sync from "{selectedSheet.sheetName}":</h4>
                <div className="flex flex-wrap gap-2 mb-2">
                  <button
                    type="button"
                    className={`px-2 py-1 text-xs rounded border ${allColumnsSelected ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-gray-100 text-gray-700'}`}
                    onClick={() => {
                      setNewTab(prev => ({ ...prev, selectedColumns: selectedSheet.availableColumns.map(col => col.name) }));
                      setAllColumnsSelected(true);
                    }}
                  >Select All</button>
                  <button
                    type="button"
                    className="px-2 py-1 text-xs rounded border bg-gray-100 text-gray-700"
                    onClick={() => {
                      setNewTab(prev => ({ ...prev, selectedColumns: [] }));
                      setAllColumnsSelected(false);
                    }}
                  >Deselect All</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedSheet.availableColumns.map(col => (
                    <label key={col.index} className="flex items-center space-x-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newTab.selectedColumns.includes(col.name)}
                        onChange={e => {
                          const checked = e.target.checked;
                          setNewTab(prev => {
                            const selected = new Set(prev.selectedColumns);
                            if (checked) selected.add(col.name);
                            else selected.delete(col.name);
                            setAllColumnsSelected(selected.size === selectedSheet.availableColumns.length);
                            return { ...prev, selectedColumns: Array.from(selected) };
                          });
                        }}
                        className="accent-blue-600"
                      />
                      <span className={`px-2 py-1 text-xs rounded-full ${newTab.keyColumn === col.name ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'bg-gray-100 text-gray-700'}`}>{col.letter}: {col.name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  💡 Choose which columns to sync. Only selected columns will be stored in Firebase.<br />
                  <span className="font-semibold">Key Column</span> must be included in your selection.
                </p>
              </div>
            )}

            <button
              onClick={handleAddTab}
              disabled={submitting || !newTab.tabName || !newTab.collectionName || !newTab.keyColumn}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus size={16} />
              <span>{submitting ? 'Adding...' : 'Add Sheet Tab'}</span>
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-6">
              <AlertCircle size={16} className="text-red-600 flex-shrink-0" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          {/* Existing Sheet Tabs */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Configured Sheet Tabs</h3>
            
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-600 mt-2">Loading sheet tabs...</p>
              </div>
            ) : sheetTabs.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <Database size={24} className="mx-auto text-gray-400 mb-2" />
                <p className="text-gray-600">No sheet tabs configured yet</p>
                <p className="text-sm text-gray-500">Add your first sheet tab above to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sheetTabs.map((tab) => {
                  const isSyncing = syncingTabs.has(tab.id);
                  const syncResult = syncResults.get(tab.id);
                  
                  return (
                    <div key={tab.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="font-medium text-gray-900">{tab.sheetName || (tab as any).tabName || (tab as any).name || 'Untitled'}</span>
                            <span className="text-gray-400">→</span>
                            <span className="text-blue-600">{tab.collectionName}</span>
                            <Check size={16} className="text-green-600" />
                          </div>
                          <p className="text-sm text-gray-600">
                            Key Column: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{tab.keyColumn || '—'}</span>
                          </p>
                          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                            {tab.createdAt && typeof (tab.createdAt as any).toDate === 'function' && (
                              <span>Created: {(tab.createdAt as any).toDate().toLocaleDateString()}</span>
                            )}
                            {tab.lastSyncAt && typeof (tab.lastSyncAt as any).toDate === 'function' && (
                              <span>Last sync: {(tab.lastSyncAt as any).toDate().toLocaleString()}</span>
                            )}
                            {typeof tab.recordCount === 'number' && (
                              <span>Records: {tab.recordCount.toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {/* Edit Columns (opens current selection for quick update) */}
                          <button
                            onClick={() => {
                              // Open an inline editor using existing selection
                              const selectedSheetLike = availableSheets.find(s => s.sheetName === tab.sheetName);
                              if (!selectedSheetLike) {
                                alert('Columns could not be loaded for this tab. Try re-opening Manage Sheet Tabs.');
                                return;
                              }
                              setSelectedSheet(selectedSheetLike);
                              setNewTab({
                                tabName: tab.sheetName,
                                collectionName: tab.collectionName,
                                keyColumn: tab.keyColumn,
                                selectedColumns: (tab.selectedColumns || []),
                              });
                              // Save updated columns on confirm
                              const confirmUpdate = confirm('Edit selected columns for this tab? After choosing, click OK to save.');
                              if (confirmUpdate) {
                                sheetTabService.updateSheetTab(
                                  tab.id,
                                  clientConnection.clientId,
                                  clientConnection.id,
                                  { selectedColumns: newTab.selectedColumns, keyColumn: newTab.keyColumn }
                                ).then(() => loadSheetTabs());
                              }
                            }}
                            className="flex items-center space-x-1 px-3 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                            title="Edit selected columns"
                          >
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handleViewRecords(tab)}
                            className="flex items-center space-x-1 px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
                            title="View synced records"
                          >
                            <Eye size={14} />
                            <span>View</span>
                          </button>
                          <button
                            onClick={() => handleSyncTab(tab)}
                            disabled={isSyncing}
                            className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                          >
                            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                            <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                          </button>
                          <button
                            onClick={() => handleDeleteTab(tab.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Sync Result */}
                      {syncResult && (
                        <div className={`mt-3 p-3 rounded-lg border ${
                          syncResult.success 
                            ? 'bg-green-50 border-green-200' 
                            : 'bg-red-50 border-red-200'
                        }`}>
                          <div className="flex items-start space-x-2">
                            {syncResult.success ? (
                              <CheckCircle size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                            ) : (
                              <XCircle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
                            )}
                            <div className="flex-1">
                              <p className={`text-sm font-medium ${
                                syncResult.success ? 'text-green-800' : 'text-red-800'
                              }`}>
                                {syncResult.success ? 'Sync Successful' : 'Sync Failed'}
                              </p>
                              <p className={`text-xs mt-1 ${
                                syncResult.success ? 'text-green-700' : 'text-red-700'
                              }`}>
                                {syncResult.message}
                              </p>
                              {syncResult.success && syncResult.syncedCount !== undefined && (
                                <div className="flex flex-col space-y-1 mt-2 text-xs text-green-600">
                                  <div className="flex items-center space-x-2 ml-4">
                                    <span>✓ Synced: {syncResult.syncedCount} records</span>
                                    {syncResult.skippedCount !== undefined && syncResult.skippedCount > 0 && (
                                      <span className="text-yellow-600">⚠ Skipped: {syncResult.skippedCount} rows</span>
                                    )}
                                    {syncResult.errorCount !== undefined && syncResult.errorCount > 0 && (
                                      <span className="text-red-600">✗ Errors: {syncResult.errorCount}</span>
                                    )}
                                  </div>
                                  {syncResult.storagePath && (
                                    <div className="bg-green-100 p-2 rounded text-green-800 font-mono text-xs">
                                      📁 Stored at: {syncResult.storagePath}
                                    </div>
                                  )}
                                  {/* Show skipped rows details */}
                                  {syncResult.skippedRows && syncResult.skippedRows.length > 0 && (
                                    <div className="bg-yellow-50 p-2 rounded border border-yellow-200 mt-2">
                                      <p className="text-yellow-800 font-medium text-xs mb-1">Skipped Rows:</p>
                                      <div className="space-y-1">
                                        {syncResult.skippedRows.map((skipped, index) => (
                                          <div key={index} className="text-yellow-700 text-xs font-mono">
                                            {skipped}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {/* Show error details */}
                                  {syncResult.errors && syncResult.errors.length > 0 && (
                                    <div className="bg-red-50 p-2 rounded border border-red-200 mt-2">
                                      <p className="text-red-800 font-medium text-xs mb-1">Errors:</p>
                                      <div className="space-y-1">
                                        {syncResult.errors.map((error, index) => (
                                          <div key={index} className="text-red-700 text-xs font-mono">
                                            {error}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end space-x-3 pt-6 mt-6 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
            {sheetTabs.length > 0 && (
              <button
                onClick={onSuccess}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Complete Setup
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Records Viewer Modal */}
      {viewingRecords && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg shadow-xl w-[95vw] max-w-[1800px] max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Records: {viewingRecords.sheetTabInfo.sheetName}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Collection: {viewingRecords.sheetTabInfo.collectionName} • 
                  Key Column: {viewingRecords.sheetTabInfo.keyColumn}
                </p>
                <p className="text-xs text-gray-500 font-mono mt-1">
                  📁 {viewingRecords.storagePath}
                </p>
              </div>
              <button
                onClick={() => setViewingRecords(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Records Content */}
            <div className="flex-1 overflow-hidden">
              {viewingRecords.records.length === 0 ? (
                <div className="text-center py-8">
                  <Database size={24} className="mx-auto text-gray-400 mb-2" />
                  <p className="text-gray-600">No records found</p>
                  <p className="text-sm text-gray-500">Sync this sheet tab to populate records</p>
                </div>
              ) : (
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
                    <p className="text-sm text-gray-600">
                      Showing {viewingRecords.records.length} records
                      {viewingRecords.sheetTabInfo.lastSyncAt && (
                        <span className="ml-2">
                          • Last synced: {new Date(viewingRecords.sheetTabInfo.lastSyncAt).toLocaleString()}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Records Table Container */}
                  <div className="flex-1 overflow-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-xs border border-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {/* Use original headers in their proper order */}
                      {viewingRecords.sheetTabInfo.selectedHeaders && viewingRecords.sheetTabInfo.headerOrder ?
                            viewingRecords.sheetTabInfo.selectedHeaders.map((header: string, index: number) => {
                              const sanitizedKey = viewingRecords.sheetTabInfo.headerOrder[index];
                              return (
                                <th key={sanitizedKey || index} className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px] max-w-[200px] bg-gray-50 sticky top-0 border-r border-gray-200">
                                  <div className="truncate" title={header}>
                                    {header}
                                  </div>
                                </th>
                              );
                            }) :
                            // Fallback to record keys if original headers not available
                            viewingRecords.records.length > 0 && 
                            Object.keys(viewingRecords.records[0])
                              .filter(key => !['id', 'syncedAt', 'syncedFrom', 'sheetTabId', 'clientId', 'connectionId'].includes(key))
                              .map(columnKey => (
                                <th key={columnKey} className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px] max-w-[200px] bg-gray-50 sticky top-0 border-r border-gray-200">
                                  <div className="truncate" title={columnKey.replace(/_/g, ' ')}>
                                    {columnKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                  </div>
                                </th>
                              ))
                          }
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px] bg-gray-50 sticky top-0">
                            Synced At
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {viewingRecords.records.map((record, index) => (
                          <tr key={record.id || index} className="hover:bg-gray-50">
                            {/* Render data in the same order as headers */}
                            {viewingRecords.sheetTabInfo.headerOrder ?
                              viewingRecords.sheetTabInfo.headerOrder.map((sanitizedKey: string) => (
                                <td key={sanitizedKey} className="px-2 py-2 text-xs text-gray-900 min-w-[120px] max-w-[200px] border-r border-gray-100">
                                  <div className="truncate" title={String(record[sanitizedKey] || '')}>
                                    {String(record[sanitizedKey] || '')}
                                  </div>
                                </td>
                              )) :
                              // Fallback to record keys if header order not available
                              Object.keys(record)
                                .filter(key => !['id', 'syncedAt', 'syncedFrom', 'sheetTabId', 'clientId', 'connectionId'].includes(key))
                                .map(columnKey => (
                                  <td key={columnKey} className="px-2 py-2 text-xs text-gray-900 min-w-[120px] max-w-[200px] border-r border-gray-100">
                                    <div className="truncate" title={String(record[columnKey] || '')}>
                                      {String(record[columnKey] || '')}
                                    </div>
                                  </td>
                                ))
                            }
                             <td className="px-2 py-2 text-xs text-gray-500 min-w-[120px]">
                              <div className="truncate">
                                {record.syncedAt ? new Date(record.syncedAt.seconds * 1000).toLocaleString() : 'N/A'}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end p-6 border-t border-gray-200">
              <button
                onClick={() => setViewingRecords(null)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
