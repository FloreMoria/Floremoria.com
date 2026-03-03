'use client';
import React from 'react';
import { PermissionKey, hasPermission } from '@/lib/rbac';

interface ProtectProps {
    permission: PermissionKey;
    children: React.ReactNode;
    fallback?: React.ReactNode;
    disabledState?: boolean; // Se true, inietta 'disabled' nel figlio invece di nasconderlo (utile per i button)
}

/**
 * RBAC Component (Role-Based Access Control)
 * Usa questo wrapper per nascondere o disabilitare pezzi di UI (Hiding Components)
 * in assenza dei permessi incrociati sul database.
 */
export default function Protect({ permission, children, fallback = null, disabledState = false }: ProtectProps) {
    // TODO: Recuperare i permessi reali dall'Auth Provider (es. Session Context) o da un token
    // Questo è un Mock temporaneo. Logica: se 'hasAccess' è false, blocchiamo.
    const mockUserPermissions = { 'view_orders': true, 'change_status': false };
    const mockIsSuperAdmin = true; // In development forziamo true per il login 'admin'

    const hasAccess = mockIsSuperAdmin || hasPermission(mockUserPermissions, permission);

    if (!hasAccess) {
        if (disabledState && React.isValidElement(children)) {
            // Selezioniamo il primo figlio e gli cloniamo la prop disabled, per fargli applicare CSS "cursor-not-allowed opacity-50"
            return React.cloneElement(children as React.ReactElement<any>, {
                disabled: true,
                className: `${((children as React.ReactElement<any>).props.className as string) || ''} opacity-50 cursor-not-allowed pointer-events-none`.trim(),
                title: 'Non hai i permessi necessari (RBAC)'
            });
        }
        return <>{fallback}</>;
    }

    return <>{children}</>;
}
