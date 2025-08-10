import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

class SecretManagerService {
  private client: SecretManagerServiceClient;

  constructor() {
    this.client = new SecretManagerServiceClient();
  }

  async storeSecret(projectId: string, secretId: string, secretValue: string): Promise<void> {
    try {
      // Create the secret
      const parent = `projects/${projectId}`;
      
      try {
        await this.client.createSecret({
          parent,
          secretId,
          secret: {
            replication: {
              automatic: {},
            },
          },
        });
      } catch (error: any) {
        // If secret already exists, that's okay
        if (!error.message?.includes('already exists')) {
          throw error;
        }
      }

      // Add the secret version
      const secretName = `projects/${projectId}/secrets/${secretId}`;
      await this.client.addSecretVersion({
        parent: secretName,
        payload: {
          data: Buffer.from(secretValue, 'utf8'),
        },
      });

      console.log(`Secret ${secretId} stored successfully`);
    } catch (error) {
      console.error('Error storing secret:', error);
      // In development mode, don't throw - just log the error
      if (process.env.NODE_ENV === 'development') {
        console.warn('Secret Manager unavailable in development mode, continuing without secure storage');
        return;
      }
      throw new Error(`Failed to store secret: ${error}`);
    }
  }

  async getSecret(projectId: string, secretId: string): Promise<string> {
    try {
      const name = `projects/${projectId}/secrets/${secretId}/versions/latest`;
      const [version] = await this.client.accessSecretVersion({ name });
      
      if (!version.payload?.data) {
        throw new Error('Secret data not found');
      }

      return version.payload.data.toString();
    } catch (error) {
      console.error('Error retrieving secret:', error);
      throw new Error(`Failed to retrieve secret: ${error}`);
    }
  }
}

export const secretManagerService = new SecretManagerService();
