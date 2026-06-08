/** Nome ruolo cookie / tabella Role per il Super Admin di sistema. */
export const SUPER_ADMIN_ROLE_NAME = 'SUPER_ADMIN' as const;

/** Nome ruolo cookie per l'Amministratore gestionale (senza accesso a Ruoli). */
export const ADMIN_ROLE_NAME = 'ADMIN' as const;

/** Landing post-login per ciascun livello di elevazione. */
export const ADMIN_POST_LOGIN_REDIRECT = '/dashboard' as const;
export const SUPER_ADMIN_POST_LOGIN_REDIRECT = '/dashboard/settings/roles' as const;

export function isSuperAdminRole(role: string | undefined | null): boolean {
    return role === SUPER_ADMIN_ROLE_NAME;
}

export function isAdminRole(role: string | undefined | null): boolean {
    return role === ADMIN_ROLE_NAME;
}

/** ADMIN o SUPER_ADMIN: accesso bacheca staff, ma Ruoli resta solo SUPER_ADMIN. */
export function isDashboardAdminRole(role: string | undefined | null): boolean {
    return isAdminRole(role) || isSuperAdminRole(role);
}

/** Blocca qualsiasi assegnazione web del ruolo Super Admin (solo script offline). */
export function isBlockedSuperAdminAssignment(roleName: string | undefined | null): boolean {
    return roleName?.trim().toUpperCase() === SUPER_ADMIN_ROLE_NAME;
}

export const SUPER_ADMIN_PERMISSIONS = { ALL_PRIVILEGES_GRANTED: true } as const;
