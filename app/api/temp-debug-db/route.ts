import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
    const dbUrl = process.env.DATABASE_URL || 'Not defined';
    // Mask password: postgres://user:******@host/db
    const masked = dbUrl.replace(/:([^:@]+)@/, ':******@');
    return NextResponse.json({ databaseUrl: masked });
}
