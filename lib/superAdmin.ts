/** Nome ruolo cookie / tabella Role per il Super Admin di sistema. */
export const SUPER_ADMIN_ROLE_NAME = 'SUPER_ADMIN' as const;

export function isSuperAdminRole(role: string | undefined | null): boolean {
    return role === SUPER_ADMIN_ROLE_NAME;
}

/** Blocca qualsiasi assegnazione web del ruolo Super Admin (solo script offline). */
export function isBlockedSuperAdminAssignment(roleName: string | undefined | null): boolean {
    return roleName?.trim().toUpperCase() === SUPER_ADMIN_ROLE_NAME;
}

export const SUPER_ADMIN_PERMISSIONS = { ALL_PRIVILEGES_GRANTED: true } as const;
