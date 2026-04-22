import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import Image from 'next/image';
import Link from 'next/link';
import { Metadata } from 'next';
import GraveNotesForm from './GraveNotesForm';

interface GiardinoPageProps {
    params: Promise<{
        id: string;
    }>;
}

export async function generateMetadata({ params }: GiardinoPageProps): Promise<Metadata> {
    return {
        title: 'Il Giardino della Memoria | FloreMoria',
        description: 'La tua area privata per ricordare e custodire i ricordi dei tuoi cari.',
        robots: {
            index: false,
            follow: false,
        },
    };
}

export default async function GiardinoPage({ params }: GiardinoPageProps) {
    const resolvedParams = await params;
    const userIdOrCode = resolvedParams.id;

    let user: any = null;

    if (userIdOrCode === 'UT-DEMO') {
        user = {
            id: 'demo-user-123',
            name: 'Mario Rossi',
            uniqueCode: 'UT-DEMO',
            orders: [
                {
                    id: 'ord-1',
                    createdAt: new Date(),
                    deceasedName: 'Giovanna Bianchini',
                    cemeteryCity: 'Bergamo',
                    status: 'COMPLETED',
                    deliveryProof: {
                        status: 'COMPLETED',
                        photoAfterUrl: '/images/products/fiori-sulle-tombe/bouquet-omaggio-speciale/bouquet-omaggio-speciale-fiori-sulle-tombe-servizio-professionale-FT.webp',
                        timestampAfter: new Date()
                    }
                },
                {
                    id: 'ord-2',
                    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                    deceasedName: 'Carlo Rossi',
                    cemeteryCity: 'Milano',
                    status: 'PROCESSING',
                    deliveryProof: null
                }
            ]
        };
    } else {
        // Cerchiamo l'utente sia per uniqueCode (es. UT-LOM-BG-001) sia per ID classico (cuid)
        user = await prisma.user.findFirst({
            where: {
                OR: [
                    { uniqueCode: userIdOrCode },
                    { id: userIdOrCode }
                ]
            },
            include: {
                orders: {
                    include: {
                        deliveryProof: true,
                        items: {
                            include: { product: true }
                        }
                    },
                    orderBy: { createdAt: 'desc' }
                }
            }
        });
    }

    if (!user) {
        notFound();
    }

    return (
        <div className="min-h-screen bg-fm-bg pb-20 pt-28">
            <div className="max-w-4xl mx-auto px-4 lg:px-8">
                {/* Header Emotivo */}
                <header className="text-center mb-16">
                    <h1 className="text-4xl md:text-[56px] font-display font-medium text-fm-text leading-tight mb-4">
                        Il Giardino della Memoria
                    </h1>
                    <p className="text-xl md:text-2xl text-fm-rose font-medium opacity-90">
                        Bentornato, {user.name || 'Caro Cliente'}
                    </p>
                    <p className="mt-4 max-w-2xl mx-auto text-fm-muted text-lg font-body leading-relaxed">
                        Questo è il tuo spazio privato e sicuro. Qui custodiamo la cronologia di tutti i gesti d'affetto che hai dedicato ai tuoi cari nel tempo.
                    </p>
                </header>

                {/* La Frase di Alma & Modulo Aggiornamento */}
                <section className="bg-white rounded-3xl p-8 md:p-12 shadow-sm border border-fm-rose-soft/30 mb-16">
                    <div className="text-center max-w-xl mx-auto mb-8">
                        <span className="inline-block p-4 bg-fm-section rounded-full text-fm-gold mb-6">
                            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
                        </span>
                        <h2 className="text-2xl font-display font-medium text-fm-text italic mb-4">
                            "Aiutaci a trovarlo: ogni dettaglio guida il nostro gesto"
                        </h2>
                        <p className="text-fm-muted font-body leading-relaxed">
                            Se hai informazioni specifiche sulla posizione della tomba (es. fila, lato, numero) o note particolari per i nostri fioristi, puoi aggiornarle qui sotto per le future consegne.
                        </p>
                    </div>
                    
                    <GraveNotesForm userId={user.id} />
                </section>

                {/* La Cronologia Infinita */}
                <section>
                    <h3 className="text-[32px] font-display font-semibold text-fm-text mb-10 flex items-center gap-4">
                        I Tuoi Gesti d'Affetto
                        <div className="flex-1 h-px bg-fm-rose-soft/50"></div>
                    </h3>

                    <div className="space-y-12 relative">
                        {/* Linea verticale cronologia */}
                        <div className="absolute left-[27px] md:left-1/2 top-4 bottom-4 w-px bg-fm-rose-soft/50 md:-translate-x-1/2"></div>
                        
                        {user.orders.map((order, idx) => {
                            const isEven = idx % 2 === 0;
                            const proof = order.deliveryProof;
                            const hasPhoto = proof && proof.status === 'COMPLETED' && proof.photoAfterUrl;

                            return (
                                <div key={order.id} className="relative flex flex-col md:flex-row items-center gap-8 md:gap-0">
                                    {/* Punto nella timeline */}
                                    <div className="absolute left-[16px] md:left-1/2 w-6 h-6 rounded-full bg-fm-gold shadow-md flex items-center justify-center -translate-x-1/2 z-10">
                                        <div className="w-2 h-2 rounded-full bg-white"></div>
                                    </div>

                                    <div className={`w-full md:w-1/2 pl-16 md:pl-0 ${isEven ? 'md:pr-16 md:text-right' : 'md:order-2 md:pl-16 text-left'}`}>
                                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-fm-rose-soft/20 text-left">
                                            <div className="text-sm text-fm-gold font-semibold mb-2">
                                                {new Date(order.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
                                            </div>
                                            <h4 className="text-xl font-display font-medium text-fm-text mb-1">
                                                Per {order.deceasedName}
                                            </h4>
                                            <p className="text-fm-muted text-sm font-body mb-4">
                                                Cimitero di {order.cemeteryCity}
                                            </p>

                                            {hasPhoto ? (
                                                <div className="mt-4">
                                                    <div className="relative h-48 w-full rounded-xl overflow-hidden mb-3">
                                                        <Image 
                                                            src={proof.photoAfterUrl!} 
                                                            alt={`Consegna per ${order.deceasedName}`}
                                                            fill
                                                            className="object-cover transition-transform hover:scale-105 duration-700"
                                                        />
                                                    </div>
                                                    <p className="text-[13px] text-green-700 font-medium flex items-center gap-1">
                                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                                                        Consegna verificata il {proof.timestampAfter ? new Date(proof.timestampAfter).toLocaleDateString('it-IT') : ''}
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="mt-4 flex items-center gap-3 p-4 bg-fm-section/50 rounded-xl">
                                                    <div className="w-10 h-10 rounded-full bg-fm-gold/20 flex items-center justify-center flex-shrink-0">
                                                        <span className="text-fm-gold">⏳</span>
                                                    </div>
                                                    <p className="text-sm text-fm-text/80 leading-snug">
                                                        {order.status === 'COMPLETED' 
                                                            ? 'Consegna effettuata. (Archivio non digitale)' 
                                                            : 'In lavorazione presso il partner locale.'}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {user.orders.length === 0 && (
                            <div className="text-center py-12 bg-white rounded-3xl border border-fm-rose-soft/30">
                                <p className="text-fm-muted font-body mb-6">Il tuo Giardino è ancora in attesa del primo seme.</p>
                                <Link href="/fiori-sulle-tombe" className="inline-block bg-fm-gold text-white font-medium px-8 py-3 rounded-xl shadow-[0_4px_14px_0_rgba(180,150,105,0.39)] hover:bg-yellow-600 transition-colors focus:outline-none">
                                    Esplora il Catalogo
                                </Link>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
