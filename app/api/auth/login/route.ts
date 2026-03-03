import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { username, password } = body;

        // Hardcoded login base come richiesto (Username: admin, Password: 2212)
        if (username === 'admin' && password === '2212') {
            const response = NextResponse.json({ success: true, redirectUrl: '/dashboard/orders' }, { status: 200 });

            // Impostiamo il cookie per il middleware con ruolo SUPER_ADMIN
            response.cookies.set({
                name: 'fm_user_role',
                value: 'SUPER_ADMIN',
                httpOnly: true,
                path: '/',
                secure: process.env.NODE_ENV === 'production',
                maxAge: 60 * 60 * 24 * 7 // 1 settimana
            });

            return response;
        }

        return NextResponse.json({ success: false, message: 'Credenziali non valide' }, { status: 401 });
    } catch (error) {
        return NextResponse.json({ success: false, message: 'Errore interno del server' }, { status: 500 });
    }
}
