import { redirect } from 'next/navigation';
import { isSessionSuperAdmin } from '@/lib/superAdminAuth';
import RolesMatrixClient from './RolesMatrixClient';

export const dynamic = 'force-dynamic';

export default async function RolesMatrixPage() {
    if (!(await isSessionSuperAdmin())) {
        redirect('/dashboard');
    }

    return <RolesMatrixClient />;
}
