'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Database, Users, Sparkles, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useAppState } from '@/app/state/AppStateProvider';
import CreateClientModal from './components/CreateClientModal';
import ManageSheetTabsModal from './components/ManageSheetTabsModal';
import { clientConnectionService } from '@/lib/clientConnectionService';
import { basicClientService } from '@/lib/basicClientService';
import { Client, ClientConnection } from '@/lib/types';

function ConnectionsContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string>('default');

  const [clients, setClients] = useState<Client[]>([]);
  const [clientConnections, setClientConnections] = useState<ClientConnection[]>([]);
  const [currentTab] = useState<'clients'>('clients');

  const [hasAccess, setHasAccess] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  
  // Modal states
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [showManageSheetTabs, setShowManageSheetTabs] = useState(false);

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedClientConnection, setSelectedClientConnection] = useState<ClientConnection | null>(null);

  // Check access control - only allow admin@aivisualpro.com
  useEffect(() => {
    const checkAccess = () => {
      try {
        const userEmail = localStorage.getItem('userEmail');
        const isAdmin = userEmail === 'admin@aivisualpro.com';
        setHasAccess(isAdmin);
        setAccessChecked(true);
      } catch (error) {
        console.error('Error checking access:', error);
        setHasAccess(false);
        setAccessChecked(true);
      }
    };

    checkAccess();
  }, []);

  // Get companyId from URL parameters
  useEffect(() => {
    const urlCompanyId = searchParams.get('companyId');
    if (urlCompanyId) {
      setCompanyId(urlCompanyId);
    }
  }, [searchParams]);

  // Load company data
  useEffect(() => {
    const loadCompanyData = async () => {
      try {
        setLoading(true);
        
        // Load clients (basic client info)
        // Note: All clients are stored under companyId "default", so we query that
        const clientsData = await basicClientService.getClients('default');
        setClients(clientsData);
        
        // Load client connections (Google Sheets connections for clients)
        // companyId from URL is the clientId, and connections are stored with matching companyId
        const clientConnectionsData = await clientConnectionService.getConnections(companyId, companyId);
        setClientConnections(clientConnectionsData);
        

      } catch (error) {
        console.error('Error loading company data:', error);
        // Set empty arrays on error
        setClients([]);
        setClientConnections([]);
      } finally {
        setLoading(false);
      }
    };

    loadCompanyData();
  }, [companyId]);



  // New client workflow handlers
  const handleCreateClient = () => {
    setShowCreateClient(true);
  };

  const handleClientCreated = async () => {
    setShowCreateClient(false);
    try {
      // companyId is actually the clientId in our URL structure
      const clientConnectionsData = await clientConnectionService.getConnections('default', companyId);
      setClientConnections(clientConnectionsData);
    } catch (error) {
      console.error('Error reloading client connections:', error);
    }
  };

  const handleManageSheetTabs = (clientConnection: ClientConnection) => {
    setSelectedClientConnection(clientConnection);
    setShowManageSheetTabs(true);
  };

  const handleSheetTabsManaged = () => {
    setShowManageSheetTabs(false);
    setSelectedClientConnection(null);
  };

  // Show loading while checking access
  if (!accessChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-lg text-gray-600">Checking access...</div>
      </div>
    );
  }

  // Show access denied if user is not admin@aivisualpro.com
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md mx-4 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.314 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Restricted</h1>
          <p className="text-slate-600 mb-6">
            This page is only accessible to authorized administrators.
          </p>
          <Link 
            href="/dashboard" 
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading connections...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Dashboard Navigation Button */}
      <div className="p-6 pb-0">
        <Link 
          href={`/dashboard?companyId=${searchParams.get('companyId') || 'booking-plus'}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>

      {/* Main Content */}
      <div className="p-6">
        {currentTab === 'clients' ? (
          /* Clients Tab (New Firebase Architecture) */
          <div>
            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start space-x-3">
                <Sparkles className="text-blue-600 mt-0.5" size={20} />
                <div>
                  <h3 className="text-sm font-medium text-blue-900">Recommended: Client-Based Setup</h3>
                  <p className="text-sm text-blue-800 mt-1">
                    This approach creates connections to Google Sheets for existing clients in your Firebase Clients collection. 
                    Each sheet creates its own Firebase collection for data synchronization.
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mb-6">
              <button
                onClick={handleCreateClient}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={20} />
                <span>Add Connection</span>
              </button>
            </div>

            {/* Client Connections List */}
            {clientConnections.length === 0 ? (
              <div className="text-center py-12">
                <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <Users size={32} className="text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No connections yet</h3>
                <p className="text-gray-600 mb-4">Create your first connection to sync Google Sheets with Firebase collections for a client.</p>
                <button
                  onClick={handleCreateClient}
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus size={20} />
                  <span>Add Connection</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {clientConnections.map((connection) => {
                  // Find the client for this connection
                  const client = clients.find(c => c.id === connection.clientId);
                  
                  return (
                    <div key={connection.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-1">
                            {connection.name}
                          </h3>
                          <p className="text-sm text-gray-600">
                            Client: {client?.name || 'Unknown'}
                          </p>
                          <p className="text-sm text-gray-600">
                            Project: {connection.projectId}
                          </p>
                        </div>
                        <div className="flex items-center space-x-1">
                          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                          <span className="text-sm text-gray-600">Active</span>
                        </div>
                      </div>
                      
                      <div className="mb-4">
                        <p className="text-sm text-gray-600 mb-2">
                          Created: {connection.createdAt.toDate().toLocaleDateString()}
                        </p>
                        <p className="text-sm text-gray-600 mb-2">
                          Spreadsheet: {connection.spreadsheetName}
                        </p>
                      </div>

                      <div className="flex space-x-2 mt-4">
                        <button
                          onClick={() => handleManageSheetTabs(connection)}
                          className="px-3 py-1 text-blue-600 border border-blue-600 rounded hover:bg-blue-50 transition-colors"
                        >
                          Manage Sheets
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Legacy Tab (Original Architecture) */
          <div>
            {/* Info Banner */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <div className="flex items-start space-x-3">
                <Database className="text-amber-600 mt-0.5" size={20} />
                <div>
                  <h3 className="text-sm font-medium text-amber-900">Legacy Setup</h3>
                  <p className="text-sm text-amber-800 mt-1">
                    This is the original multi-step approach. For new projects, we recommend using the Client-based setup above.
                  </p>
                </div>
              </div>
            </div>

            {/* Legacy workflow removed - now focusing on client connections only */}
            <div className="text-center py-12">
              <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Database size={32} className="text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Legacy Workflow Removed</h3>
              <p className="text-gray-600 mb-4">This section previously managed legacy database connections. The application now focuses on client connections and Google Sheets integration.</p>
            </div>
          </div>
        )}
      </div>

      {/* Legacy workflow modals removed */}

      {/* Client Modals */}
      {showCreateClient && (
        <CreateClientModal
          companyId={companyId} // Use the actual companyId from URL
          currentClientId={companyId} // The logged-in client ID from URL
          currentClientName={clients.find(c => c.id === companyId)?.name || `Client ${companyId}`} // Better fallback name
          onClose={() => setShowCreateClient(false)}
          onSuccess={handleClientCreated}
        />
      )}

      {showManageSheetTabs && selectedClientConnection && (
        <ManageSheetTabsModal
          clientConnection={selectedClientConnection}
          onClose={() => setShowManageSheetTabs(false)}
          onSuccess={handleSheetTabsManaged}
        />
      )}
    </div>
  );
}

export default function ConnectionsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-slate-600">Loading connections...</div>
        </div>
      </div>
    }>
      <ConnectionsContent />
    </Suspense>
  );
}
