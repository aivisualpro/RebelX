// Client-side validation utilities
export function validateSpreadsheetId(spreadsheetId: string): boolean {
  // Google Sheets ID format: alphanumeric, hyphens, underscores, typically 44 characters
  const regex = /^[a-zA-Z0-9-_]{10,}$/;
  return regex.test(spreadsheetId);
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

export function extractSpreadsheetId(url: string): string {
  // Extract spreadsheet ID from Google Sheets URL
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : url;
}
