'use client';

/**
 * /admin-panel/whatsapp-setup
 * Dashboard configurazione WhatsApp — iPhone 12 FloreMoria.
 *
 * Funzionalità:
 *  - Badge stato connessione istanza Evolution API (verde=open, giallo=connecting, rosso=close)
 *  - QR Code per collegare il numero +39 320 410 5305
 *  - Pulsante ricarica QR / aggiornamento stato
 *  - Istruzioni passo-passo per la scansione
 *
 * Accesso: solo SUPER_ADMIN (il layout /admin-panel/layout.tsx già fa il redirect).
 */

import { useState, useEffect, useCallback } from 'react';
import { Smartphone, Wifi, WifiOff, RefreshCw, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

type InstanceState = 'open' | 'connecting' | 'close' | 'refused' | null;

interface StatusResponse {
    ok: boolean;
    state?: InstanceState;
    error?: string;
}

interface QrResponse {
    ok: boolean;
    state?: InstanceState;
    qrCodeBase64?: string;
    message?: string;
    error?: string;
}

const STATE_CONFIG: Record<
    NonNullable<InstanceState>,
    { label: string; color: string; bg: string; border: string; Icon: typeof Wifi }
> = {
    open: {
        label: '✅ Connesso',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        Icon: CheckCircle2,
    },
    connecting: {
        label: '⏳ In connessione…',
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        Icon: Clock,
    },
    close: {
        label: '🔴 Disconnesso',
        color: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        Icon: WifiOff,
    },
    refused: {
        label: '⛔ Connessione rifiutata',
        color: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        Icon: AlertTriangle,
    },
};

export default function WhatsAppSetupPage() {
    const [state, setState] = useState<InstanceState>(null);
    const [qrBase64, setQrBase64] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [statusLoading, setStatusLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // ── Fetch stato ──────────────────────────────────────────────────────────
    const fetchStatus = useCallback(async (silent = false) => {
        if (!silent) setStatusLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/whatsapp/status');
            const data: StatusResponse = await res.json();
            if (data.ok && data.state) {
                setState(data.state);
            } else {
                setError(data.error ?? 'Errore nel recupero stato');
            }
            setLastUpdated(new Date());
        } catch {
            setError('Impossibile contattare il server Evolution API');
        } finally {
            setStatusLoading(false);
        }
    }, []);

    // ── Fetch QR Code ────────────────────────────────────────────────────────
    const fetchQr = useCallback(async () => {
        setLoading(true);
        setError(null);
        setQrBase64(null);
        try {
            const res = await fetch('/api/admin/whatsapp/qr');
            const data: QrResponse = await res.json();
            if (!data.ok) {
                setError(data.error ?? 'Impossibile generare QR code');
                return;
            }
            if (data.state === 'open') {
                setState('open');
                setQrBase64(null);
                return;
            }
            if (data.qrCodeBase64) {
                setQrBase64(data.qrCodeBase64);
                setState(data.state ?? 'connecting');
            } else {
                setError('QR code non disponibile. Verifica che Evolution API sia in esecuzione.');
            }
            setLastUpdated(new Date());
        } catch {
            setError('Errore di rete nel recupero del QR code');
        } finally {
            setLoading(false);
        }
    }, []);

    // ── Auto-refresh stato ogni 30s ──────────────────────────────────────────
    useEffect(() => {
        fetchStatus();
        const interval = setInterval(() => fetchStatus(true), 30_000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    // ── Derive ───────────────────────────────────────────────────────────────
    const stateConfig = state ? STATE_CONFIG[state] : null;
    const isConnected = state === 'open';

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            {/* ── Header ── */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/15 border border-green-500/25 flex items-center justify-center">
                    <Smartphone className="w-5 h-5 text-green-400" />
                </div>
                <div>
                    <h1 className="text-xl font-semibold text-white">WhatsApp Setup — iPhone 12</h1>
                    <p className="text-sm text-white/50">
                        Numero FloreMoria: <span className="text-white/80 font-mono">+39 320 410 5305</span>
                    </p>
                </div>
            </div>

            {/* ── Stato connessione ── */}
            <section className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-white/90">Stato istanza Evolution API</h2>
                    <button
                        id="btn-refresh-status"
                        onClick={() => fetchStatus()}
                        disabled={statusLoading}
                        className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors disabled:opacity-40"
                        aria-label="Aggiorna stato"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${statusLoading ? 'animate-spin' : ''}`} />
                        Aggiorna
                    </button>
                </div>

                {stateConfig ? (
                    <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${stateConfig.bg} ${stateConfig.border}`}>
                        <stateConfig.Icon className={`w-5 h-5 ${stateConfig.color} shrink-0`} />
                        <span className={`font-medium ${stateConfig.color}`}>{stateConfig.label}</span>
                        {lastUpdated && (
                            <span className="ml-auto text-xs text-white/30">
                                {lastUpdated.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        )}
                    </div>
                ) : statusLoading ? (
                    <div className="flex items-center gap-3 rounded-xl px-4 py-3 border border-white/10 bg-white/5">
                        <div className="w-2 h-2 rounded-full bg-white/30 animate-pulse" />
                        <span className="text-sm text-white/40">Recupero stato…</span>
                    </div>
                ) : null}

                {error && (
                    <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 border border-red-500/25 bg-red-500/10">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-400">{error}</p>
                    </div>
                )}

                {isConnected && (
                    <div className="flex items-center gap-2 text-sm text-emerald-400/80 mt-1">
                        <Wifi className="w-4 h-4" />
                        <span>VERA è attiva e risponde ai messaggi WhatsApp in entrata.</span>
                    </div>
                )}
            </section>

            {/* ── QR Code ── */}
            {!isConnected && (
                <section className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-semibold text-white/90">Collega iPhone 12</h2>
                    </div>

                    {/* Istruzioni */}
                    <ol className="space-y-2 text-sm text-white/60">
                        {[
                            'Apri WhatsApp sull\'iPhone 12 con il numero +39 320 410 5305',
                            'Vai in Impostazioni → Dispositivi collegati → Collega un dispositivo',
                            'Clicca "Genera QR Code" qui sotto',
                            'Inquadra il QR code con la fotocamera dell\'iPhone',
                        ].map((step, i) => (
                            <li key={i} className="flex items-start gap-3">
                                <span className="w-5 h-5 rounded-full bg-green-500/20 text-green-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                                    {i + 1}
                                </span>
                                <span>{step}</span>
                            </li>
                        ))}
                    </ol>

                    {/* QR Code display */}
                    <div className="flex flex-col items-center gap-4">
                        {qrBase64 ? (
                            <div className="rounded-2xl bg-white p-4 shadow-2xl shadow-black/40">
                                {/* Il QR base64 può arrivare con o senza il prefisso data:image */}
                                <img
                                    id="qr-code-image"
                                    src={
                                        qrBase64.startsWith('data:')
                                            ? qrBase64
                                            : `data:image/png;base64,${qrBase64}`
                                    }
                                    alt="QR Code per collegare WhatsApp all'iPhone 12 di FloreMoria"
                                    className="w-64 h-64 object-contain"
                                    width={256}
                                    height={256}
                                />
                            </div>
                        ) : (
                            <div className="w-64 h-64 rounded-2xl border-2 border-dashed border-white/15 flex items-center justify-center">
                                <p className="text-sm text-white/30 text-center px-4">
                                    Clicca il pulsante per generare il QR code
                                </p>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                id="btn-generate-qr"
                                onClick={fetchQr}
                                disabled={loading}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                        Generazione…
                                    </>
                                ) : (
                                    <>
                                        <Smartphone className="w-4 h-4" />
                                        {qrBase64 ? 'Rigenera QR Code' : 'Genera QR Code'}
                                    </>
                                )}
                            </button>
                        </div>

                        {qrBase64 && (
                            <p className="text-xs text-white/30 text-center max-w-xs">
                                Il QR code scade in circa 60 secondi. Se scade, clicca &quot;Rigenera QR Code&quot;.
                            </p>
                        )}
                    </div>
                </section>
            )}

            {/* ── Info di configurazione ── */}
            <section className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
                <h2 className="text-base font-semibold text-white/90">Configurazione richiesta</h2>
                <div className="space-y-2 font-mono text-xs">
                    {[
                        ['EVOLUTION_API_BASE_URL', 'URL del server Evolution API (es. https://api.tuo-server.com)'],
                        ['EVOLUTION_API_KEY', 'API Key del server Evolution'],
                        ['EVOLUTION_INSTANCE_NAME', 'Nome istanza (default: floremoria)'],
                        ['WHATSAPP_WEBHOOK_SECRET', 'Token segreto per verificare i webhook in entrata'],
                        ['GEMINI_API_KEY', 'API Key Google Gemini (già presente)'],
                    ].map(([key, desc]) => (
                        <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                            <span className="text-green-400 whitespace-nowrap">{key}</span>
                            <span className="text-white/30 text-xs normal-case font-sans">{desc}</span>
                        </div>
                    ))}
                </div>
                <p className="text-xs text-white/30">
                    Imposta queste variabili in <code className="text-white/50">.env.local</code> (sviluppo) e su Vercel → Project Settings → Environment Variables (produzione).
                </p>
            </section>
        </div>
    );
}
