'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type OfferRow = {
  id: string;
  name: string;
  code: string | null;
  type: 'PERCENT' | 'FIXED';
  value: number;
  maxUses: number | null;
  endsAt: string | null;
  isActive: boolean;
  _count?: { redemptions: number };
  redemptions?: Array<{
    id: string;
    buyerEmail: string | null;
    buyerFullName: string | null;
    usedAt: string;
    order: { orderNumber: string | null };
  }>;
  rulesJson: {
    audience?: 'all' | 'single';
    userEmail?: string;
    userName?: string;
    sendWhatsappLink?: boolean;
    whatsappNumber?: string;
  } | null;
};

export default function OffersManagerClient() {
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdWhatsappLink, setCreatedWhatsappLink] = useState('');

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [value, setValue] = useState('');
  const [audience, setAudience] = useState<'all' | 'single'>('all');
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [duration, setDuration] = useState<'1w' | '1m' | '3m' | '6m' | '1y'>('1w');
  const [sendWhatsappLink, setSendWhatsappLink] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'expired' | 'exhausted'>('all');

  const parsedValue = useMemo(() => Number(value || '0'), [value]);
  const filteredOffers = useMemo(() => {
    const now = Date.now();
    return offers.filter((offer) => {
      const used = offer._count?.redemptions ?? 0;
      const isExhausted = typeof offer.maxUses === 'number' && offer.maxUses > 0 && used >= offer.maxUses;
      const isExpired = !!offer.endsAt && new Date(offer.endsAt).getTime() < now;
      if (statusFilter === 'active') return offer.isActive;
      if (statusFilter === 'inactive') return !offer.isActive;
      if (statusFilter === 'expired') return isExpired;
      if (statusFilter === 'exhausted') return isExhausted;
      return true;
    });
  }, [offers, statusFilter]);

  const loadOffers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/offers');
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Errore caricamento buoni.');
      setOffers(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore caricamento.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOffers();
  }, []);

  const resetForm = () => {
    setName('');
    setCode('');
    setType('PERCENT');
    setValue('');
    setAudience('all');
    setUserEmail('');
    setUserName('');
    setDuration('1w');
    setSendWhatsappLink(false);
    setWhatsappNumber('');
    setMaxUses('');
  };

  const onCreateOffer = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setCreatedWhatsappLink('');

    if (!name.trim() || !code.trim() || !value.trim()) {
      setError('Compila nome, codice e importo.');
      return;
    }
    if (type === 'PERCENT' && (parsedValue <= 0 || parsedValue > 100)) {
      setError('Percentuale non valida (1-100).');
      return;
    }
    if (type === 'FIXED' && parsedValue <= 0) {
      setError("L'importo fisso deve essere maggiore di zero.");
      return;
    }
    if (audience === 'single' && !userEmail.trim() && !userName.trim()) {
      setError('Per utente singolo inserisci almeno email o nome.');
      return;
    }

    const normalizedCode = code.trim().toUpperCase();
    const offerValue = type === 'FIXED' ? Math.round(parsedValue * 100) : Math.round(parsedValue);
    const endsAt = (() => {
      const now = new Date();
      const next = new Date(now);
      if (duration === '1w') next.setDate(next.getDate() + 7);
      if (duration === '1m') next.setMonth(next.getMonth() + 1);
      if (duration === '3m') next.setMonth(next.getMonth() + 3);
      if (duration === '6m') next.setMonth(next.getMonth() + 6);
      if (duration === '1y') next.setFullYear(next.getFullYear() + 1);
      return next.toISOString();
    })();
    const rulesJson = {
      audience,
      userEmail: userEmail.trim() || undefined,
      userName: userName.trim() || undefined,
      sendWhatsappLink,
      whatsappNumber: whatsappNumber.trim() || undefined,
    };
    const maxUsesNumber = Number(maxUses);
    const parsedMaxUses = maxUses.trim() && Number.isFinite(maxUsesNumber) ? Math.max(1, Math.round(maxUsesNumber)) : null;

    try {
      const res = await fetch('/api/admin/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          code: normalizedCode,
          type,
          value: offerValue,
          maxUses: parsedMaxUses,
          endsAt,
          isActive: true,
          rulesJson,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Errore creazione buono.');

      if (sendWhatsappLink && whatsappNumber.trim()) {
        const baseUrl = window.location.origin;
        const checkoutUrl = `${baseUrl}/checkout?discountCode=${encodeURIComponent(normalizedCode)}`;
        const text = `Ciao! Hai ricevuto un buono FloreMoria: ${normalizedCode}. Applica il codice qui: ${checkoutUrl}`;
        setCreatedWhatsappLink(`https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`);
      }

      resetForm();
      await loadOffers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore creazione buono.');
    }
  };

  const toggleOfferActive = async (offer: OfferRow) => {
    setError('');
    try {
      const res = await fetch(`/api/admin/offers/${offer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !offer.isActive }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Errore aggiornamento stato.');
      await loadOffers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore aggiornamento stato.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Buoni Sconto</h1>
        <p className="text-sm text-gray-500">Crea codici per utente singolo o per tutti, con scadenza e invio WhatsApp.</p>
      </div>

      <form onSubmit={onCreateOffer} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <div className="grid md:grid-cols-3 gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome buono (es. BENVENUTO MAGGIO)" className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Codice (es. FLOREM10)" className="border border-gray-200 rounded-xl px-3 py-2 text-sm uppercase" />
          <select value={duration} onChange={(e) => setDuration(e.target.value as '1w' | '1m' | '3m' | '6m' | '1y')} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
            <option value="1w">Scadenza: 1 settimana</option>
            <option value="1m">Scadenza: 1 mese</option>
            <option value="3m">Scadenza: 3 mesi</option>
            <option value="6m">Scadenza: 6 mesi</option>
            <option value="1y">Scadenza: 1 anno</option>
          </select>
        </div>

        <div className="grid md:grid-cols-5 gap-3">
          <select value={type} onChange={(e) => setType(e.target.value as 'PERCENT' | 'FIXED')} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
            <option value="PERCENT">Percentuale</option>
            <option value="FIXED">Importo fisso in EUR</option>
          </select>
          <input value={value} onChange={(e) => setValue(e.target.value)} type="number" min="0" step={type === 'FIXED' ? '0.01' : '1'} placeholder={type === 'FIXED' ? 'Importo €' : 'Percentuale %'} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          <input value={maxUses} onChange={(e) => setMaxUses(e.target.value)} type="number" min="1" step="1" placeholder="Limite usi (es. 1)" className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          <select value={audience} onChange={(e) => setAudience(e.target.value as 'all' | 'single')} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
            <option value="all">Per tutti</option>
            <option value="single">Utente singolo</option>
          </select>
          <button type="submit" className="bg-fm-cta text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-fm-cta/90">Crea buono</button>
        </div>

        {audience === 'single' && (
          <div className="grid md:grid-cols-2 gap-3">
            <input value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="Email utente (opzionale)" className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            <input value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Nome utente (opzionale)" className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>
        )}

        <div className="grid md:grid-cols-[auto,1fr] gap-3 items-center">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={sendWhatsappLink} onChange={(e) => setSendWhatsappLink(e.target.checked)} />
            Invia link su WhatsApp
          </label>
          <input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="Numero WhatsApp (es. 393201234567)" className="border border-gray-200 rounded-xl px-3 py-2 text-sm" disabled={!sendWhatsappLink} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {createdWhatsappLink && (
          <p className="text-sm text-green-700">
            Link WhatsApp pronto: <a href={createdWhatsappLink} className="underline" target="_blank" rel="noreferrer">apri invio</a>
          </p>
        )}
      </form>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Buoni creati</h2>
          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive' | 'expired' | 'exhausted')}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
            >
              <option value="all">Tutti</option>
              <option value="active">Attivi</option>
              <option value="inactive">Disattivi</option>
              <option value="expired">Scaduti</option>
              <option value="exhausted">Esauriti</option>
            </select>
            {loading && <span className="text-xs text-gray-500">Aggiornamento...</span>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2">Nome</th>
                <th className="text-left px-4 py-2">Codice</th>
                <th className="text-left px-4 py-2">Importo</th>
                <th className="text-left px-4 py-2">Target</th>
                <th className="text-left px-4 py-2">Utilizzi</th>
                <th className="text-left px-4 py-2">Scadenza</th>
                <th className="text-left px-4 py-2">Stato</th>
                <th className="text-left px-4 py-2">Azioni</th>
                <th className="text-left px-4 py-2">Storico (ultimi 10)</th>
              </tr>
            </thead>
            <tbody>
              {filteredOffers.map((offer) => (
                <tr key={offer.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-gray-900">{offer.name}</td>
                  <td className="px-4 py-2 font-mono">{offer.code ?? '-'}</td>
                  <td className="px-4 py-2">{offer.type === 'PERCENT' ? `${offer.value}%` : `€${(offer.value / 100).toFixed(2)}`}</td>
                  <td className="px-4 py-2">{offer.rulesJson?.audience === 'single' ? 'Utente singolo' : 'Tutti'}</td>
                  <td className="px-4 py-2">
                    {(offer._count?.redemptions ?? 0)}
                    {offer.maxUses ? ` / ${offer.maxUses}` : ' / ∞'}
                  </td>
                  <td className="px-4 py-2">{offer.endsAt ? new Date(offer.endsAt).toLocaleString('it-IT') : 'Nessuna'}</td>
                  <td className="px-4 py-2">{offer.isActive ? 'Attivo' : 'Disattivo'}</td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => toggleOfferActive(offer)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${offer.isActive ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}
                    >
                      {offer.isActive ? 'Disattiva' : 'Attiva'}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600">
                    {offer.redemptions && offer.redemptions.length > 0 ? (
                      <div className="space-y-1">
                        {offer.redemptions.map((r) => (
                          <div key={r.id}>
                            {(r.buyerFullName || 'Cliente')} - {(r.buyerEmail || 'email non disponibile')} - Ord. {r.order.orderNumber || '-'}
                          </div>
                        ))}
                      </div>
                    ) : (
                      'Nessun utilizzo'
                    )}
                  </td>
                </tr>
              ))}
              {filteredOffers.length === 0 && !loading && (
                <tr>
                  <td className="px-4 py-6 text-gray-500" colSpan={9}>Nessun buono disponibile.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
