/** Ruoli con visibilità globale su tutti gli ordini della dashboard (no filtro partner). */
export const GLOBAL_ORDERS_VIEW_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] as const;

export type GlobalOrdersViewRole = (typeof GLOBAL_ORDERS_VIEW_ROLES)[number];

export function hasGlobalOrdersView(roleName: string | undefined | null): boolean {
    if (!roleName) return false;
    return (GLOBAL_ORDERS_VIEW_ROLES as readonly string[]).includes(roleName);
}

/** Ruoli che possono modificare lo stato ordine in dashboard. */
export const ORDER_STATUS_EDIT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] as const;

export function canEditOrderStatus(roleName: string | undefined | null): boolean {
    if (!roleName) return false;
    return (ORDER_STATUS_EDIT_ROLES as readonly string[]).includes(roleName);
}
