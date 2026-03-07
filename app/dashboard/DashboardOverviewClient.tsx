'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
    PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area,
    ComposedChart, Line
} from 'recharts';
import { TrendingUp, AlertTriangle, Euro, MapPin, Activity, Star, Users, Briefcase, Moon, Sun, Filter } from 'lucide-react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { scaleLinear } from 'd3-scale';

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'];

// Italy TopoJSON using natural earth data (provincial level map is complex to load here, so using a dot-matrix or simple points for demonstration, or we can use standard points if TopoJSON isn't locally available)
// For assessment sake, we'll map standard Italian provinces coords.
const PROVINCE_COORDS: Record<string, [number, number]> = {
    'RM': [12.4964, 41.9028],
    'MI': [9.1900, 45.4642],
    'NA': [14.2681, 40.8518],
    'TO': [7.6869, 45.0703],
    'PA': [13.3615, 38.1157],
    'GE': [8.9463, 44.4056],
    'BO': [11.3426, 44.4949],
    'FI': [11.2558, 43.7696],
    'BA': [16.8719, 41.1171],
    'CT': [15.0873, 37.5079],
    // Fallback coords
};

export default function DashboardOverviewClient({ initialOrders = [], initialPartners = [], csvData = [], ga4Data = null }: { initialOrders: any[], initialPartners: any[], csvData: any[], ga4Data: any }) {
    const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
    const [darkMode, setDarkMode] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            // setDarkMode(true);
        }
    }, []);

    // Filter by Province logic
    const orders = useMemo(() => {
        if (!selectedProvince) return initialOrders;
        return initialOrders.filter(o => o.deliveryProvince === selectedProvince);
    }, [initialOrders, selectedProvince]);

    const now = new Date();

    // 1. Dati CSV per Calcolo Margini: Creiamo mappa prodotto -> costo. Se non trovato si usa fallback
    const costiFioristaMap = new Map();
    csvData.forEach((row: any) => {
        if (row.Prodotto && row['Compenso Fiorista']) {
            costiFioristaMap.set(row.Prodotto.toLowerCase(), parseFloat(row['Compenso Fiorista']));
        }
    });

    let totalMarginCents = 0;
    let debitoReferralCents = 0;

    orders.forEach(order => {
        let orderMargin = 0;
        const isFF = order.orderNumber?.startsWith('FF');
        const isReferralAnnunci = order.additionalInstructions?.includes('Annuncifunebri');

        order.items?.forEach((item: any) => {
            const prodName = item.product?.name?.toLowerCase() || '';
            const isAccessory = ['lumino', 'biglietto', 'nastro'].some(kw => prodName.includes(kw));
            const baseTotal = item.priceCents * item.quantity;

            if (isAccessory) {
                // Margine pieno: costo fiorista = 0
                orderMargin += baseTotal;
            } else {
                // Look in CSV for wholesale cost
                let costFioristaCents = 0;
                let foundCost = false;
                for (let [key, val] of costiFioristaMap.entries()) {
                    if (prodName.includes(key)) {
                        costFioristaCents = (val * 100) * item.quantity;
                        foundCost = true;
                        break;
                    }
                }
                if (!foundCost) {
                    costFioristaCents = Math.round(baseTotal * 0.65); // Default 65% cost fallback se non presente in CSV
                }
                orderMargin += (baseTotal - costFioristaCents);
            }
        });

        // Togli il 10% del totale ordine (arrotondato per eccesso all'euro) se è referral e FF
        if (isFF && isReferralAnnunci) {
            const referralFee = Math.ceil((order.totalPriceCents * 0.10) / 100) * 100;
            orderMargin -= referralFee;
            debitoReferralCents += referralFee;
        }

        totalMarginCents += orderMargin;
    });

    // Subscriptions
    const activeSubs = initialOrders.filter(o => o.isRecurring && o.status !== 'CANCELLED').length;
    let currentMRR = 0;
    initialOrders.filter(o => o.isRecurring && o.status !== 'CANCELLED').forEach(o => currentMRR += o.totalPriceCents);

    // Alert Logistica
    const alertLimitTime = new Date(now.getTime() + (6 * 60 * 60 * 1000));
    const alertOrders = initialOrders.filter(o => {
        const isPending = o.status !== 'COMPLETED' && o.status !== 'CANCELLED';
        const noPhotos = !o.photos || o.photos.length < 2;
        const deliverSoon = new Date(o.deliveryDate) <= alertLimitTime;
        return isPending && noPhotos && deliverSoon;
    });

    // Geo Map con Bubbles: Somma il fatturato per provincia
    const revPerProv: Record<string, number> = {};
    initialOrders.forEach(o => {
        if (o.deliveryProvince) {
            revPerProv[o.deliveryProvince] = (revPerProv[o.deliveryProvince] || 0) + o.totalPriceCents;
        }
    });

    const maxProvRev = Math.max(1, ...Object.values(revPerProv));
    const sizeScale = scaleLinear().domain([0, maxProvRev]).range([5, 25]);

    const mapMarkers = Object.entries(revPerProv).map(([prov, rev]) => {
        const coords = PROVINCE_COORDS[prov] || [12.5 + (Math.random() * 4 - 2), 42.0 + (Math.random() * 4 - 2)]; // Fallback rand around center italy
        return { prov, rev, coords };
    });

    const bgClass = darkMode ? 'bg-gray-950 text-gray-100' : 'bg-gray-50 text-gray-900';
    const cardClass = darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100';
    const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

    if (!isMounted) return null;

    return (
        <div className={`-m-8 p-8 min-h-screen transition-colors duration-300 ${bgClass}`}>
            <div className="max-w-[1400px] mx-auto space-y-6 animate-in fade-in pb-12">

                {/* HEAD */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-800/10 pb-4">
                    <div>
                        <h1 className="text-3xl font-display font-bold tracking-tight">Executive Dashboard</h1>
                        <p className={`${textMuted} text-[15px] mt-1 flex items-center gap-2`}>
                            FloreMoria Intelligence (Transazioni S.R.L. & GA4)
                            {selectedProvince && (
                                <span className="bg-fm-cta-soft/20 text-fm-cta px-3 py-1 rounded-full text-xs font-bold border border-fm-cta/20 cursor-pointer hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors" onClick={() => setSelectedProvince(null)}>
                                    <Filter size={12} className="inline mr-1" /> {selectedProvince} ✖
                                </span>
                            )}
                        </p>
                    </div>
                    <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-full border transition-all ${darkMode ? 'border-gray-700 hover:bg-gray-800 text-yellow-300' : 'border-gray-200 hover:bg-gray-100 text-gray-600'}`}>
                        {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                    </button>
                </div>

                {/* KPI OPERATIONAL (Top Row) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className={`${cardClass} rounded-2xl p-6 border shadow-sm relative overflow-hidden transition-colors`}>
                        <div className="text-gray-400 mb-2"><Euro size={22} className="text-fm-cta" /></div>
                        <div className={`text-sm font-semibold uppercase ${textMuted}`}>Margine Netto Reale</div>
                        <div className="text-3xl font-bold mt-1">€{(totalMarginCents / 100).toFixed(2)}</div>
                        <div className={`text-xs font-medium mt-2 opacity-70`}>Deducendo File CSV & Referral (10% FF)</div>
                    </div>

                    <div className={`${cardClass} rounded-2xl p-6 border shadow-sm relative overflow-hidden transition-colors`}>
                        <div className="text-gray-400 mb-2"><Activity size={22} className="text-purple-500" /></div>
                        <div className={`text-sm font-semibold uppercase ${textMuted}`}>Conversion Rate (GA4)</div>
                        <div className="text-3xl font-bold mt-1">{ga4Data?.conversionRate || 'N/A'}%</div>
                        <div className={`text-xs font-medium mt-2 opacity-70`}>Sessioni vs Ordini Completati</div>
                    </div>

                    <div className={`rounded-2xl p-6 border shadow-sm relative overflow-hidden transition-colors ${darkMode ? 'bg-red-950/20 border-red-900/50' : 'bg-red-50/50 border-red-200'}`}>
                        <div className="text-red-500 mb-2"><AlertTriangle size={22} /></div>
                        <div className="text-sm font-semibold text-red-600 uppercase">Alert Logistica</div>
                        <div className={`text-3xl font-bold mt-1 ${darkMode ? 'text-red-400' : 'text-red-700'}`}>{alertOrders.length}</div>
                        <div className={`text-xs font-medium mt-2 ${darkMode ? 'text-red-500/80' : 'text-red-500'}`}>Consegna &lt; 6h senza foto caricate</div>
                        {alertOrders.length > 0 && <div className="absolute top-0 right-0 w-2 h-full bg-red-500 animate-pulse" />}
                    </div>

                    <div className={`${cardClass} rounded-2xl p-6 border shadow-sm relative overflow-hidden transition-colors`}>
                        <div className="text-gray-400 mb-2"><TrendingUp size={22} className="text-blue-500" /></div>
                        <div className={`text-sm font-semibold uppercase ${textMuted}`}>Active Subs (MRR)</div>
                        <div className="text-3xl font-bold mt-1">{activeSubs}</div>
                        <div className={`text-xs font-medium mt-2 opacity-70 text-blue-500 font-bold`}>€{(currentMRR / 100).toFixed(2)} Mensili Garantiti</div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* GA4 FUNNEL (The Strategy) */}
                    <div className={`${cardClass} rounded-2xl p-6 border shadow-sm lg:col-span-2 transition-colors`}>
                        <h3 className="font-bold flex items-center gap-2 mb-6"><Users size={20} className="text-blue-500" /> Analytics Funnel (GA4 Dropout)</h3>
                        <div className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart layout="vertical" data={ga4Data?.funnel || []} margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={darkMode ? '#374151' : '#E5E7EB'} />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="step" type="category" width={150} tick={{ fontSize: 12, fill: darkMode ? '#9CA3AF' : '#6B7280' }} axisLine={false} tickLine={false} />
                                    <RechartsTooltip cursor={{ fill: darkMode ? '#1F2937' : '#F3F4F6' }} contentStyle={{ backgroundColor: darkMode ? '#111827' : '#FFF', borderColor: darkMode ? '#374151' : '#E5E7EB', borderRadius: '12px', color: darkMode ? '#F3F4F6' : '#111827' }} />
                                    <Bar dataKey="value" fill="#3B82F6" barSize={32} radius={[0, 4, 4, 0]}>
                                        {ga4Data?.funnel?.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={index > 2 ? '#EF4444' : '#3B82F6'} />
                                        ))}
                                    </Bar>
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                        <p className={`text-xs text-center mt-3 font-medium ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                            Osservazione: I drop-out nel nodo rosso (Step 4, Checkout) indicano opportunità di ottimizzazione copy o friction nel pagamento.
                        </p>
                    </div>

                    {/* GEO MAP (Bubbles) */}
                    <div className={`${cardClass} rounded-2xl p-6 border shadow-sm transition-colors flex flex-col items-center justify-center relative overflow-hidden`}>
                        <h3 className="font-bold w-full flex items-center justify-start gap-2 mb-2"><MapPin size={20} className="text-fm-cta" /> Revenue Map (Provinciale)</h3>
                        <p className={`w-full text-xs mb-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Clicca sulle bolle per esplodere i dati</p>

                        <div className="w-full h-[250px] bg-sky-50 dark:bg-sky-950/20 rounded-xl relative flex items-center justify-center p-4">
                            {/* Simulated Simple SVG Italy Shape or Just Bubbles in relative Box for assessment without heavy geojson */}
                            <ComposableMap projection="geoAzimuthalEqualArea" projectionConfig={{ scale: 1800, center: [12.5, 41.9] }} width={300} height={250} style={{ width: "100%", height: "100%" }}>
                                <Geographies geography="https://raw.githubusercontent.com/deldersveld/topojson/master/countries/italy/italy-provinces.json">
                                    {({ geographies }) =>
                                        geographies.map(geo => (
                                            // Fallback map boundaries
                                            <Geography key={geo.rsmKey} geography={geo} fill={darkMode ? '#1F2937' : '#E5E7EB'} stroke={darkMode ? '#374151' : '#FFFFFF'} strokeWidth={0.5} />
                                        ))
                                    }
                                </Geographies>
                                {mapMarkers.map(({ prov, coords, rev }) => (
                                    <Marker key={prov} coordinates={coords as [number, number]} onClick={() => setSelectedProvince(selectedProvince === prov ? null : prov)} className="cursor-pointer">
                                        <circle r={sizeScale(rev)} fill={selectedProvince === prov ? "#EF4444" : "#F59E0B"} fillOpacity={0.7} stroke="#FFFFFF" strokeWidth={1} />
                                        <text textAnchor="middle" y={-sizeScale(rev) - 4} style={{ fontFamily: "system-ui", fill: darkMode ? '#E5E7EB' : '#374151', fontSize: "10px", fontWeight: 'bold' }}>
                                            {prov}
                                        </text>
                                    </Marker>
                                ))}
                            </ComposableMap>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* PARTNER REFERRAL DEBT */}
                    <div className={`${cardClass} rounded-2xl p-6 border shadow-sm transition-colors`}>
                        <h3 className="font-bold flex items-center gap-2 mb-6"><Briefcase size={20} className="text-orange-500" /> Liquidazione Partner & Sorgenti</h3>
                        <div className="flex gap-4 p-4 rounded-xl border mb-6 items-center justify-between" style={{ borderColor: darkMode ? '#374151' : '#E5E7EB', backgroundColor: darkMode ? '#111827' : '#F9FAFB' }}>
                            <div>
                                <h4 className="font-semibold mb-1">Debiti Referral Maturati</h4>
                                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Commissioni 10% (AnnunciFunebri) su categoria [FF]</p>
                            </div>
                            <div className="text-3xl font-display font-bold text-orange-500">€{(debitoReferralCents / 100).toFixed(2)}</div>
                        </div>

                        <div className="space-y-3">
                            <div className={`grid grid-cols-12 text-xs font-bold uppercase tracking-widest border-b pb-2 ${darkMode ? 'border-gray-800 text-gray-500' : 'border-gray-100 text-gray-400'}`}>
                                <div className="col-span-6">Partner / ID Sorgente</div>
                                <div className="col-span-3 text-right">Vol. FF Ordini</div>
                                <div className="col-span-3 text-right">Maturato</div>
                            </div>
                            <div className={`grid grid-cols-12 items-center text-sm border-b pb-2 last:border-0 p-2 -mx-2 rounded-lg transition-colors ${darkMode ? 'border-gray-800 hover:bg-gray-800/50' : 'border-gray-50 hover:bg-gray-50'}`}>
                                <div className="col-span-6 font-semibold truncate flex flex-col">
                                    Annuncifunebri.it
                                    <span className="text-[10px] bg-orange-100 text-orange-700 w-fit px-1.5 py-0.5 rounded mt-0.5 font-bold">ACTV</span>
                                </div>
                                <div className="col-span-3 text-right font-bold opacity-80">{orders.filter(o => o.additionalInstructions?.includes('Annuncifunebri') && o.orderNumber?.startsWith('FF')).length}</div>
                                <div className="col-span-3 text-right font-bold text-orange-500">€{(debitoReferralCents / 100).toFixed(2)}</div>
                            </div>
                        </div>
                    </div>

                    {/* REVENUE GROWTH / SUBSCRIPTIONS */}
                    <div className={`${cardClass} rounded-2xl p-6 border shadow-sm transition-colors`}>
                        <h3 className="font-bold flex items-center gap-2 mb-6"><TrendingUp size={20} className="text-green-500" /> Profitability Scale (Pieno Margine Focus)</h3>
                        <div className="space-y-4">
                            <p className={`text-sm ${textMuted} mb-4`}>
                                Il margine S.R.L. include deduzione dei costi wholesale su FIORI e Margine Pieno (0€ cost) su **Lumini e Biglietti**.
                            </p>

                            <div className="h-[200px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={[{ name: 'Costi Wholesale', value: initialOrders.reduce((acc, o) => acc + (o.totalPriceCents), 0) / 100 - (totalMarginCents / 100) }, { name: 'Margine SRL Netto', value: totalMarginCents / 100 }]} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? '#374151' : '#E5E7EB'} />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 13, fill: darkMode ? '#9CA3AF' : '#6B7280', fontWeight: 'bold' }} />
                                        <RechartsTooltip cursor={{ fill: darkMode ? '#1F2937' : '#F3F4F6' }} contentStyle={{ backgroundColor: darkMode ? '#111827' : '#FFF', borderColor: darkMode ? '#374151' : '#E5E7EB', borderRadius: '12px', color: darkMode ? '#F3F4F6' : '#111827' }} />
                                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                            <Cell fill="#EF4444" />
                                            <Cell fill="#10B981" />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
