'use client';

import { useState, useEffect } from 'react';
import { X, Table, AlertCircle, CheckSquare, Square } from 'lucide-react';
import { tableService } from '@/lib/connections';
import { Database as DatabaseType, SheetTab } from '@/lib/types';

interface SelectTablesModalProps {
  companyId: string;
  database: DatabaseType;
  onClose: () => void;
  onSuccess: () => void;
}

interface TableSelection {
  sheetId: number;
  sheetTitle: string;
  selected: boolean;
  keyColumn: string;
  headerRow: number;
  headers: string[];
}

export default function SelectTablesModal({ companyId, database, onClose, onSuccess }: SelectTablesModalProps) {
  const [tabs, setTabs] = useState<SheetTab[]>([]);
  const [tableSelections, setTableSelections] = useState<TableSelection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const [step, setStep] = useState<'select' | 'configure'>('select');

  useEffect(() => {
    loadTabs();
  }, []);

  const loadTabs = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Get tabs from database creation result or fetch from API
      const response = await fetch(`/api/databases/${database.id}/tabs`);
      if (!response.ok) {
        throw new Error('Failed to load spreadsheet tabs');
      }
      
      const data = await response.json();
      setTabs(data.tabs);
      
      // Initialize table selections
      const selections = data.tabs.map((tab: SheetTab) => ({
        sheetId: tab.sheetId,
        sheetTitle: tab.sheetTitle,
        selected: false,
        keyColumn: '',
        headerRow: 1,
        headers: [],
      }));
      
      setTableSelections(selections);
    } catch (error) {
      console.error('Error loading tabs:', error);
      setError(error instanceof Error ? error.message : 'Failed to load spreadsheet tabs');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = () => {
    setTableSelections(prev => prev.map(item => ({ ...item, selected: true })));
  };

  const handleDeselectAll = () => {
    setTableSelections(prev => prev.map(item => ({ ...item, selected: false })));
  };

  const handleToggleSelection = (sheetId: number) => {
    setTableSelections(prev =>
      prev.map(item =>
        item.sheetId === sheetId ? { ...item, selected: !item.selected } : item
      )
    );
  };

  const handleNext = async () => {
    const selectedTables = tableSelections.filter(item => item.selected);
    
    if (selectedTables.length === 0) {
      setError('Please select at least one table');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Load headers for selected tables
      const updatedSelections = await Promise.all(
        tableSelections.map(async (selection) => {
          if (selection.selected) {
            const response = await fetch('/api/sheets/headers', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                companyId,
                connectionId: database.connectionId,
                spreadsheetId: database.spreadsheetId,
                sheetTitle: selection.sheetTitle,
                headerRow: selection.headerRow,
              }),
            });

            if (response.ok) {
              const data = await response.json();
              return {
                ...selection,
                headers: data.headers,
                keyColumn: data.headers[0] || '', // Default to first header
              };
            }
          }
          return selection;
        })
      );

      setTableSelections(updatedSelections);
      setStep('configure');
    } catch (error) {
      console.error('Error loading headers:', error);
      setError('Failed to load sheet headers');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyColumnChange = (sheetId: number, keyColumn: string) => {
    setTableSelections(prev =>
      prev.map(item =>
        item.sheetId === sheetId ? { ...item, keyColumn } : item
      )
    );
  };

  const handleHeaderRowChange = (sheetId: number, headerRow: number) => {
    setTableSelections(prev =>
      prev.map(item =>
        item.sheetId === sheetId ? { ...item, headerRow } : item
      )
    );
  };

  const handleSave = async () => {
    const selectedTables = tableSelections.filter(item => item.selected);
    
    // Validate that all selected tables have key columns
    const invalidTables = selectedTables.filter(table => !table.keyColumn);
    if (invalidTables.length > 0) {
      setError('Please select a key column for all tables');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await tableService.bulkCreateTables({
        companyId,
        connectionId: database.connectionId,
        databaseId: database.id,
        spreadsheetId: database.spreadsheetId,
        tables: selectedTables.map(table => ({
          sheetId: table.sheetId,
          sheetTitle: table.sheetTitle,
          keyColumn: table.keyColumn,
          headerRow: table.headerRow,
          enabled: true,
        })),
      });

      onSuccess();
    } catch (error) {
      console.error('Error creating tables:', error);
      setError(error instanceof Error ? error.message : 'Failed to create tables');
    } finally {
      setSaving(false);
    }
  };

  if (loading && step === 'select') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Loading spreadsheet tabs...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Table size={20} className="text-purple-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {step === 'select' ? 'Select Tables' : 'Configure Tables'}
              </h2>
              <p className="text-sm text-gray-600">{database.spreadsheetName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'select' && (
            <div className="space-y-4">
              {/* Actions */}
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">
                  Select the sheets/tabs you want to sync:
                </p>
                <div className="flex space-x-2">
                  <button
                    onClick={handleSelectAll}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Select All
                  </button>
                  <button
                    onClick={handleDeselectAll}
                    className="text-sm text-gray-600 hover:text-gray-700"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Table List */}
              <div className="space-y-2">
                {tableSelections.map((table) => (
                  <div
                    key={table.sheetId}
                    className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      table.selected
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => handleToggleSelection(table.sheetId)}
                  >
                    {table.selected ? (
                      <CheckSquare size={20} className="text-blue-600" />
                    ) : (
                      <Square size={20} className="text-gray-400" />
                    )}
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">{table.sheetTitle}</h3>
                      <p className="text-sm text-gray-500">Sheet ID: {table.sheetId}</p>
                    </div>
                  </div>
                ))}
              </div>

              {tableSelections.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No sheets found in this spreadsheet.
                </div>
              )}
            </div>
          )}

          {step === 'configure' && (
            <div className="space-y-6">
              <p className="text-sm text-gray-600">
                Configure the key column for each selected table:
              </p>

              {tableSelections
                .filter(table => table.selected)
                .map((table) => (
                  <div key={table.sheetId} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-3">{table.sheetTitle}</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Header Row */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Header Row
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={table.headerRow}
                          onChange={(e) => handleHeaderRowChange(table.sheetId, parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                        />
                      </div>

                      {/* Key Column */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Key Column *
                        </label>
                        <select
                          value={table.keyColumn}
                          onChange={(e) => handleKeyColumnChange(table.sheetId, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                          required
                        >
                          <option value="">Select key column...</option>
                          {table.headers.map((header, index) => (
                            <option key={index} value={header}>
                              {header}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {table.headers.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs text-gray-500">
                          Available columns: {table.headers.join(', ')}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg mt-4">
              <AlertCircle size={16} className="text-red-600 flex-shrink-0" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end space-x-3 pt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            
            {step === 'select' && (
              <button
                onClick={handleNext}
                disabled={loading || tableSelections.filter(t => t.selected).length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Loading...' : 'Next'}
              </button>
            )}

            {step === 'configure' && (
              <>
                <button
                  onClick={() => setStep('select')}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Creating...' : 'Create Tables'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
