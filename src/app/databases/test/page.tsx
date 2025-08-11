'use client';

import { useState } from 'react';
import { RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

export default function TestConnectionPage() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const testConnection = async () => {
    setTesting(true);
    setResult(null);
    
    try {
      const response = await fetch('/api/test-connection');
      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: 'Failed to test connection',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Google Sheets Connection Test</h1>
          <p className="text-gray-600 mt-2">Test your Google Sheets configuration and see available tabs</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <button
            onClick={testConnection}
            disabled={testing}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw size={16} className={`mr-2 ${testing ? 'animate-spin' : ''}`} />
            {testing ? 'Testing Connection...' : 'Test Connection'}
          </button>

          {result && (
            <div className="mt-6">
              {result.success ? (
                <div className="space-y-6">
                  {/* Success Header */}
                  <div className="flex items-center p-4 bg-green-50 border border-green-200 rounded-lg">
                    <CheckCircle className="text-green-500 mr-3" size={20} />
                    <div>
                      <h3 className="text-green-800 font-medium">Connection Successful!</h3>
                      <p className="text-green-700 text-sm mt-1">{result.message}</p>
                    </div>
                  </div>

                  {/* Spreadsheet Info */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-3">Spreadsheet Information</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Title:</span>
                        <span className="ml-2 font-medium">{result.spreadsheet.title}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">ID:</span>
                        <span className="ml-2 font-mono text-xs">{result.spreadsheet.id}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Locale:</span>
                        <span className="ml-2">{result.spreadsheet.locale}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Time Zone:</span>
                        <span className="ml-2">{result.spreadsheet.timeZone}</span>
                      </div>
                    </div>
                  </div>

                  {/* Service Account Info */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-3">Service Account</h4>
                    <div className="text-sm space-y-2">
                      <div>
                        <span className="text-gray-600">Email:</span>
                        <span className="ml-2 font-mono text-xs">{result.serviceAccount.email}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Project ID:</span>
                        <span className="ml-2">{result.serviceAccount.projectId}</span>
                      </div>
                    </div>
                  </div>

                  {/* Available Sheets */}
                  <div className="bg-white border border-gray-200 rounded-lg">
                    <div className="px-4 py-3 border-b border-gray-200">
                      <h4 className="font-medium text-gray-900">Available Google Sheet Tabs ({result.sheets.length})</h4>
                    </div>
                    <div className="divide-y divide-gray-200">
                      {result.sheets.map((sheet: any, index: number) => (
                        <div key={sheet.sheetId} className="px-4 py-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <h5 className="font-medium text-gray-900">{sheet.sheetTitle}</h5>
                              <div className="text-sm text-gray-600 mt-1">
                                <span>Sheet ID: {sheet.sheetId}</span>
                                <span className="ml-4">Type: {sheet.sheetType}</span>
                                {sheet.gridProperties && (
                                  <span className="ml-4">
                                    Size: {sheet.gridProperties.rowCount}×{sheet.gridProperties.columnCount}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                              Tab #{index + 1}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* First Sheet Columns */}
                  {result.firstSheetColumns && result.firstSheetColumns.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-lg">
                      <div className="px-4 py-3 border-b border-gray-200">
                        <h4 className="font-medium text-gray-900">
                          Column Headers (from "{result.sheets[0]?.sheetTitle}")
                        </h4>
                      </div>
                      <div className="p-4">
                        <div className="flex flex-wrap gap-2">
                          {result.firstSheetColumns.map((column: any) => (
                            <span
                              key={column.index}
                              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                            >
                              {column.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Error Header */}
                  <div className="flex items-start p-4 bg-red-50 border border-red-200 rounded-lg">
                    <XCircle className="text-red-500 mr-3 mt-0.5" size={20} />
                    <div className="flex-1">
                      <h3 className="text-red-800 font-medium">Connection Failed</h3>
                      <p className="text-red-700 text-sm mt-1">{result.error}</p>
                      {result.details && (
                        <p className="text-red-600 text-sm mt-2 font-mono bg-red-100 p-2 rounded">
                          {result.details}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Environment Variables Check */}
                  {result.environmentCheck && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-3">Environment Variables</h4>
                      <div className="space-y-2">
                        {result.environmentCheck.missingVariables?.length > 0 ? (
                          <div className="text-sm text-red-600">
                            <AlertCircle className="inline mr-2" size={16} />
                            Missing: {result.environmentCheck.missingVariables.join(', ')}
                          </div>
                        ) : (
                          <div className="text-sm text-green-600">
                            <CheckCircle className="inline mr-2" size={16} />
                            All required environment variables are present
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Stack Trace (if available) */}
                  {result.stack && (
                    <details className="bg-gray-50 rounded-lg p-4">
                      <summary className="cursor-pointer font-medium text-gray-900 mb-2">
                        Stack Trace (Click to expand)
                      </summary>
                      <pre className="text-xs text-gray-600 overflow-x-auto bg-white p-3 rounded border">
                        {result.stack}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}