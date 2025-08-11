'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, RefreshCw, Edit, CheckCircle, XCircle, AlertCircle, Database } from 'lucide-react';
import { sheetTabService } from '@/lib/connections';

import type { ClientSheetTab, DatabaseEntry, GoogleSheetTab } from '@/types';

export default function DatabaseManager() {
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
      // Remove client ID references - using default values only
      const response = await sheetTabService.getSheetTabs('default', 'default');
      console.log('Raw database response:', response);
      
      const mappedDatabases: DatabaseEntry[] = response.map((tab: ClientSheetTab) => {
        console.log('Processing tab:', tab.sheetName, 'selectedColumns:', tab.selectedColumns);
        
        // Ensure selectedColumns is properly handled
        const selectedColumns = Array.isArray(tab.selectedColumns) 
          ? tab.selectedColumns 
          : (tab.selectedColumns ? [tab.selectedColumns] : []);
        
        console.log('Mapped selectedColumns:', selectedColumns);
        
        return {
          id: tab.id,
          tabName: tab.sheetName,
          collectionName: tab.collectionName,
          keyColumn: tab.keyColumn,
          selectedColumns: selectedColumns,
          createdAt: tab.createdAt?.toDate ? tab.createdAt.toDate() : new Date(tab.createdAt),
          lastSyncAt: tab.lastSyncAt?.toDate ? tab.lastSyncAt.toDate() : (tab.lastSyncAt ? new Date(tab.lastSyncAt) : undefined)
        };
      });
      console.log('Mapped databases:', mappedDatabases);
      setDatabases(mappedDatabases);
    } catch (error) {
      console.error('Error loading databases:', error);
      setError('Failed to load databases');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableTabs = async () => {
    try {
      const response = await fetch('/api/client-connections/default/sheets');
      if (!response.ok) {
        throw new Error('Failed to fetch available tabs');
      }
      const data = await response.json();
      console.log('Available tabs response:', data);
      const sheetsArray = data.sheets || [];
      console.log('Sheets array:', sheetsArray);
      setAvailableTabs(sheetsArray);
    } catch (error) {
      console.error('Error loading available tabs:', error);
      setError('Failed to load available tabs');
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
      
      // Remove client ID references - using default values only
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
      
    } catch (error) {
      console.error('Error adding database:', error);
      setError('Failed to add database');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDatabase = async (databaseId: string) => {
    if (!confirm('Are you sure you want to delete this database? This action cannot be undone and will delete all records in the collection.')) {
      return;
    }

    try {
      await sheetTabService.deleteSheetTab(databaseId);
      setDatabases(prev => prev.filter(db => db.id !== databaseId));
    } catch (error) {
      console.error('Error deleting database:', error);
      setError('Failed to delete database');
    }
  };

  const handleSyncDatabase = async (database: DatabaseEntry) => {
    if (!database.id) return;

    try {
      setSyncingDatabases(prev => new Set(prev).add(database.id!));
      setError('');
      
      // Remove client ID references - using default values only
      const result = await sheetTabService.syncSheetTab(database.id, 'default', 'default');
      
      setSyncResults(prev => new Map(prev).set(database.id!, {
        success: true,
        message: `Synced ${result.syncedCount} records successfully`,
        syncedCount: result.syncedCount
      }));
      
      setDatabases(prev => prev.map(db => 
        db.id === database.id 
          ? { ...db, lastSyncAt: new Date() }
          : db
      ));
      
    } catch (error) {
      console.error('Error syncing database:', error);
      setSyncResults(prev => new Map(prev).set(database.id!, {
        success: false,
        message: 'Sync failed',
        syncedCount: 0
      }));
    } finally {
      setSyncingDatabases(prev => {
        const newSet = new Set(prev);
        newSet.delete(database.id!);
        return newSet;
      });
    }
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
      
      // Remove client ID references - using default values only
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
      
    } catch (error) {
      console.error('Error updating database:', error);
      setError('Failed to update database');
    } finally {
      setSubmitting(false);
    }
  };

  const getAvailableTabsForAdd = () => {
    if (!Array.isArray(availableTabs)) {
      console.error('availableTabs is not an array:', availableTabs);
      return [];
    }
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
                        <div className="text-sm font-medium text-gray-900">{database.tabName}</div>
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
                    const tab = getAvailableTabsForAdd().find(t => t.sheetTitle === e.target.value);
                    setSelectedTab(tab || null);
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
                      if (tab) {
                        setEditSelectedColumns(tab.columns.map(col => col.name));
                      }
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
    </div>
  );
}
