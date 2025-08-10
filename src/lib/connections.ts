import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  Timestamp 
} from 'firebase/firestore';
import { db } from './firebase';
import { 
  Connection, 
  Database, 
  TableMeta, 
  CreateConnectionForm,
  CreateDatabaseForm,
  BulkCreateTablesForm,
  Client,
  ClientSheetTab,
  CreateClientForm,
  BulkCreateSheetTabsForm
} from './types';

// Connection service functions
export const connectionService = {
  // Create a new connection
  async createConnection(formData: CreateConnectionForm & { companyId: string; createdBy: string }): Promise<string> {
    try {
      // Prepare the request body
      const requestBody = {
        name: formData.name,
        projectId: formData.projectId,
        companyId: formData.companyId,
        createdBy: formData.createdBy,
        serviceAccountKeyFile: formData.serviceAccountKeyFile
      };

      const response = await fetch('/api/connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error('Failed to create connection');
      }

      const result = await response.json();
      return result.id;
    } catch (error) {
      console.error('Error creating connection:', error);
      throw error;
    }
  },

  // Get all connections for a company
  async getConnections(companyId: string): Promise<Connection[]> {
    try {
      const response = await fetch(`/api/connections?companyId=${companyId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch connections');
      }
      
      const data = await response.json();
      return data.connections.map((conn: any) => ({
        ...conn,
        createdAt: { toDate: () => new Date(conn.createdAt) } // Convert string back to Timestamp-like object
      }));
    } catch (error) {
      console.error('Error fetching connections:', error);
      throw error;
    }
  },

  // Update connection status
  async updateConnectionStatus(connectionId: string, status: 'active' | 'disabled'): Promise<void> {
    try {
      const connectionRef = doc(db, 'connections', connectionId);
      await updateDoc(connectionRef, { status });
    } catch (error) {
      console.error('Error updating connection status:', error);
      throw error;
    }
  },

  // Delete connection
  async deleteConnection(connectionId: string): Promise<void> {
    try {
      const connectionRef = doc(db, 'connections', connectionId);
      await deleteDoc(connectionRef);
    } catch (error) {
      console.error('Error deleting connection:', error);
      throw error;
    }
  },

  // Sync all tables for a connection
  async syncConnection(connectionId: string): Promise<void> {
    try {
      const response = await fetch(`/api/connections/${connectionId}/syncNow`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to sync connection');
      }
    } catch (error) {
      console.error('Error syncing connection:', error);
      throw error;
    }
  }
};

// Database service functions
export const databaseService = {
  // Create a new database (spreadsheet)
  async createDatabase(formData: CreateDatabaseForm): Promise<{ id: string; spreadsheetName: string; tabs: any[] }> {
    try {
      const response = await fetch('/api/databases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to create database');
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating database:', error);
      throw error;
    }
  },

  // Get all databases for a connection
  async getDatabases(companyId: string, connectionId?: string): Promise<Database[]> {
    try {
      const params = new URLSearchParams({ companyId });
      if (connectionId) {
        params.append('connectionId', connectionId);
      }
      
      const response = await fetch(`/api/databases?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch databases');
      }
      
      const data = await response.json();
      return data.databases.map((db: any) => ({
        ...db,
        createdAt: { toDate: () => new Date(db.createdAt) } // Convert string back to Timestamp-like object
      }));
    } catch (error) {
      console.error('Error fetching databases:', error);
      throw error;
    }
  },  // Sync all tables for a database
  async syncDatabase(databaseId: string): Promise<void> {
    try {
      const response = await fetch(`/api/databases/${databaseId}/syncNow`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to sync database');
      }
    } catch (error) {
      console.error('Error syncing database:', error);
      throw error;
    }
  }
};

