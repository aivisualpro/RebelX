// import { google } from 'googleapis';
// import { SheetTab, SpreadsheetInfo } from './types';

// export async function getSheetsClient(serviceAccountKey: any) {
//   const jwt = new google.auth.JWT({
//     email: serviceAccountKey.client_email,
//     key: serviceAccountKey.private_key,
//     scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
//   });
  
//   await jwt.authorize();
//   return google.sheets({ version: 'v4', auth: jwt });
// }

// export async function getSpreadsheetInfo(
//   sheets: any, 
//   spreadsheetId: string
// ): Promise<SpreadsheetInfo> {
//   try {
//     const response = await sheets.spreadsheets.get({ 
//       spreadsheetId,
//       includeGridData: false 
//     });
    
//     const spreadsheetName = response.data.properties?.title || 'Untitled Spreadsheet';
//     const tabs: SheetTab[] = (response.data.sheets || []).map((sheet: any) => ({
//       sheetId: sheet.properties?.sheetId!,
//       sheetTitle: sheet.properties?.title!,
//     }));

//     return { spreadsheetName, tabs };
//   } catch (error) {
//     console.error('Error getting spreadsheet info:', error);
//     throw new Error('Failed to access spreadsheet. Please check the spreadsheet ID and permissions.');
//   }
// }

// export async function getSheetHeaders(
//   sheets: any, 
//   spreadsheetId: string, 
//   sheetTitle: string,
//   headerRow: number = 1
// ): Promise<string[]> {
//   try {
//     const response = await sheets.spreadsheets.values.get({
//       spreadsheetId,
//       range: `${sheetTitle}!${headerRow}:${headerRow}`,
//       valueRenderOption: 'UNFORMATTED_VALUE',
//     });

//     return (response.data.values?.[0] || []).map((header: string) => 
//       String(header || '').trim()
//     ).filter(Boolean);
//   } catch (error) {
//     console.error('Error getting sheet headers:', error);
//     throw new Error('Failed to read sheet headers.');
//   }
// }

// export async function readSheetValues(
//   sheets: any, 
//   spreadsheetId: string, 
//   sheetTitle: string
// ): Promise<string[][]> {
//   try {
//     const response = await sheets.spreadsheets.values.get({
//       spreadsheetId,
//       range: `${sheetTitle}!A:ZZ`,
//       valueRenderOption: 'UNFORMATTED_VALUE',
//       dateTimeRenderOption: 'FORMATTED_STRING',
//     });

//     return response.data.values || [];
//   } catch (error) {
//     console.error('Error reading sheet values:', error);
//     throw new Error('Failed to read sheet data.');
//   }
// }

// export function normalizeHeader(header: string): string {
//   return String(header || '')
//     .trim()
//     .replace(/\s+/g, ' ')
//     .replace(/[^\w\s]/g, '')
//     .split(' ')
//     .map((word, index) => {
//       if (index === 0) {
//         return word.toLowerCase();
//       }
//       return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
//     })
//     .join('');
// }

// export function validateSpreadsheetId(spreadsheetId: string): boolean {
//   // Google Sheets ID format: alphanumeric, hyphens, underscores, typically 44 characters
//   const regex = /^[a-zA-Z0-9-_]{10,}$/;
//   return regex.test(spreadsheetId);
// }
