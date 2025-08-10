import { Client } from '@/lib/types';

class BasicClientService {
  async getClients(companyId: string): Promise<Client[]> {
    const url = new URL('/api/clients-only', window.location.origin);
    url.searchParams.set('companyId', companyId);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error('Failed to fetch clients');
    }

    const data = await response.json();
    return data.clients;
  }

  async createClient(clientData: {
    companyId: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    createdBy: string;
  }): Promise<Client> {
    const response = await fetch('/api/clients-only', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(clientData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create client');
    }

    return response.json();
  }
}

export const basicClientService = new BasicClientService();
