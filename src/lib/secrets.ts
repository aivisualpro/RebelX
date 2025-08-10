import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const secretManager = new SecretManagerServiceClient();

export async function createSecret(
  projectId: string,
  secretData: string,
  secretId?: string
): Promise<{ secretName: string; serviceAccountEmail: string }> {
  try {
    // Parse the service account key to get the email
    const serviceAccountKey = JSON.parse(secretData);
    const serviceAccountEmail = serviceAccountKey.client_email;

    // Generate a unique secret ID if not provided
    const finalSecretId = secretId || `connection-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const parent = `projects/${projectId}`;

    // Create the secret
    const [secret] = await secretManager.createSecret({
      parent,
      secretId: finalSecretId,
      secret: {
        replication: {
          automatic: {},
        },
      },
    });

    if (!secret.name) {
      throw new Error('Failed to create secret');
    }

    // Add the secret version with the service account key data
    await secretManager.addSecretVersion({
      parent: secret.name,
      payload: {
        data: Buffer.from(secretData, 'utf8'),
      },
    });

    return {
      secretName: secret.name,
      serviceAccountEmail,
    };
  } catch (error) {
    console.error('Error creating secret:', error);
    throw new Error(`Failed to create secret: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getSecretValue(secretName: string): Promise<string> {
  try {
    const [version] = await secretManager.accessSecretVersion({
      name: `${secretName}/versions/latest`,
    });

    const payload = version.payload?.data;
    if (!payload) {
      throw new Error('Secret payload is empty');
    }

    return payload.toString('utf8');
  } catch (error) {
    console.error('Error accessing secret:', error);
    throw new Error(`Failed to access secret: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function deleteSecret(secretName: string): Promise<void> {
  try {
    await secretManager.deleteSecret({
      name: secretName,
    });
  } catch (error) {
    console.error('Error deleting secret:', error);
    throw new Error(`Failed to delete secret: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function validateServiceAccountKey(keyData: string): { valid: boolean; error?: string } {
  try {
    const parsed = JSON.parse(keyData);
    
    const requiredFields = [
      'type',
      'project_id',
      'private_key_id',
      'private_key',
      'client_email',
      'client_id',
      'auth_uri',
      'token_uri'
    ];

    for (const field of requiredFields) {
      if (!parsed[field]) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }

    if (parsed.type !== 'service_account') {
      return { valid: false, error: 'Key must be for a service account' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Invalid JSON format' };
  }
}
