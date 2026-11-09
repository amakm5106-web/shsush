import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@libsql/client';
import { initTursoSchema } from '@/lib/turso';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = body.url || process.env.TURSO_DATABASE_URL;
    const token = body.token || process.env.TURSO_AUTH_TOKEN;

    if (!token) {
      return NextResponse.json({
        success: false,
        error: 'Turso Auth Token is missing. Please provide a valid database token.',
      }, { status: 400 });
    }

    const client = createClient({
      url,
      authToken: token.trim(),
    });

    // Test a basic query
    const res = await client.execute('SELECT 1 as test_conn;');

    // Try schema initialization
    if (body.initSchema) {
      await initTursoSchema(client);
    }

    return NextResponse.json({
      success: true,
      message: 'Connected to Turso successfully!',
      testResult: res.rows,
      schemaInitialized: !!body.initSchema,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.message || String(error),
      detail: error?.cause ? String(error.cause) : undefined,
    }, { status: 500 });
  }
}
