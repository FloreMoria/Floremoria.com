import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { 
    Clock, CheckCircle, Calendar, MapPin, 
    Share2, Download, LogOut, Heart, Activity, Image as ImageIcon
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Bacheca Personale | FloreMoria',
};

// Funzione di utility per calcolare il badge dello stato dell'ordine
function getStatusLabel(status: string) {
    switch (status) {
        case 'PENDING':
        case 'ACCEPTED':
            return { text: 'Ordine Ricevuto', color: 'bg-blue-50 text-blue-700 border-blue-100', step: 1 };
        case 'IN_PROGRESS':
        case 'DELIVERING':
            return { text: 'In Preparazione', color: 'bg-amber-50 text-amber-700 border-amber-100', step: 2 };
        case 'COMPLETED':
            return { text: 'Consegnato', color: 'bg-emerald-50 text-emerald-700 border-emerald-100', step: 3 };
        case 'CANCELLED':
            return { text: 'Annullato', color: 'bg-slate-100 text-slate-600 border-slate-200', step: 0 };
        default:
            return { text: status, color: 'bg-slate-50 text-slate-600 border-slate-100', step: 1 };
    }
}

export default async function UserDashboardPage() {
    const cookieStore = await cookies();
    const userRole = cookieStore.get('fm_user_role')?.value;
    const userEmail = cookieStore.get('fm_user_email')?.value;

    // Controllo permessi Middleware spec
    if (!userRole || userRole !== UserRole.USER || !userEmail) {
        redirect('/login?expired=1');
    }

    // Carica l'utente da database
    const user = await prisma.user.findUnique({
        where: { email: userEmail },
    });

    if (!user) {
        redirect('/login?error=user_not_found');
    }

    // WOW FACTOR: Associazione automatica retroattiva degli ordini storici.
    // Trova tutti gli ordini completati/pendenti con questa email che non hanno ancora un userId associato.
    try {
        await prisma.order.updateMany({
            where: {
                buyerEmail: userEmail,
                userId: null,
            },
            data: {
                userId: user.id,
            },
        });
    } catch (e) {
        console.error('[dashboard-user] Errore associazione retroattiva ordini:', e);
    }

    // Carica lo storico ordini dell'utente inclusi gli articoli e le prove di consegna
    const orders = await prisma.order.findMany({
        where: { userId: user.id },
        include: {
            items: {
                include: {
                    product: true,
                },
            },
            deliveryProof: true,
        },
        orderBy: {
            createdAt: 'desc',
        },
    });

    return (
        <div className="min-h-screen bg-[#FAF9F6] text-[#1e293b]">
            {/* Header d'élite */}
            <header className="bg-[#0f172a] text-white border-b-3 border-[#c5a880] py-6 px-4 sm:px-6 lg:px-8 sticky top-0 z-40 shadow-sm">
                <div className="max-w-5xl mx-auto flex justify-between items-center">
                    <div>
                        <div className="text-xl font-display font-medium text-white tracking-widest uppercase">
                            FloreMoria
                        </div>
                        <p className="text-[10px] uppercase tracking-wider text-[#c5a880] font-semibold mt-0.5">
                            Spazio Riservato Utente
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="hidden sm:inline text-xs text-slate-300 font-mono">
                            {user.email}
                        </span>
                        
                        {/* Logout semplice ed elegante (rimuove i cookie e reindirizza a /login) */}
                        <Link
                            href="/api/auth/logout" // Assumiamo che ci sia un logout handler, o usiamo un bottone client. Per sicurezza creiamo una rotta di logout.
                            className="inline-flex items-center gap-1 px-3.5 py-1.5 border border-slate-700 hover:border-[#c5a880] hover:text-[#c5a880] rounded-xl text-xs font-semibold transition-all text-slate-300"
                        >
                            <LogOut size={13} />
                            Esci
                        </Link>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto py-10 px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in">
                {/* Introduzione utente */}
                <div className="bg-white/80 backdrop-blur-xl border border-white/60 p-6 sm:p-8 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            Gentile {user.name || 'Cliente'},
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">
                            In questa pagina può tracciare in tempo reale la posa e lo stato dei Suoi omaggi commemorativi.
                        </p>
                    </div>
                    <div className="bg-[#c5a880]/10 border border-[#c5a880]/20 px-4 py-2.5 rounded-xl inline-flex items-center gap-2">
                        <Heart className="text-[#c5a880]" size={16} />
                        <span className="text-xs font-bold text-[#c5a880] uppercase tracking-wider">
                            {orders.length} {orders.length === 1 ? 'Omaggio' : 'Omaggi'}
                        </span>
                    </div>
                </div>

                {/* Sezione ordini */}
                <div className="space-y-6">
                    <h2 className="text-lg font-bold text-slate-800 tracking-tight">
                        I Suoi Omaggi Floreali
                    </h2>

                    {orders.length === 0 ? (
                        <div className="bg-white/80 border border-slate-200/60 p-12 rounded-[24px] text-center space-y-4">
                            <div className="text-slate-300 text-5xl">❀</div>
                            <h3 className="text-base font-bold text-slate-700">Nessun ordine trovato</h3>
                            <p className="text-sm text-slate-400 max-w-sm mx-auto">
                                Se ha acquistato di recente, il Suo ordine apparirà qui non appena il pagamento sarà confermato.
                            </p>
                            <div className="pt-2">
                                <Link
                                    href="/"
                                    className="inline-block px-5 py-2.5 bg-[#c5a880] hover:bg-[#b59870] text-white text-xs font-bold rounded-xl uppercase tracking-wider"
                                >
                                    Visita il Catalogo
                                </Link>
                            </div>
                        </div>
                    ) : (
                        orders.map((order) => {
                            const status = getStatusLabel(order.status);
                            const isCompleted = order.status === 'COMPLETED';
                            
                            return (
                                <div 
                                    key={order.id}
                                    className="bg-white rounded-[24px] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)] overflow-hidden"
                                >
                                    {/* Intestazione ordine */}
                                    <div className="bg-slate-50/70 border-b border-slate-100 px-6 py-4 flex flex-wrap justify-between items-center gap-4">
                                        <div className="flex items-center gap-3">
                                            <span className="font-mono text-sm font-bold text-slate-900 border border-slate-200 px-2.5 py-1 rounded-lg bg-white shadow-inner">
                                                #{order.orderNumber}
                                            </span>
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${status.color}`}>
                                                {status.text}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                                            <Calendar size={13} />
                                            <span>
                                                {new Date(order.createdAt).toLocaleDateString('it-IT')}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Dettagli corpo */}
                                    <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
                                        {/* Informazioni e Tracking */}
                                        <div className="lg:col-span-7 space-y-6">
                                            {/* Destinatario e Luogo */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">In Memoria di</div>
                                                    <div className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                                                        <Heart size={14} className="text-red-500 fill-red-500" />
                                                        {order.deceasedName}
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Luogo di Consegna</div>
                                                    <div className="text-sm font-semibold text-slate-700 flex items-start gap-1">
                                                        <MapPin size={14} className="text-[#c5a880] mt-0.5 shrink-0" />
                                                        <span>
                                                            {order.cemeteryName} ({order.deliveryProvince})
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Articoli ordinati */}
                                            <div className="border-t border-slate-100 pt-4">
                                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Composizione Floreale</div>
                                                <div className="space-y-2">
                                                    {order.items.map((item) => (
                                                        <div key={item.id} className="flex justify-between items-center text-sm">
                                                            <span className="font-semibold text-slate-700">
                                                                {item.product.name} <span className="text-slate-400 font-normal">x{item.quantity}</span>
                                                            </span>
                                                            <span className="font-mono text-slate-500 font-medium">
                                                                €{(item.priceCents / 100).toFixed(2)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* TRACCIATORE VISIVO (TIMELINE) */}
                                            <div className="border-t border-slate-100 pt-6">
                                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Percorso di Consegna</div>
                                                <div className="relative flex justify-between items-center max-w-md mx-auto py-2">
                                                    {/* Linea di collegamento di sfondo */}
                                                    <div className="absolute left-0 right-0 h-1 bg-slate-100 top-1/2 -translate-y-1/2 -z-10 rounded-full"></div>
                                                    {/* Linea attiva */}
                                                    <div 
                                                        className="absolute left-0 h-1 bg-[#c5a880] top-1/2 -translate-y-1/2 -z-10 rounded-full transition-all duration-500"
                                                        style={{ 
                                                            width: status.step === 1 ? '15%' : status.step === 2 ? '50%' : status.step === 3 ? '100%' : '0%' 
                                                        }}
                                                    ></div>

                                                    {/* Step 1: Ricevuto */}
                                                    <div className="flex flex-col items-center gap-1.5 bg-[#FAF9F6] px-2">
                                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center border text-xs font-bold shadow-sm ${
                                                            status.step >= 1 ? 'bg-[#c5a880] border-[#c5a880] text-white' : 'bg-white border-slate-200 text-slate-400'
                                                        }`}>
                                                            1
                                                        </div>
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ricevuto</span>
                                                    </div>

                                                    {/* Step 2: In Preparazione */}
                                                    <div className="flex flex-col items-center gap-1.5 bg-[#FAF9F6] px-2">
                                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center border text-xs font-bold shadow-sm ${
                                                            status.step >= 2 ? 'bg-[#c5a880] border-[#c5a880] text-white' : 'bg-white border-slate-200 text-slate-400'
                                                        }`}>
                                                            2
                                                        </div>
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Preparazione</span>
                                                    </div>

                                                    {/* Step 3: Consegnato */}
                                                    <div className="flex flex-col items-center gap-1.5 bg-[#FAF9F6] px-2">
                                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center border text-xs font-bold shadow-sm ${
                                                            status.step >= 3 ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-400'
                                                        }`}>
                                                            ✓
                                                        </div>
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Consegnato</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* TESTIMONIANZA FOTOGRAFICA (PROOF OF DELIVERY) */}
                                        <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-l border-slate-100 pt-6 lg:pt-0 lg:pl-8 flex flex-col justify-center">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                                <ImageIcon size={13} /> Testimonianza Fotografica
                                            </div>

                                            {order.deliveryProof && order.deliveryProof.photoAfterUrl ? (
                                                <div className="space-y-4 animate-in fade-in">
                                                    <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50 group">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img 
                                                            src={order.deliveryProof.photoAfterUrl} 
                                                            alt="Foto della posa reale" 
                                                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                        />
                                                    </div>
                                                    
                                                    <div className="flex flex-col sm:flex-row gap-2">
                                                        <a 
                                                            href={order.deliveryProof.photoAfterUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 border border-slate-200 hover:border-[#c5a880] hover:text-[#c5a880] rounded-xl text-xs font-bold transition-colors text-slate-700 bg-white"
                                                        >
                                                            <Download size={13} />
                                                            Vedi / Scarica
                                                        </a>
                                                        <a 
                                                            href={`https://wa.me/?text=${encodeURIComponent(`Ecco la testimonianza fotografica del mio omaggio floreale FloreMoria per ${order.deceasedName}: ${order.deliveryProof.photoAfterUrl}`)}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 border border-emerald-200 hover:bg-emerald-50 text-emerald-600 rounded-xl transition-colors bg-white font-bold text-xs"
                                                            title="Condividi con i tuoi cari"
                                                        >
                                                            <Share2 size={13} />
                                                            Condividi con i tuoi cari
                                                        </a>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="bg-slate-50/70 border border-dashed border-slate-200 p-8 rounded-2xl text-center space-y-2.5">
                                                    <div className="text-slate-300 text-3xl">📷</div>
                                                    <div className="text-xs font-semibold text-slate-500">Foto non ancora disponibile</div>
                                                    <p className="text-[11px] text-slate-400 max-w-[200px] mx-auto leading-relaxed">
                                                        Verrà scattata e caricata sul posto dal fiorista partner al momento della posa.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </main>
        </div>
    );
}
