// Definizione della gerarchia delle macro-aree (Domain Isolation) e dei singoli privilegi granulari
export const PERMISSION_MATRIX = {
    MISSION_CONTROL: [
        { key: 'global_analytics', label: 'Metriche & Andamento Globale' },
        { key: 'system_settings', label: 'Impostazioni di Sistema' }
    ],
    GESTIONE_ORDINI: [
        { key: 'view_all_orders', label: 'Visualizza Tutti gli Ordini' },
        { key: 'view_assigned_orders', label: 'Visualizza Solo Propri Ordini (Abbonamenti/Assegnati)' },
        { key: 'edit_order_status', label: 'Modifica Stato Ordini' },
        { key: 'assign_orders', label: 'Assegna Ordini a Partner' },
        { key: 'upload_proofs', label: 'Carica Prove di Consegna' }
    ],
    CATALOGO: [
        { key: 'manage_global_catalog', label: 'Gestione Catalogo Globale (Admin)' },
        { key: 'manage_own_inventory', label: 'Gestione Proprio Inventario' }
    ],
    ANAGRAFICHE: [
        { key: 'manage_users', label: 'Gestione Utenti e Partner' },
        { key: 'view_customer_data', label: 'Visualizza Dati Sensibili Clienti' },
        { key: 'view_cemetery_data', label: 'Accesso Info Cimiteriali' },
        { key: 'manage_own_profile', label: 'Gestisci Proprio Profilo e Password' }
    ],
    FINANZA: [
        { key: 'view_global_finance', label: 'Visualizza Finanza Globale & Margini' },
        { key: 'export_fiscal_data', label: 'Export Dati Fiscali (Commercialista)' },
        { key: 'view_own_finance', label: 'Visualizza Propri Guadagni' }
    ]
} as const;

export type MacroArea = keyof typeof PERMISSION_MATRIX;
export type PermissionKey = typeof PERMISSION_MATRIX[MacroArea][number]['key'];

// Preset per creare/ripristinare ruoli base
export const ROOT_ROLES = {
    ADMIN: {
        name: 'ADMIN',
        isSystem: true,
        permissions: {
            global_analytics: true,
            system_settings: true,
            view_all_orders: true,
            edit_order_status: true,
            assign_orders: true,
            upload_proofs: true,
            manage_global_catalog: true,
            manage_users: true,
            view_customer_data: true,
            manage_own_profile: true,
            view_global_finance: true,
            export_fiscal_data: true
        }
    },
    STAKEHOLDER: {
        name: 'STAKEHOLDER', // Soci / Developer
        isSystem: true,
        permissions: {
            global_analytics: true,
            view_all_orders: true,
            manage_own_profile: true,
            view_global_finance: true
        }
    },
    ACCOUNTANT: {
        name: 'ACCOUNTANT',
        isSystem: true,
        permissions: {
            export_fiscal_data: true,
            manage_own_profile: true,
            view_all_orders: true
        }
    },
    OPERATOR: {
        name: 'OPERATOR',
        isSystem: true,
        permissions: {
            view_all_orders: true,
            edit_order_status: true,
            assign_orders: true,
            upload_proofs: true,
            manage_global_catalog: true,
            manage_own_profile: true,
            view_customer_data: true
        }
    },
    FLORIST: {
        name: 'FLORIST',
        isSystem: true,
        permissions: {
            view_assigned_orders: true,
            edit_order_status: true,
            upload_proofs: true,
            manage_own_inventory: true,
            manage_own_profile: true,
            view_own_finance: true
        }
    },
    AGENCY: {
        name: 'AGENCY',
        isSystem: true,
        permissions: {
            view_assigned_orders: true,
            upload_proofs: true,
            manage_own_profile: true,
            view_own_finance: true
        }
    },
    MUNICIPALITY: {
        name: 'MUNICIPALITY', // Comuni
        isSystem: true,
        permissions: {
            view_cemetery_data: true,
            view_assigned_orders: true, // Abbonamenti
            manage_own_profile: true
        }
    },
    USER: {
        name: 'USER',
        isSystem: true,
        permissions: {
            view_assigned_orders: true,
            manage_own_profile: true
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

