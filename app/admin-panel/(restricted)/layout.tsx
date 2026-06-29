import { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isSuperAdminRole } from '@/lib/superAdmin';

export default async function AdminPanelRestrictedLayout({ children }: { children: ReactNode }) {
    const cookieStore = await cookies();
    const userRole = cookieStore.get('fm_user_role')?.value;

    if (!isSuperAdminRole(userRole)) {
        redirect('/dashboard');
    }

    return children;
}
