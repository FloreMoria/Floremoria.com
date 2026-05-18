import Link from 'next/link';
import { Shield, Users, LayoutDashboard, KeyRound, FileText } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function AdminPanelHomePage() {
    return (
        <div className="space-y-10">
            <div className="space-y-3">
                <p className="text-fm-gold text-xs font-bold uppercase tracking-[0.2em]">Security-First</p>
                <h1 className="text-3xl sm:text-4xl font-display font-semibold tracking-tight">
                    Pannello Super Admin
                </h1>
                <p className="text-white/65 font-body max-w-2xl leading-relaxed">
                    Area riservata su <strong className="text-white/90">www.floremoria.com</strong> — nessun
                    sottodominio richiesto. La promozione a Super Admin avviene solo tramite{' '}
                    <code className="text-fm-gold/90 bg-white/5 px-1.5 py-0.5 rounded text-sm">npm run master-key</code>{' '}
                    in locale.
                </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Link
                    href="/admin-panel/roles"
                    className="group rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/10 hover:border-fm-gold/30 transition-all flex flex-col"
                >
                    <Users className="w-8 h-8 text-fm-gold mb-4" />
                    <h2 className="text-lg font-display font-semibold mb-2">Ruoli & accessi admin</h2>
                    <p className="text-sm text-white/55">
                        Matrice permessi e assegnazione TTL collaboratori. Il ruolo SUPER_ADMIN non è selezionabile
                        dall&apos;interfaccia.
                    </p>
                </Link>

                <Link
                    href="/dashboard/orders"
                    className="group rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/10 hover:border-fm-gold/30 transition-all flex flex-col"
                >
                    <LayoutDashboard className="w-8 h-8 text-fm-gold mb-4" />
                    <h2 className="text-lg font-display font-semibold mb-2">Operatività ordini</h2>
                    <p className="text-sm text-white/55">Vai alla dashboard operativa (ordini, fioristi, catalogo).</p>
                </Link>
                
                <a
                    href={process.env.NEXT_PUBLIC_YOUDOX_URL || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/10 hover:border-fm-gold/30 transition-all flex flex-col"
                >
                    <FileText className="w-8 h-8 text-fm-gold mb-4" />
                    <h2 className="text-lg font-display font-semibold mb-2">Fatture (YouDOX)</h2>
                    <p className="text-sm text-white/55">Portale di fatturazione elettronica per il monitoraggio del ciclo attivo e passivo aziendale.</p>
                </a>
            </div>

            <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 flex gap-4">
                <KeyRound className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm text-white/70 space-y-2">
                    <p className="font-semibold text-amber-200/90">Promozione Super Admin (solo terminale)</p>
                    <pre className="text-xs bg-black/30 rounded-lg p-3 overflow-x-auto text-white/80">
                        {`npm run master-key -- tuo@email.it "$SUPER_ADMIN_SETUP_TOKEN"`}
                    </pre>
                    <p>
                        Poi accedi con la stessa email e <code className="text-fm-gold">SUPER_ADMIN_LOGIN_PASSWORD</code>{' '}
                        su <Link href="/login" className="text-fm-gold underline">/login</Link>.
                    </p>
                </div>
            </section>

            <p className="text-xs text-white/40 flex items-center gap-2">
                <Shield className="w-3.5 h-3.5" />
                Sessione protetta da middleware + API admin riservate al cookie SUPER_ADMIN.
            </p>
        </div>
    );
}
