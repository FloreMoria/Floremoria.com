import { NextResponse } from 'next/server';

export function checkAdminAuth(request: Request) {
    const adminKey = request.headers.get('x-admin-key');
    if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
        return false;
    }
    return true;
}
