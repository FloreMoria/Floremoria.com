import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware Centrale FloreMoria
 * 
 * Implementa logiche di Sicurezza, RBAC (Role-Based Access Control)
 * e incanalamento del traffico (Data e Domain Isolation).
 */
export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // TODO: In fase di integrazione database reale con Auth, decodificare JWT/NextAuth session. 
    // Per ora utilizziamo un placeholder basato sui cookies:
    const userRole = request.cookies.get('fm_user_role')?.value;
    const roleExpiresAt = request.cookies.get('fm_role_expires_at')?.value;

    // -------------------------------------------------------------
    // CONTROLLO VALIDITÀ TTL (Role Expires At)
    // -------------------------------------------------------------
    if (roleExpiresAt) {
        if (new Date() > new Date(roleExpiresAt)) {
            // Tempo Scaduto: Elimina Cookies e Declassamento a Login
            const response = NextResponse.redirect(new URL('/login?expired=1', request.url));
            response.cookies.delete('fm_user_role');
            response.cookies.delete('fm_role_expires_at');
            return response;
        }
    }

    // -------------------------------------------------------------
    // PROTEZIONE AREA DASHBOARD (RBAC DOMAIN ISOLATION)
    // -------------------------------------------------------------
    if (pathname.startsWith('/dashboard')) {
        // Nessun accesso? Redirect Login.
        if (!userRole) {
            return NextResponse.redirect(new URL('/login', request.url));
        }

        // 1. SUPER_ADMIN (Es. Salvatore, CEO) -> Accesso Illimitato a /dashboard/*
        if (userRole === 'SUPER_ADMIN') {
            return NextResponse.next();
        }

        // 2. OPERATOR (Team Customer Service) -> Solo Ordini
        if (userRole === 'OPERATOR') {
            if (pathname.startsWith('/dashboard/orders') || pathname === '/dashboard') {
                return NextResponse.next();
            }
            return NextResponse.redirect(new URL('/dashboard', request.url));
        }

        // 3. PARTNER_FLORIST (Fioristi) -> La Dashboard filtrerà via DB solo i loro ordini.
        if (userRole === 'PARTNER_FLORIST') {
            if (pathname.startsWith('/dashboard/orders') || pathname === '/dashboard') {
                return NextResponse.next();
            }
            return NextResponse.redirect(new URL('/dashboard', request.url));
        }

        // 4. MARKETING_MANAGER (Copywriter / Esperti SEO) -> Solo Blog, Meta
        if (userRole === 'MARKETING_MANAGER') {
            if (pathname.startsWith('/dashboard/blog') || pathname === '/dashboard') {
                return NextResponse.next();
            }
            return NextResponse.redirect(new URL('/dashboard', request.url));
        }

        // Ruoli base (CUSTOMER) non abilitati
        return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next();
}

// Configura i path su cui far triggerare il Middleware
export const config = {
    matcher: [
        '/dashboard/:path*'
    ],
};