// Table service functions
export const tableService = {
  // Bulk create tables
  async bulkCreateTables(formData: BulkCreateTablesForm): Promise<void> {
    try {
      const response = await fetch('/api/tables/bulkCreate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to create tables');
      }
    } catch (error) {
      console.error('Error creating tables:', error);
      throw error;
    }
  },

  // Get all tables for a database
  async getTables(companyId: string, databaseId?: string): Promise<TableMeta[]> {
    try {
      let q = query(
        collection(db, 'tables'),
        where('companyId', '==', companyId)
      );

      if (databaseId) {
        q = query(q, where('databaseId', '==', databaseId));
      }

      q = query(q, orderBy('createdAt', 'desc'));
      
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as TableMeta));
    } catch (error) {
      console.error('Error fetching tables:', error);
      throw error;
    }
  },

  // Update table enabled status
  async updateTableEnabled(tableId: string, enabled: boolean): Promise<void> {
    try {
      const tableRef = doc(db, 'tables', tableId);
      await updateDoc(tableRef, { enabled });
    } catch (error) {
      console.error('Error updating table status:', error);
      throw error;
    }
  },

  // Sync a specific table
  async syncTable(tableId: string): Promise<void> {
    try {
      const response = await fetch(`/api/tables/${tableId}/syncNow`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to sync table');
      }
    } catch (error) {
      console.error('Error syncing table:', error);
      throw error;
    }
  },

  // Get table data (rows)
  async getTableData(tableId: string, limit: number = 100): Promise<any[]> {
    try {
      const response = await fetch(`/api/tables/${tableId}/data?limit=${limit}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch table data');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching table data:', error);
      throw error;
    }
  }
};

// Client service functions (NEW Firebase-based architecture)
export const clientService = {
  // Create a new client (combines connection + spreadsheet in one step)
  async createClient(formData: CreateClientForm & { companyId: string; createdBy: string }): Promise<{ id: string; spreadsheetName: string }> {
    try {
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to create client');
      }

      const result = await response.json();
      return { id: result.id, spreadsheetName: result.spreadsheetName };
    } catch (error) {
      console.error('Error creating client:', error);
      throw error;
    }
  },

  // Get all clients for a company
  async getClients(companyId: string): Promise<Client[]> {
    try {
      const response = await fetch(`/api/clients?companyId=${companyId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch clients');
      }
      
      const data = await response.json();
      return data.clients.map((client: any) => ({
        ...client,
        createdAt: { toDate: () => new Date(client.createdAt) }
      }));
    } catch (error) {
      console.error('Error fetching clients:', error);
      throw error;
    }
  },
};

