'use client';

import { useState } from 'react';
import { X, AlertCircle, Database } from 'lucide-react';
import { databaseService } from '@/lib/connections';
import { Connection } from '@/lib/types';
import { validateSpreadsheetId, extractSpreadsheetId } from '@/lib/validation';

interface CreateDatabaseModalProps {
  companyId: string;
  connection: Connection;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateDatabaseModal({ companyId, connection, onClose, onSuccess }: CreateDatabaseModalProps) {
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!spreadsheetId.trim()) {
      setError('Spreadsheet ID is required');
      return;
    }

    if (!validateSpreadsheetId(spreadsheetId)) {
      setError('Invalid spreadsheet ID format');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await databaseService.createDatabase({
        companyId,
        connectionId: connection.id,
        spreadsheetId: spreadsheetId.trim(),
      });

      onSuccess();
    } catch (error) {
      console.error('Error creating database:', error);
      setError(error instanceof Error ? error.message : 'Failed to create database');
    } finally {
      setLoading(false);
    }
  };

  const extractSpreadsheetIdFromUrl = (url: string): string => {
    return extractSpreadsheetId(url);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const extractedId = extractSpreadsheetIdFromUrl(value);
    setSpreadsheetId(extractedId);
    if (error) setError('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Database size={20} className="text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Add Database</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Connection Info */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="text-sm font-medium text-blue-900 mb-1">Connection</h3>
            <p className="text-sm text-blue-700">{connection.name}</p>
            <p className="text-xs text-blue-600">{connection.projectId}</p>
          </div>

          {/* Spreadsheet ID */}
          <div>
            <label htmlFor="spreadsheetId" className="block text-sm font-medium text-gray-700 mb-1">
              Google Spreadsheet
            </label>
            <input
              type="text"
              id="spreadsheetId"
              value={spreadsheetId}
              onChange={handleInputChange}
              placeholder="Paste spreadsheet URL or ID"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              You can paste the full Google Sheets URL or just the spreadsheet ID
            </p>
          </div>

          {/* Instructions */}
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 className="text-sm font-medium text-yellow-800 mb-1">Important:</h4>
            <ul className="text-xs text-yellow-700 space-y-1">
              <li>• Make sure the spreadsheet is shared with the service account email:</li>
              <li className="font-mono text-xs bg-yellow-100 p-1 rounded">
                {connection.serviceAccountEmail}
              </li>
              <li>• Grant at least &quot;Viewer&quot; permission</li>
            </ul>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle size={16} className="text-red-600 flex-shrink-0" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Adding...' : 'Add Database'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
