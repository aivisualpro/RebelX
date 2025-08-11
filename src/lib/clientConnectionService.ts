import { ClientConnection } from '@/lib/types';

class ClientConnectionService {
  async getConnections(companyId: string, clientId?: string): Promise<ClientConnection[]> {
    const url = new URL('/api/client-connections', window.location.origin);
    url.searchParams.set('companyId', companyId);
    if (clientId) {
      url.searchParams.set('clientId', clientId);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error('Failed to fetch client connections');
    }

    const data = await response.json();
    return data.connections.map((connection: ClientConnection) => ({
      ...connection,
      createdAt: { toDate: () => new Date(connection.createdAt.seconds * 1000) }
    }));
  }

  async createConnection(connectionData: {
    companyId: string;
    clientId: string;
    name: string;
    projectId: string;
    spreadsheetId: string;
    serviceAccountKeyFile: string;
    createdBy: string;
  }): Promise<ClientConnection> {
    const response = await fetch('/api/client-connections', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(connectionData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create connection');
    }

    return response.json();
  }

  async getConnectionSheets(connectionId: string) {
    const response = await fetch(`/api/client-connections/${connectionId}/sheets`);
    if (!response.ok) {
      throw new Error('Failed to fetch connection sheets');
    }

    return response.json();
  }
}

export const clientConnectionService = new ClientConnectionService();
