'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Loader2, Send, Trash2 } from 'lucide-react';

type OfferSendDuration = '1w' | '1m' | '3m' | '6m' | '1y';

type OfferGrantRow = {
  id: string;
  recipientPhone: string;
  recipientName: string | null;
  endsAt: string;
  sentAt: string | null;
  maxUses: number;
  _count?: { redemptions: number };
};

type OfferRow = {
  id: string;
  name: string;
  code: string | null;
  type: 'PERCENT' | 'FIXED';
  value: number;
  maxUses: number | null;
  endsAt: string | null;
  isActive: boolean;
  _count?: { redemptions: number; grants?: number };
  grants?: OfferGrantRow[];
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

type ContactHit = {
  type: 'UTENTE' | 'FLORIST';
  id: string;
  name: string;
  phone: string;
  recipientFirstName: string;
  subtitle?: string;
};

export default function OffersManagerClient() {
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdWhatsappLink, setCreatedWhatsappLink] = useState('');
  const [offerPendingDelete, setOfferPendingDelete] = useState<OfferRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sendOfferId, setSendOfferId] = useState<string | null>(null);
  const [sendPhone, setSendPhone] = useState('');
  const [sendName, setSendName] = useState('');
  const [sendUserId, setSendUserId] = useState<string | null>(null);
  const [sendDuration, setSendDuration] = useState<OfferSendDuration>('6m');
  const [sendForceTemplate, setSendForceTemplate] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState('');
  const [contactQuery, setContactQuery] = useState('');
  const [contactHits, setContactHits] = useState<ContactHit[]>([]);
  const [searchingContacts, setSearchingContacts] = useState(false);

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

  useEffect(() => {
    if (!sendOfferId) return;
    const q = contactQuery.trim();
    if (q.length < 2) {
      setContactHits([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearchingContacts(true);
      try {
        const res = await fetch(`/api/dashboard/communications/contacts?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setContactHits(data.success ? data.results || [] : []);
      } catch {
        setContactHits([]);
      } finally {
        setSearchingContacts(false);
      }
    }, 280);
    return () => window.clearTimeout(timer);
  }, [contactQuery, sendOfferId]);

  const openSendPanel = (offer: OfferRow) => {
    setSendOfferId(offer.id);
    setSendPhone('');
    setSendName('');
    setSendUserId(null);
    setSendDuration('6m');
    setSendForceTemplate(false);
    setSendMessage('');
    setContactQuery('');
    setContactHits([]);
    setError('');
  };

  const selectContact = (contact: ContactHit) => {
    setSendPhone(contact.phone);
    setSendName(contact.name);
    setSendUserId(contact.type === 'UTENTE' ? contact.id : null);
    setContactQuery(contact.name);
    setContactHits([]);
  };

  const sendOfferWhatsApp = async () => {
    if (!sendOfferId || sending) return;
    setSending(true);
    setError('');
    setSendMessage('');
    try {
      const res = await fetch(`/api/admin/offers/${sendOfferId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneRaw: sendPhone,
          duration: sendDuration,
          recipientName: sendName || undefined,
          userId: sendUserId || undefined,
          forceTemplate: sendForceTemplate,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || 'Invio WhatsApp non riuscito.');
      }
      const endsLabel = payload.endsAt
        ? new Date(payload.endsAt).toLocaleDateString('it-IT')
        : '';
      setSendMessage(
        `Inviato a ${payload.phoneE164}. Scadenza personale: ${endsLabel}` +
          (payload.fallbackExecuted ? ' (template Meta).' : '.')
      );
      await loadOffers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore invio WhatsApp.');
    } finally {
      setSending(false);
    }
  };

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

  const confirmDeleteOffer = async () => {
    if (!offerPendingDelete || deleting) return;
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/offers/${offerPendingDelete.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Errore eliminazione buono.');
      }
      setOfferPendingDelete(null);
      await loadOffers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore eliminazione buono.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Buoni Sconto</h1>
        <p className="text-sm text-gray-500">
          Crea il buono una volta, poi invialo via WhatsApp a ogni destinatario con una scadenza personale
          (es. Pinco 6 mesi, Cinciallegra 3 mesi sullo stesso codice).
        </p>
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
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleOfferActive(offer)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${offer.isActive ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}
                      >
                        {offer.isActive ? 'Disattiva' : 'Attiva'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openSendPanel(offer)}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Invia WA
                      </button>
                      <button
                        type="button"
                        onClick={() => setOfferPendingDelete(offer)}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-red-600 text-white hover:bg-red-700"
                        title="Elimina definitivamente"
                        aria-label={`Elimina buono ${offer.code || offer.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Elimina
                      </button>
                    </div>
                    {sendOfferId === offer.id && (
                      <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 space-y-2 min-w-[280px]">
                        <p className="text-xs font-semibold text-emerald-900">
                          Invio WhatsApp · scadenza personale
                        </p>
                        <input
                          value={contactQuery}
                          onChange={(e) => setContactQuery(e.target.value)}
                          placeholder="Cerca in anagrafica (nome/tel)…"
                          className="w-full rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs"
                        />
                        {searchingContacts && (
                          <p className="text-[11px] text-emerald-700 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> Ricerca…
                          </p>
                        )}
                        {contactHits.length > 0 && (
                          <div className="max-h-28 overflow-y-auto rounded-lg border border-emerald-100 bg-white">
                            {contactHits.map((c) => (
                              <button
                                key={`${c.type}-${c.id}`}
                                type="button"
                                onClick={() => selectContact(c)}
                                className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-emerald-50 border-b border-emerald-50 last:border-0"
                              >
                                <span className="font-semibold">{c.name}</span>
                                <span className="text-gray-500"> · {c.phone}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <input
                          value={sendPhone}
                          onChange={(e) => {
                            setSendPhone(e.target.value);
                            setSendUserId(null);
                          }}
                          placeholder="WhatsApp +3933…"
                          className="w-full rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs"
                        />
                        <input
                          value={sendName}
                          onChange={(e) => setSendName(e.target.value)}
                          placeholder="Nome destinatario (opzionale)"
                          className="w-full rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs"
                        />
                        <select
                          value={sendDuration}
                          onChange={(e) => setSendDuration(e.target.value as OfferSendDuration)}
                          className="w-full rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs"
                        >
                          <option value="1w">Validità: 1 settimana</option>
                          <option value="1m">Validità: 1 mese</option>
                          <option value="3m">Validità: 3 mesi</option>
                          <option value="6m">Validità: 6 mesi</option>
                          <option value="1y">Validità: 1 anno</option>
                        </select>
                        <label className="flex items-center gap-2 text-[11px] text-emerald-900">
                          <input
                            type="checkbox"
                            checked={sendForceTemplate}
                            onChange={(e) => setSendForceTemplate(e.target.checked)}
                          />
                          Usa template Meta (consigliato fuori finestra 24h)
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={sending || !sendPhone.trim()}
                            onClick={() => void sendOfferWhatsApp()}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-40"
                          >
                            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            Invia messaggio
                          </button>
                          <button
                            type="button"
                            onClick={() => setSendOfferId(null)}
                            className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-900"
                          >
                            Chiudi
                          </button>
                        </div>
                        {sendMessage && <p className="text-[11px] text-emerald-800">{sendMessage}</p>}
                      </div>
                    )}
                    {offer.grants && offer.grants.length > 0 && (
                      <div className="mt-2 text-[10px] text-gray-500 space-y-0.5">
                        {offer.grants.slice(0, 5).map((g) => (
                          <div key={g.id}>
                            {(g.recipientName || g.recipientPhone)} · scade{' '}
                            {new Date(g.endsAt).toLocaleDateString('it-IT')} · usi{' '}
                            {g._count?.redemptions ?? 0}/{g.maxUses}
                          </div>
                        ))}
                      </div>
                    )}
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

      {offerPendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[1px]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-offer-title"
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl space-y-4"
          >
            <h3 id="delete-offer-title" className="text-lg font-semibold text-gray-900">
              Elimina buono sconto
            </h3>
            <p className="text-sm text-gray-600">
              Sei sicuro di voler eliminare definitivamente questo buono sconto?
            </p>
            <p className="text-sm font-mono text-gray-800 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
              {offerPendingDelete.code || offerPendingDelete.name}
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => !deleting && setOfferPendingDelete(null)}
                disabled={deleting}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteOffer()}
                disabled={deleting}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Eliminazione…' : 'Elimina definitivamente'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
