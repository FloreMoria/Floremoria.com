'use client';

import React, { useState, useEffect } from 'react';
import { PERMISSION_MATRIX } from '@/lib/rbac';
import { Shield, Plus, Lock, Users, Save, Check } from 'lucide-react';

interface Role {
    id: string;
    name: string;
    isSystem: boolean;
    permissions: Record<string, boolean>;
}

export default function RolesMatrixPage() {
    const [roles, setRoles] = useState<Role[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newRoleName, setNewRoleName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState('');

    // Esempio MOCK di Utenti (in vera produzione verrebbe da Prisma)
    const [users] = useState([
        { id: '1', name: 'Giulia Sartori', email: 'giulia@fiorista-como.it', roleId: '' },
        { id: '2', name: 'Marco Copy', email: 'marco@marketing.it', roleId: '' },
        { id: '3', name: 'Mario Rossi', email: 'cliente@email.com', roleId: '' },
    ]);

    useEffect(() => {
        fetchRoles();
    }, []);

    const fetchRoles = async () => {
        try {
            const res = await fetch('/api/admin/roles');
            if (res.ok) {
                const data = await res.json();
                setRoles(data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateRole = async (e: React.FormEvent) => {
        e.preventDefault();
        const roleName = newRoleName.trim();
        if (!roleName) return;

        setIsSaving(true);
        try {
            const res = await fetch('/api/admin/roles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: roleName, permissions: {} }),
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Errore durante la creazione del ruolo.');
            }
            const newRole = await res.json();
            setRoles([...roles, newRole]);
            setNewRoleName('');
            setSaveSuccess(`Ruolo "${roleName}" aggiunto.`);
            setTimeout(() => setSaveSuccess(''), 3000);
        } catch (error: any) {
            console.error('Errore creazione ruolo', error);
            alert(error.message || 'Errore creazione ruolo');
        } finally {
            setIsSaving(false);
        }
    };

    const togglePermission = async (roleId: string, permKey: string) => {
        const roleIndex = roles.findIndex(r => r.id === roleId);
        if (roleIndex === -1) return;

        const role = roles[roleIndex];
        // Protezione extra lato client UI logic (Super Admin always has everything implicit or explicit)
        if (role.isSystem && role.name === 'SUPER_ADMIN') {
            return;
        }

        const newPerms = { ...role.permissions, [permKey]: !role.permissions[permKey] };

        // Optimistic UI Update
        const newRoles = [...roles];
        newRoles[roleIndex] = { ...role, permissions: newPerms };
        setRoles(newRoles);

        setIsSaving(true);
        try {
            const res = await fetch('/api/admin/roles', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: roleId, permissions: newPerms }),
            });
            if (!res.ok) throw new Error('Network response non valida.');
            setSaveSuccess('Permessi aggiornati con successo');
            setTimeout(() => setSaveSuccess(''), 3000);
        } catch (err) {
            console.error('Failed to update permission', err);
            // Rollback optimistic update
            setRoles(roles);
            alert('Fallimento durante l\'aggiornamento del permesso. Riprova.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div className="p-10 flex justify-center items-center"><div className="animate-pulse w-8 h-8 rounded-full border-2 border-fm-gold border-t-transparent animate-spin" /></div>;

    return (
        <div className="max-w-7xl mx-auto space-y-12 pb-16">

            {/* INTESTAZIONE */}
            <div className="flex flex-col md:flex-row justify-between md:items-end gap-6 pb-6 border-b border-gray-100">
                <div className="space-y-2">
                    <h1 className="text-3xl font-display font-semibold text-gray-900 flex items-center gap-3">
                        <Shield className="text-fm-gold" size={32} />
                        Gestione Ruoli & Permessi
                    </h1>
                    <p className="text-fm-muted font-body text-lg">
                        Stabilisci i livelli di accesso (RBAC) per i partner e i membri del team sulla Dashboard.
                    </p>
                </div>

                <form onSubmit={handleCreateRole} className="flex items-center space-x-3 bg-white p-2 rounded-xl border border-gray-200 shadow-sm w-full md:w-auto">
                    <input
                        type="text"
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        placeholder="Nome Nuovo Ruolo"
                        className="flex-1 bg-transparent border-none outline-none font-body px-3 text-sm focus:ring-0 text-gray-800"
                    />
                    <button
                        type="submit"
                        disabled={!newRoleName.trim() || isSaving}
                        className="bg-fm-gold hover:bg-yellow-600 text-white p-2 rounded-lg transition-colors flex:shrink-0 disabled:opacity-50"
                    >
                        <Plus size={18} />
                    </button>
                </form>
            </div>

            {/* MESSAGE ALERT & LOADING */}
            <div className="min-h-[48px] flex items-center">
                {isSaving && !saveSuccess && (
                    <div className="text-sm font-medium text-fm-gold flex items-center gap-2 animate-pulse">
                        <div className="w-4 h-4 border-2 border-fm-gold border-t-transparent rounded-full animate-spin"></div>
                        Sincronizzazione sicurezza in corso...
                    </div>
                )}
                {saveSuccess && (
                    <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl flex items-center gap-3 border border-emerald-100 animate-fade-in-down shadow-sm">
                        <Check size={18} /> <span className="font-medium text-sm">{saveSuccess}</span>
                    </div>
                )}
            </div>

            {/* MATRICE DEI PERMESSI - Tabellone Orizzontale Scrollabile */}
            <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 overflow-hidden relative">
                <div className="overflow-x-auto w-full">
                    <table className="w-full text-left font-body">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100">
                                <th className="p-6 sticky left-0 bg-gray-50 z-10 w-64 uppercase tracking-wider text-xs font-semibold text-gray-400">
                                    Funzionalità & Macro-Aree
                                </th>
                                {roles.map(role => (
                                    <th key={role.id} className="p-6 text-center border-l border-gray-50 min-w-[160px]">
                                        <div className="flex flex-col items-center gap-1.5">
                                            {role.isSystem ? <Lock size={14} className="text-fm-rose/70" /> : <Shield size={14} className="text-fm-gold/60" />}
                                            <span className="font-display font-semibold text-gray-800 tracking-tight text-[15px]">{role.name}</span>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {Object.entries(PERMISSION_MATRIX).map(([area, permissions]) => (
                                <React.Fragment key={area}>
                                    {/* Intestazione Macro-Area */}
                                    <tr className="bg-gray-50/20">
                                        <td colSpan={roles.length + 1} className="p-4 font-semibold text-[13px] tracking-widest text-fm-gold uppercase">
                                            {area}
                                        </td>
                                    </tr>

                                    {/* Righe dei Permessi Specifici */}
                                    {permissions.map((perm) => (
                                        <tr key={perm.key} className="hover:bg-gray-50/30 transition-colors">
                                            <td className="p-5 pl-8 sticky left-0 bg-white border-r border-gray-50 w-64">
                                                <span className="text-sm text-gray-700 font-medium">{perm.label}</span>
                                            </td>

                                            {roles.map(role => {
                                                const hasAccess = role.permissions[perm.key] || (role.isSystem && role.name === 'SUPER_ADMIN');
                                                const toggleDisabled = role.name === 'SUPER_ADMIN';

                                                return (
                                                    <td key={role.id} className="p-5 border-l border-gray-50 text-center relative">
                                                        {toggleDisabled ? (
                                                            <div className="inline-flex items-center justify-center w-11 h-6 bg-gray-100 rounded-full border border-gray-200" title="Controllo esclusivo di sistema (Sempre Attivo)">
                                                                <Lock size={12} className="text-gray-400" />
                                                            </div>
                                                        ) : (
                                                            <button
                                                                disabled={isSaving}
                                                                onClick={() => togglePermission(role.id, perm.key)}
                                                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isSaving ? 'opacity-50 cursor-wait' : ''} ${hasAccess ? 'bg-fm-gold' : 'bg-gray-200'}`}
                                                                role="switch"
                                                                aria-checked={hasAccess}
                                                            >
                                                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${hasAccess ? 'translate-x-5' : 'translate-x-0'}`} />
                                                            </button>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* SEZIONE: ASSEGNAZIONE UTENTI RAPIDA (TTL) */}
            <div className="bg-white/60 backdrop-blur-xl border border-gray-100 rounded-[24px] p-8 lg:p-10 shadow-sm mt-12 w-full max-w-4xl">
                <div className="flex items-center gap-3 mb-8">
                    <Users className="text-fm-gold" size={24} />
                    <h2 className="text-2xl font-display font-semibold text-gray-900 tracking-tight">
                        Assegnazione Utenti Rapida (Accesso TTL)
                    </h2>
                </div>

                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="col-span-1 md:col-span-1">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Email Utente</label>
                            <input
                                id="assignEmail"
                                type="email"
                                placeholder="collaboratore@email.com"
                                className="w-full bg-white border border-gray-200 text-gray-800 font-body text-sm rounded-xl focus:ring-2 focus:ring-fm-gold focus:border-fm-gold block p-3 outline-none transition-all shadow-sm"
                            />
                        </div>
                        <div className="col-span-1 md:col-span-1">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Seleziona Ruolo</label>
                            <select
                                id="assignRole"
                                className="w-full bg-white border border-gray-200 text-gray-800 font-body text-sm rounded-xl focus:ring-2 focus:ring-fm-gold focus:border-fm-gold block p-3 outline-none transition-all shadow-sm"
                                defaultValue=""
                            >
                                <option value="" disabled>Scegli il livello...</option>
                                {roles.map(r => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="col-span-1 md:col-span-1">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Durata (TTL)</label>
                            <select
                                id="assignDuration"
                                className="w-full bg-white border border-gray-200 text-gray-800 font-body text-sm rounded-xl focus:ring-2 focus:ring-fm-gold focus:border-fm-gold block p-3 outline-none transition-all shadow-sm"
                                defaultValue="60"
                            >
                                <option value="10">10 Minuti</option>
                                <option value="60">1 Ora</option>
                                <option value="1440">1 Giorno</option>
                                <option value="10080">1 Settimana</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="mt-8 flex justify-end">
                    <button
                        onClick={async () => {
                            const email = (document.getElementById('assignEmail') as HTMLInputElement).value;
                            const roleId = (document.getElementById('assignRole') as HTMLSelectElement).value;
                            const durationMins = parseInt((document.getElementById('assignDuration') as HTMLSelectElement).value);

                            if (!email || !roleId) {
                                alert("Compila email e seleziona il ruolo.");
                                return;
                            }

                            setIsSaving(true);
                            try {
                                const res = await fetch('/api/admin/assign-temp-role', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ email, roleId, durationMins })
                                });

                                if (res.ok) {
                                    const data = await res.json();
                                    const expiryTime = new Date(data.expiresAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
                                    setSaveSuccess(`Accesso temporaneo attivato per ${email} fino alle ore ${expiryTime}`);
                                    (document.getElementById('assignEmail') as HTMLInputElement).value = '';
                                    setTimeout(() => setSaveSuccess(''), 5000);
                                } else {
                                    alert("Errore durante l'assegnazione: l'utente non è stato trovato o errore DB.");
                                }
                            } catch (e) {
                                alert("Errore di rete.");
                            } finally {
                                setIsSaving(false);
                            }
                        }}
                        disabled={isSaving}
                        className={`bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold text-sm transition-all shadow-md flex items-center gap-2 ${isSaving ? 'opacity-70 cursor-wait' : ''}`}
                    >
                        {isSaving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Loading...
                            </>
                        ) : (
                            <>
                                <Save size={16} /> Invia Accesso Temporaneo
                            </>
                        )}
                    </button>
                </div>
            </div>

        </div>
    );
}
