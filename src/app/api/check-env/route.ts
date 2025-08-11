import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Get all environment variables that start with GOOGLE_
    const googleEnvVars: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('GOOGLE_')) {
        // Don't expose the full private key, just show if it exists and its length
        if (key.includes('PRIVATE_KEY') || key.includes('SERVICE_ACCOUNT_KEY')) {
          googleEnvVars[key] = value ? `Present (${value.length} chars)` : 'Missing';
        } else {
          googleEnvVars[key] = value || 'Missing';
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Environment variables check',
      googleEnvVars,
      totalGoogleVars: Object.keys(googleEnvVars).length
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to check environment variables',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
