// Definizione della gerarchia delle macro-aree (Domain Isolation) e dei singoli privilegi granulari
export const PERMISSION_MATRIX = {
    LOGISTICS: [
        { key: 'view_orders', label: 'Visualizza Ordini' },
        { key: 'change_status', label: 'Cambia Stato / Accetta' },
        { key: 'upload_photos', label: 'Carica Foto Consegna' },
        { key: 'customer_data', label: 'Dati Sensibili Cliente' },
        { key: 'assign_florist', label: 'Assegna Fioristi' },
        { key: 'edit_delivery', label: 'Modifica Posizione Consegna' }
    ],
    CATALOG: [
        { key: 'view_products', label: 'Visualizza Catalogo' },
        { key: 'edit_prices', label: 'Modifica Prezzi' },
        { key: 'stock_management', label: 'Gestione Inventario' }
    ],
    FINANCE: [
        { key: 'invoicing', label: 'Fatturazione & Rimborsi' },
        { key: 'profit_margins', label: 'Visualizza Margini di Profitto' },
        { key: 'company_data', label: 'Dati Aziendali e IBAN' }
    ],
    GROWTH: [
        { key: 'edit_texts', label: 'Modifica Testi / FAQ' },
        { key: 'seo_metadata', label: 'Impostazioni SEO / AEO' },
        { key: 'analytics', label: 'Visualizza Analytics Avanzati' }
    ],
    TECHNICAL: [
        { key: 'error_logs', label: 'Gestione Errori di Sistema' },
        { key: 'database_access', label: 'Gestione Diretta Database' }
    ],
    "ACCOUNT, PRIVACY & FINANZA": [
        { key: 'personal_profile', label: 'Gestisci Profilo e Password' },
        { key: 'partner_finance', label: 'Visualizza Fatturato Partner' },
        { key: 'my_orders', label: 'Visualizza Ordini Assegnati' }
    ]
} as const;

export type MacroArea = keyof typeof PERMISSION_MATRIX;
export type PermissionKey = typeof PERMISSION_MATRIX[MacroArea][number]['key'];

// Preset per creare/ripristinare ruoli base
export const ROOT_ROLES = {
    OPERATORE: {
        name: 'OPERATOR',
        isSystem: true,
        permissions: {
            view_orders: true,
            change_status: true,
            edit_delivery: true,
            assign_florist: true,
            customer_data: true,
            upload_photos: true,
            personal_profile: true
        }
    }
};

// Utility per verificare l'accesso (sia in API Routes che in SSR)
export function hasPermission(userPermissions: Record<string, boolean> | null | undefined, permissionKey: string): boolean {
    if (!userPermissions) return false;
    // SUPER ADMIN bypassa i controlli, se la stringa intera passata è la master key (in scenari complessi)
    if (userPermissions['ALL_PRIVILEGES_GRANTED']) return true;
    return !!userPermissions[permissionKey];
}