// Sheet Tab service functions (NEW Firebase-based architecture)
export const sheetTabService = {
  // Create sheet tabs for a client (this creates Firebase collections)
  async createSheetTabs(formData: BulkCreateSheetTabsForm): Promise<{ collectionsCreated: any[] }> {
    try {
      const response = await fetch('/api/sheet-tabs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to create sheet tabs');
      }

      const result = await response.json();
      return { collectionsCreated: result.collectionsCreated };
    } catch (error) {
      console.error('Error creating sheet tabs:', error);
      throw error;
    }
  },

  // Create a single sheet tab
  async createSheetTab(data: {
    clientId: string;
    connectionId: string;
    tabName: string;
    collectionName: string;
    keyColumn: string;
    selectedColumns?: string[];
    createdBy: string;
  }): Promise<ClientSheetTab> {
    try {
      const response = await fetch('/api/sheet-tabs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId: data.clientId,
          connectionId: data.connectionId,
          sheetTabs: [{
            sheetName: data.tabName,
            collectionName: data.collectionName,
            keyColumn: data.keyColumn,
            selectedColumns: data.selectedColumns,
          }],
          createdBy: data.createdBy,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create sheet tab');
      }

      const result = await response.json();
      const createdTab = result.collectionsCreated[0];
      
      return {
        id: createdTab.id,
        clientId: data.clientId,
        connectionId: data.connectionId,
        sheetName: data.tabName,
        collectionName: data.collectionName,
        keyColumn: data.keyColumn,
        selectedColumns: data.selectedColumns,
        isActive: true,
        createdAt: { toDate: () => new Date() } as any,
        createdBy: data.createdBy,
      };
    } catch (error) {
      console.error('Error creating sheet tab:', error);
      throw error;
    }
  },

  // Get sheet tabs for a client
  async getSheetTabs(companyId: string, clientId?: string): Promise<ClientSheetTab[]> {
    try {
      const params = new URLSearchParams({ companyId });
      if (clientId) {
        params.append('clientId', clientId);
      }
      
      const response = await fetch(`/api/sheet-tabs?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch sheet tabs');
      }
      
      const data = await response.json();
      return data.sheetTabs.map((sheetTab: any) => ({
        ...sheetTab,
        createdAt: { toDate: () => new Date(sheetTab.createdAt) },
        lastSyncAt: sheetTab.lastSyncAt ? { toDate: () => new Date(sheetTab.lastSyncAt) } : undefined
      }));
    } catch (error) {
      console.error('Error fetching sheet tabs:', error);
      throw error;
    }
  },

  // Update an existing sheet tab (selectedColumns, keyColumn)
  async updateSheetTab(tabId: string, clientId: string, connectionId: string, data: {
    selectedColumns?: string[];
    keyColumn?: string;
  }): Promise<void> {
    try {
      const response = await fetch(`/api/sheet-tabs/${tabId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, connectionId, ...data }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update sheet tab');
      }
    } catch (error) {
      console.error('Error updating sheet tab:', error);
      throw error;
    }
  },

  // Get sheet tabs for a specific client (optionally scoped to a connection)
  async getClientSheetTabs(clientId: string, connectionId?: string): Promise<ClientSheetTab[]> {
    try {
      const params = new URLSearchParams({ clientId });
      if (connectionId) params.set('connectionId', connectionId);
      const response = await fetch(`/api/sheet-tabs?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch client sheet tabs');
      }
      
      const data = await response.json();
      return data.sheetTabs.map((sheetTab: any) => ({
        ...sheetTab,
        createdAt: { toDate: () => new Date(sheetTab.createdAt) },
        lastSyncAt: sheetTab.lastSyncAt ? { toDate: () => new Date(sheetTab.lastSyncAt) } : undefined
      }));
    } catch (error) {
      console.error('Error fetching client sheet tabs:', error);
      throw error;
    }
  },

  // Delete a sheet tab
  async deleteSheetTab(tabId: string): Promise<void> {
    try {
      const response = await fetch(`/api/sheet-tabs/${tabId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete sheet tab');
      }
    } catch (error) {
      console.error('Error deleting sheet tab:', error);
      throw error;
    }
  },

  // Sync sheet tab data from Google Sheets to Firebase collection
  async syncSheetTab(tabId: string, clientId: string, connectionId: string): Promise<{
    success: boolean;
    message: string;
    syncedCount: number;
    skippedCount?: number;
    errorCount: number;
    errors: string[];
    skippedRows?: string[];
    collectionName: string;
    sheetName: string;
    storagePath?: string;
  }> {
    try {
      const response = await fetch(`/api/sheet-tabs/${tabId}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId,
          connectionId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to sync sheet tab');
      }

      return await response.json();
    } catch (error) {
      console.error('Error syncing sheet tab:', error);
      throw error;
    }
  },

  // Get records for a sheet tab
  async getSheetTabRecords(tabId: string, clientId: string, connectionId: string, limit: number = 100): Promise<{
    success: boolean;
    records: any[];
    sheetTabInfo: {
      sheetName: string;
      collectionName: string;
      keyColumn: string;
      recordCount: number;
      lastSyncAt: string | null;
    };
    storagePath: string;
    totalFound: number;
  }> {
    try {
      const params = new URLSearchParams({
        clientId,
        connectionId,
        limit: limit.toString(),
      });

      const response = await fetch(`/api/sheet-tabs/${tabId}/records?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch sheet tab records');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching sheet tab records:', error);
      throw error;
    }
  },
};
