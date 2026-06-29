import { redirect } from 'next/navigation';
import { isSessionSuperAdmin } from '@/lib/superAdminAuth';
import RolesMatrixClient from '@/app/dashboard/settings/roles/RolesMatrixClient';

export default async function AdminPanelRolesPage() {
    if (!(await isSessionSuperAdmin())) {
        redirect('/dashboard');
    }

    return (
        <div className="[&_.bg-white]:bg-white/95 [&_h1]:text-white [&_h2]:text-white [&_p.text-fm-muted]:text-white/60">
            <RolesMatrixClient />
        </div>
    );
}
