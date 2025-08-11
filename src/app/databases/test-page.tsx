'use client';

import { useState } from 'react';

export default function ConnectionsPageSimple() {
  const [loading, setLoading] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="p-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Connections</h1>
          <p className="text-gray-600">Welcome to the connections page!</p>
          
          <div className="mt-6">
            <button
              onClick={() => setLoading(!loading)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {loading ? 'Stop Loading' : 'Test Loading'}
            </button>
          </div>
          
          {loading && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-800">Testing loading state...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
