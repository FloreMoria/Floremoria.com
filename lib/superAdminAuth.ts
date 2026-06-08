import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { isAdminRole, isSuperAdminRole, SUPER_ADMIN_ROLE_NAME } from '@/lib/superAdmin';

export { SUPER_ADMIN_ROLE_NAME };

export async function getSessionRoleName(): Promise<string | undefined> {
    const cookieStore = await cookies();
    return cookieStore.get('fm_user_role')?.value;
}

export async function isSessionSuperAdmin(): Promise<boolean> {
    return isSuperAdminRole(await getSessionRoleName());
}

export async function isSessionAdmin(): Promise<boolean> {
    return isAdminRole(await getSessionRoleName());
}

/** Per Route Handlers: null se autorizzato, altrimenti risposta 403. */
export async function requireSuperAdminApi(): Promise<NextResponse | null> {
    if (!(await isSessionSuperAdmin())) {
        return NextResponse.json(
            { error: 'Accesso riservato al Super Admin.' },
            { status: 403 }
        );
    }
    return null;
}
