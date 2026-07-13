import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST() {
  try {
    await prisma.systemState.deleteMany({
      where: {
        key: {
          in: [
            'tiktok_access_token',
            'tiktok_refresh_token',
            'tiktok_token_expires_at',
            'tiktok_open_id',
          ],
        },
      },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
