'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Database, Users, Sparkles, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useAppState } from '@/app/state/AppStateProvider';
import { 
  CreateConnectionModal,
  CreateDatabaseModal,
  SelectTablesModal 
} from './components';
import CreateClientModal from './components/CreateClientModal';
import ManageSheetTabsModal from './components/ManageSheetTabsModal';
import { connectionService, databaseService } from '@/lib/connections';
import { clientConnectionService } from '@/lib/clientConnectionService';
import { basicClientService } from '@/lib/basicClientService';
import { Connection, Database as DatabaseType, Client, ClientConnection } from '@/lib/types';

export default function ConnectionsPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string>('default');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [databases, setDatabases] = useState<{ [connectionId: string]: DatabaseType[] }>({});
  const [clients, setClients] = useState<Client[]>([]);
  const [clientConnections, setClientConnections] = useState<ClientConnection[]>([]);
  const [currentTab, setCurrentTab] = useState<'clients'>('clients');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { region, setRegion, allowedRegions } = useAppState();
  
  // Modal states
  const [showCreateConnection, setShowCreateConnection] = useState(false);
  const [showCreateDatabase, setShowCreateDatabase] = useState(false);
  const [showSelectTables, setShowSelectTables] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [showManageSheetTabs, setShowManageSheetTabs] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
  const [selectedDatabase, setSelectedDatabase] = useState<DatabaseType | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedClientConnection, setSelectedClientConnection] = useState<ClientConnection | null>(null);

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
        
        // Load connections (legacy approach)
        const connectionsData = await connectionService.getConnections(companyId);
        setConnections(connectionsData);
        
        // Load databases for each connection
        const databasesData: { [connectionId: string]: DatabaseType[] } = {};
        for (const connection of connectionsData) {
          try {
            const connectionDatabases = await databaseService.getDatabases(companyId, connection.id);
            databasesData[connection.id] = connectionDatabases;
          } catch (error) {
            console.error(`Error loading databases for connection ${connection.id}:`, error);
            databasesData[connection.id] = [];
          }
        }
        setDatabases(databasesData);
      } catch (error) {
        console.error('Error loading company data:', error);
        // Set empty arrays on error
        setConnections([]);
        setDatabases({});
        setClients([]);
        setClientConnections([]);
      } finally {
        setLoading(false);
      }
    };

    loadCompanyData();
  }, [companyId]);

  // Legacy workflow handlers
  const handleCreateConnection = () => {
    // For client connections (new architecture), use the client modal
    setShowCreateClient(true);
  };

  const handleConnectionCreated = async () => {
    setShowCreateConnection(false);
    try {
      const connectionsData = await connectionService.getConnections(companyId);
      setConnections(connectionsData);
    } catch (error) {
      console.error('Error reloading connections:', error);
    }
  };

  const handleCreateDatabase = (connection: Connection) => {
    setSelectedConnection(connection);
    setShowCreateDatabase(true);
  };

  const handleDatabaseCreated = async () => {
    setShowCreateDatabase(false);
    const connection = selectedConnection;
    setSelectedConnection(null);
    
    if (connection) {
      try {
        const connectionDatabases = await databaseService.getDatabases(companyId, connection.id);
        setDatabases(prev => ({
          ...prev,
          [connection.id]: connectionDatabases
        }));
      } catch (error) {
        console.error('Error reloading databases:', error);
      }
    }
  };

  const handleSelectTables = (database: DatabaseType) => {
    setSelectedDatabase(database);
    setShowSelectTables(true);
  };

  const handleTablesSelected = () => {
    setShowSelectTables(false);
    setSelectedDatabase(null);
  };

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading connections...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Connections</h1>
          <div className="flex items-center gap-3 relative">
            <div className="hidden sm:flex items-center border border-slate-200 rounded-lg overflow-hidden">
              <button disabled={!allowedRegions.includes('saudi1')} className={`px-3 py-1 text-sm border-r border-slate-200 ${region==='saudi1' ? 'bg-green-100 text-green-700' : 'bg-white text-slate-800 hover:bg-slate-50'} ${allowedRegions.includes('saudi1') ? '' : 'opacity-50 cursor-not-allowed'}`} onClick={()=> setRegion('saudi1')}>Saudi</button>
              <button disabled={!allowedRegions.includes('egypt1')} className={`px-3 py-1 text-sm ${region==='egypt1' ? 'bg-green-100 text-green-700' : 'bg-white text-slate-800 hover:bg-slate-50'} ${allowedRegions.includes('egypt1') ? '' : 'opacity-50 cursor-not-allowed'}`} onClick={()=> setRegion('egypt1')}>Egypt</button>
            </div>
            <button onClick={()=>setIsMenuOpen(!isMenuOpen)} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50" aria-label="menu">
              {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            {isMenuOpen && (
              <div className="absolute top-10 right-0 w-56 bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 py-2">
                <Link href={`/dashboard`} className="block px-4 py-2 hover:bg-slate-50">Dashboard</Link>
                <Link href={`/reports`} className="block px-4 py-2 hover:bg-slate-50">Reports</Link>
                <Link href={`/account`} className="block px-4 py-2 hover:bg-slate-50">Account</Link>
                <button onClick={()=>{ document.cookie = 'companyId=; Max-Age=0; path=/'; localStorage.removeItem('region'); localStorage.removeItem('allowedRegions'); location.href='/auth'; }} className="block w-full text-left px-4 py-2 hover:bg-slate-50">Logout</button>
              </div>
            )}
          </div>
        </div>
      </header>

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

                      <div className="flex space-x-2">
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

            {/* Actions */}
            <div className="mb-6">
              <button
                onClick={handleCreateConnection}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={20} />
                <span>Add Connection</span>
              </button>
            </div>

            {/* Connections List */}
            {connections.length === 0 ? (
              <div className="text-center py-12">
                <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <Database size={32} className="text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No connections yet</h3>
                <p className="text-gray-600 mb-4">Get started by creating your first Google Cloud connection.</p>
                <button
                  onClick={handleCreateConnection}
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus size={20} />
                  <span>Add Connection</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {connections.map((connection) => (
                  <div key={connection.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">
                          {connection.name}
                        </h3>
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
                      <p className="text-sm text-gray-600">
                        Databases: {databases[connection.id]?.length || 0}
                      </p>
                    </div>

                    {/* Show databases if any */}
                    {databases[connection.id] && databases[connection.id].length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">Databases:</h4>
                        <div className="space-y-1">
                          {databases[connection.id].slice(0, 3).map((database) => (
                            <div key={database.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                              <span className="text-sm text-gray-700 truncate">{database.spreadsheetName}</span>
                              <button
                                onClick={() => handleSelectTables(database)}
                                className="text-xs text-blue-600 hover:text-blue-800"
                              >
                                Tables
                              </button>
                            </div>
                          ))}
                          {databases[connection.id].length > 3 && (
                            <p className="text-xs text-gray-500">
                              +{databases[connection.id].length - 3} more
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleCreateDatabase(connection)}
                        className="px-3 py-1 text-blue-600 border border-blue-600 rounded hover:bg-blue-50 transition-colors"
                      >
                        Add Database
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateConnection && (
        <CreateConnectionModal
          companyId={companyId}
          onClose={() => setShowCreateConnection(false)}
          onSuccess={handleConnectionCreated}
        />
      )}

      {showCreateDatabase && selectedConnection && (
        <CreateDatabaseModal
          companyId={companyId}
          connection={selectedConnection}
          onClose={() => setShowCreateDatabase(false)}
          onSuccess={handleDatabaseCreated}
        />
      )}

      {showSelectTables && selectedDatabase && (
        <SelectTablesModal
          companyId={companyId}
          database={selectedDatabase}
          onClose={() => setShowSelectTables(false)}
          onSuccess={handleTablesSelected}
        />
      )}

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
