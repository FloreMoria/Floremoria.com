'use client';

/**
 * /admin-panel/whatsapp-setup
 * Stato Meta WhatsApp Cloud API — VERA assistenza clienti.
 * Accesso: SUPER_ADMIN (layout /admin-panel).
 */

import { useState, useEffect, useCallback } from 'react';
import { Smartphone, Wifi, RefreshCw, CheckCircle2, AlertTriangle, Cloud } from 'lucide-react';

type ConnectionState = 'open' | 'not_configured' | 'error' | null;

interface StatusResponse {
    ok: boolean;
    provider?: string;
    state?: ConnectionState;
    displayPhoneNumber?: string;
    error?: string;
    missingEnv?: string[];
}

export default function WhatsAppSetupPage() {
    const [state, setState] = useState<ConnectionState>(null);
    const [displayPhone, setDisplayPhone] = useState<string | null>(null);
    const [missingEnv, setMissingEnv] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const fetchStatus = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/whatsapp/status');
            const data: StatusResponse = await res.json();
            if (data.ok && data.state) {
                setState(data.state);
                setDisplayPhone(data.displayPhoneNumber ?? null);
                setMissingEnv([]);
            } else {
                setState(data.state ?? 'error');
                setError(data.error ?? 'Errore nel recupero stato Meta Cloud API');
                setMissingEnv(data.missingEnv ?? []);
            }
            setLastUpdated(new Date());
        } catch {
            setError('Impossibile contattare Meta WhatsApp Cloud API');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(() => fetchStatus(true), 60_000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    const isConnected = state === 'open';

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/15 border border-green-500/25 flex items-center justify-center">
                    <Cloud className="w-5 h-5 text-green-400" />
                </div>
                <div>
                    <h1 className="text-xl font-semibold text-white">WhatsApp — Meta Cloud API</h1>
                    <p className="text-sm text-white/50">
                        Canale VERA assistenza clienti via API ufficiale Meta
                    </p>
                </div>
            </div>

            <section className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-white/90">Stato connessione</h2>
                    <button
                        onClick={() => fetchStatus()}
                        disabled={loading}
                        className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors disabled:opacity-40"
                        aria-label="Aggiorna stato"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Aggiorna
                    </button>
                </div>

                {loading && !state ? (
                    <div className="flex items-center gap-3 rounded-xl px-4 py-3 border border-white/10 bg-white/5">
                        <div className="w-2 h-2 rounded-full bg-white/30 animate-pulse" />
                        <span className="text-sm text-white/40">Verifica credenziali Meta…</span>
                    </div>
                ) : isConnected ? (
                    <div className="flex items-center gap-3 rounded-xl px-4 py-3 border border-emerald-500/30 bg-emerald-500/10">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                        <div>
                            <span className="font-medium text-emerald-400">Connesso — Meta Cloud API attiva</span>
                            {displayPhone && (
                                <p className="text-sm text-white/50 mt-0.5 font-mono">{displayPhone}</p>
                            )}
                        </div>
                        {lastUpdated && (
                            <span className="ml-auto text-xs text-white/30">
                                {lastUpdated.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center gap-3 rounded-xl px-4 py-3 border border-red-500/30 bg-red-500/10">
                        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                        <span className="font-medium text-red-400">
                            {state === 'not_configured' ? 'Non configurato' : 'Errore connessione'}
                        </span>
                    </div>
                )}

                {error && (
                    <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 border border-red-500/25 bg-red-500/10">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-400">{error}</p>
                    </div>
                )}

                {missingEnv.length > 0 && (
                    <p className="text-xs text-amber-400/90">
                        Variabili mancanti su Vercel: {missingEnv.join(', ')}
                    </p>
                )}

                {isConnected && (
                    <div className="flex items-center gap-2 text-sm text-emerald-400/80">
                        <Wifi className="w-4 h-4" />
                        <span>VERA risponde automaticamente ai messaggi WhatsApp in entrata.</span>
                    </div>
                )}
            </section>

            {!isConnected && (
                <section className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
                    <h2 className="text-base font-semibold text-white/90 flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-green-400" />
                        Configurazione Meta Developer Console
                    </h2>
                    <ol className="space-y-2 text-sm text-white/60 list-decimal list-inside">
                        <li>Crea app Meta Business con prodotto WhatsApp attivo</li>
                        <li>Configura webhook: <code className="text-white/70">https://www.floremoria.com/api/whatsapp/webhook</code></li>
                        <li>Verify token = <code className="text-white/70">WHATSAPP_WEBHOOK_SECRET</code></li>
                        <li>Sottoscrivi il campo <strong className="text-white/80">messages</strong></li>
                        <li>Imposta le variabili Vercel elencate sotto</li>
                    </ol>
                </section>
            )}

            <section className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
                <h2 className="text-base font-semibold text-white/90">Variabili Vercel (produzione)</h2>
                <div className="space-y-2 font-mono text-xs">
                    {[
                        ['WHATSAPP_CLOUD_API_KEY', 'Token permanente Graph API'],
                        ['WHATSAPP_PHONE_NUMBER_ID', 'ID numero WhatsApp Business'],
                        ['WHATSAPP_APP_SECRET', 'App Secret Meta — firma webhook POST'],
                        ['WHATSAPP_WEBHOOK_SECRET', 'Verify token webhook GET (es. FloreMoriaVera2026!)'],
                        ['GEMINI_API_KEY', 'Google Gemini — risposte AI VERA'],
                    ].map(([key, desc]) => (
                        <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                            <span className="text-green-400 whitespace-nowrap">{key}</span>
                            <span className="text-white/30 text-xs normal-case font-sans">{desc}</span>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
