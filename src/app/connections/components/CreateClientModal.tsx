'use client';

import { useState } from 'react';
import { X, Upload, AlertCircle } from 'lucide-react';
import { clientConnectionService } from '@/lib/clientConnectionService';
import { validateServiceAccountKey, validateSpreadsheetId, extractSpreadsheetId } from '@/lib/validation';

interface CreateConnectionModalProps {
  companyId: string;
  currentClientId: string; // The logged-in client ID
  currentClientName: string; // The logged-in client name
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateConnectionModal({ companyId, currentClientId, currentClientName, onClose, onSuccess }: CreateConnectionModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    projectId: '',
    spreadsheetId: '',
  });
  const [serviceAccountFile, setServiceAccountFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // Special handling for spreadsheet ID to extract from URL
    if (name === 'spreadsheetId') {
      const extractedId = extractSpreadsheetId(value);
      setFormData(prev => ({ ...prev, [name]: extractedId }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    
    if (error) setError('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setServiceAccountFile(file);
      if (error) setError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setError('Connection name is required');
      return;
    }
    
    if (!formData.projectId.trim()) {
      setError('Project ID is required');
      return;
    }
    
    if (!formData.spreadsheetId.trim()) {
      setError('Spreadsheet ID is required');
      return;
    }
    
    if (!serviceAccountFile) {
      setError('Service account key file is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Read the file and validate it
      const fileContent = await serviceAccountFile.text();
      const validation = validateServiceAccountKey(fileContent);
      
      if (!validation.valid) {
        setError(validation.error || 'Invalid service account key file');
        setLoading(false);
        return;
      }

      // Validate spreadsheet ID
      if (!validateSpreadsheetId(formData.spreadsheetId)) {
        setError('Invalid spreadsheet ID format');
        setLoading(false);
        return;
      }

      // Create the connection for the current logged-in client
      await clientConnectionService.createConnection({
        ...formData,
        companyId,
        clientId: currentClientId, // Use the logged-in client ID
        createdBy: currentClientName, // Use the logged-in client name
        serviceAccountKeyFile: fileContent,
      });

      onSuccess();
    } catch (error) {
      console.error('Error creating connection:', error);
      setError(error instanceof Error ? error.message : 'Failed to create connection');
    } finally {
      setLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/json') {
      setServiceAccountFile(file);
      if (error) setError('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Add Connection</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Connection Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Connection Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="e.g., Marketing Sheets Connection"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
              required
            />
          </div>

          {/* Current Client Info */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client
            </label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-700">
              {currentClientName}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              This connection will be created for the currently logged-in client.
            </p>
          </div>

          {/* Project ID */}
          <div>
            <label htmlFor="projectId" className="block text-sm font-medium text-gray-700 mb-1">
              Google Cloud Project ID
            </label>
            <input
              type="text"
              id="projectId"
              name="projectId"
              value={formData.projectId}
              onChange={handleInputChange}
              placeholder="your-project-id"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
              required
            />
          </div>

          {/* Spreadsheet ID */}
          <div>
            <label htmlFor="spreadsheetId" className="block text-sm font-medium text-gray-700 mb-1">
              Google Spreadsheet
            </label>
            <input
              type="text"
              id="spreadsheetId"
              name="spreadsheetId"
              value={formData.spreadsheetId}
              onChange={handleInputChange}
              placeholder="Paste spreadsheet URL or ID"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              You can paste the full Google Sheets URL or just the spreadsheet ID
            </p>
          </div>

          {/* Service Account Key File */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Service Account Key (JSON)
            </label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                serviceAccountFile
                  ? 'border-green-300 bg-green-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {serviceAccountFile ? (
                <div className="flex items-center justify-center space-x-2 text-green-600">
                  <Upload size={20} />
                  <span className="text-sm font-medium">{serviceAccountFile.name}</span>
                </div>
              ) : (
                <div>
                  <Upload size={24} className="mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600 mb-2">
                    Drag and drop your service account key file here, or
                  </p>
                  <label className="inline-block px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
                    Browse Files
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Upload the JSON key file downloaded from Google Cloud Console
            </p>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> This creates a Google Sheets connection for your client account ({currentClientName}). 
              After creation, you'll configure which sheets to sync with Firebase collections.
            </p>
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
              {loading ? 'Creating...' : 'Create Connection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
