import { Timestamp } from 'firebase/firestore';

// Client interface - main collection in Firebase (represents your customers/clients)
export interface Client {
  id: string;
  companyId: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  projectId: string;
  serviceAccountEmail: string;
  secretName: string;
  spreadsheetId: string;
  spreadsheetName: string;
  
  createdAt: Timestamp;
  createdBy: string;
  status: "active" | "inactive";
}

// Connection interface - represents a Google Sheets connection FOR a specific client
export interface ClientConnection {
  id: string;
  companyId: string;
  clientId: string; // References the client this connection belongs to
  name: string;
  
  // Google Cloud Connection Info
  projectId: string;
  serviceAccountEmail: string;
  secretName: string;
  
  // Google Spreadsheet Info
  spreadsheetId: string;
  spreadsheetName: string;
  
  createdAt: Timestamp;
  createdBy: string;
  status: "active" | "disabled";
}

// Client sheet tab interface - represents a sheet that syncs with a Firebase collection
export interface ClientSheetTab {
  id: string;
  clientId: string;
  connectionId: string; // References the ClientConnection
  sheetName: string; // Name of the Google Sheets tab
  collectionName: string; // Name of the Firebase collection
  keyColumn: string; // Column that contains unique keys (will be used as Firebase document IDs)
  selectedColumns?: string[]; // Columns to sync (header names). If omitted, all columns are synced
  isActive: boolean;
  createdAt: Timestamp;
  lastSyncAt?: Timestamp;
  createdBy: string;
  recordCount?: number; // Number of records synced
  syncStatus?: 'pending' | 'completed' | 'completed_with_errors' | 'failed';
  lastSyncErrors?: string[]; // Array of error messages from last sync
}

// Connection interface
export interface Connection {
  id: string;
  companyId: string;
  name: string;
  projectId: string;
  serviceAccountEmail: string;
  secretName: string;
  createdAt: Timestamp;
  createdBy: string;
  status: "active" | "disabled";
}

// Database interface
export interface Database {
  id: string;
  companyId: string;
  connectionId: string;
  spreadsheetId: string;
  spreadsheetName: string;
  createdAt: Timestamp;
  status: "active" | "disabled";
}

// Table metadata interface
export interface TableMeta {
  id: string;
  companyId: string;
  connectionId: string;
  databaseId: string;
  spreadsheetId: string;
  sheetId: number;
  sheetTitle: string;
  headerRow: number;
  keyColumn: string;
  enabled: boolean;
  lastSyncAt?: Timestamp;
  lastSyncHash?: string;
  mode: "upsert";
  createdAt: Timestamp;
}

// Table row interface
export interface TableRow {
  [key: string]: unknown;
  _meta: {
    companyId: string;
    tableId: string;
    updatedAt: Timestamp;
    rowIndex?: number;
  };
}

// Sheet tab interface from Google Sheets API
export interface SheetTab {
  sheetId: number;
  sheetTitle: string;
}

// Spreadsheet info interface
export interface SpreadsheetInfo {
  spreadsheetName: string;
  tabs: SheetTab[];
}

// User interface for reports
export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string;
  department: string;
  status: string;
}

// User report interface
export interface UserReport {
  users: User[];
  summary: {
    total: number;
    salesOfficers: number;
    artists: number;
    receptionists: number;
  };
  categorized: {
    salesOfficers: User[];
    artists: User[];
    receptionists: User[];
  };
}

// Form interfaces for UI
export interface CreateConnectionForm {
  name: string;
  projectId: string;
  serviceAccountKeyFile: File | string | null;
}

export interface CreateDatabaseForm {
  companyId: string;
  connectionId: string;
  spreadsheetId: string;
}

export interface CreateTableForm {
  sheetId: number;
  sheetTitle: string;
  keyColumn: string;
  headerRow: number;
  enabled: boolean;
}

export interface BulkCreateTablesForm {
  companyId: string;
  connectionId: string;
  databaseId: string;
  spreadsheetId: string;
  tables: CreateTableForm[];
}

// New Client-based form interfaces
export interface CreateClientForm {
  name: string;
  projectId: string;
  serviceAccountKeyFile: File | string | null;
  spreadsheetId: string;
}

export interface BulkCreateSheetTabsForm {
  companyId: string;
  clientId: string;
  spreadsheetId: string;
  sheetTabs: {
    sheetName: string; // Name of the Google Sheets tab
    collectionName: string; // Name of the Firebase collection
    keyColumn: string; // REQUIRED: Must specify which column contains unique keys
    selectedColumns?: string[]; // Subset of columns to sync
    headerRow?: number;
    enabled?: boolean;
  }[];
  createdBy: string;
}
