import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@libsql/client';
import { initTursoSchema } from '@/lib/turso';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = body.url || process.env.TURSO_DATABASE_URL || 'libsql://casino-xavianelio.aws-ap-southeast-1.turso.io';
    const token =
      body.token ||
      process.env.TURSO_AUTH_TOKEN ||
      'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTQwOTkxNjMsImlkIjoiMDFhMWI2YjItMzgwMS03ZDBkLTliODQtNjAxNWVjNjM3ZTgzIiwia2lkIjoiQUFOQ3JJdjV5b0l5aERZbXlXZXU3dWNJNE9wUHZmZGp3S1plbVFob0VtdyIsInJpZCI6ImE5Y2ZmN2U5LWIyNjAtNDk0YS05ZmE0LWRkZWEyMzQ3Y2YxMiJ9.bjJi_iZ9gYIlksPBHMIUVDZ0df6Z-uZbLLrUWgAemrWsbFg98m8Uf9S38T7cElh6Op7fiK9KEwG4Letad1uZDQ';

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
