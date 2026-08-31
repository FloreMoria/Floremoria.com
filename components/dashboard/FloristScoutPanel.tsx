'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ExternalLink,
  Loader2,
  MapPin,
  Phone,
  Search,
  Sparkles,
  Star,
  UserPlus,
  Users,
} from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';
import {
  readFloristScoutFromFlags,
  type FloristScoutOrderPayload,
  type FloristScoutRecommendation,
} from '@/lib/ai/floristScoutTypes';
import {
  buildFloristDirectoryUrl,
  buildFloristScoutGoogleMapsUrl,
} from '@/lib/ai/floristScoutMaps';

type Props = {
  orderId: string;
  orderNumber?: string | null;
  cemeteryName?: string;
  cemeteryCity?: string;
  gravePosition?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  veraWorkflowFlags?: unknown;
  hasPartner: boolean;
  canChangeStatus: boolean;
  onPartnerAssigned?: (partnerId: string, shopName: string) => void;
  onScoutUpdated?: (flags: unknown) => void;
};

function buildCemeteryLabel(cemeteryName?: string, cemeteryCity?: string): string {
  const name = (cemeteryName || '').trim();
  const city = (cemeteryCity || '').trim();
  if (!name && !city) return 'Cimitero indicato';
  if (!city || name.toLowerCase().includes(city.toLowerCase())) return name || city;
  return `${name}, ${city}`;
}

function lookupMethodLabel(method?: string): string {
  if (method === 'google_places') return 'Google Places';
  if (method === 'gemini') return 'Scout AI (Gemini)';
  return 'Scout';
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/\s/g, '')}`;
}

function whatsappCollaborationHref(phone: string, orderNumber: string | null | undefined, cemetery: string): string {
  const digits = phone.replace(/\D/g, '');
  const wa = digits.startsWith('39') ? digits : `39${digits.replace(/^0/, '')}`;
  const msg = [
    'Buongiorno,',
    'siamo FloreMoria — piattaforma per consegne floreali su tombe.',
    orderNumber ? `Abbiamo un ordine (${orderNumber})` : 'Abbiamo un ordine',
    `per il cimitero ${cemetery}.`,
    'Sareste disponibili come partner per la consegna? Grazie.',
  ].join(' ');
  return `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
}

function FloristCard({
  rec,
  isPrimary,
  canChangeStatus,
  orderId,
  orderNumber,
  cemeteryLabel,
  onAssigned,
}: {
  rec: FloristScoutRecommendation;
  isPrimary: boolean;
  canChangeStatus: boolean;
  orderId: string;
  orderNumber?: string | null;
  cemeteryLabel: string;
  onAssigned?: (partnerId: string, shopName: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  const assignProvisional = async () => {
    if (!canChangeStatus || loading) return;
    if (!confirm(`Assegnare "${rec.name}" come fiorista provvisorio su questo ordine?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/orders/${orderId}/scout-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rank: rec.rank }),
      });
      const parsed = await readJsonResponse<{ ok?: boolean; partnerId?: string; shopName?: string; error?: string }>(res);
      if (!parsed.ok) {
        alert(parsed.error || 'Errore assegnazione fiorista provvisorio.');
        return;
      }
      onAssigned?.(parsed.data?.partnerId || '', parsed.data?.shopName || rec.name);
    } catch {
      alert('Errore di rete durante l\'assegnazione.');
    } finally {
      setLoading(false);
    }
  };

  const registerQuery = new URLSearchParams({
    scoutShop: rec.name,
    scoutPhone: rec.phone,
    scoutAddress: rec.address,
    scoutCity: '',
  });

  return (
    <div
      className={`rounded-xl border p-4 ${
        isPrimary
          ? 'border-emerald-300 bg-emerald-50/80 shadow-sm ring-1 ring-emerald-200'
          : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900">{rec.name}</span>
            {isPrimary ? (
              <span className="rounded-full bg-emerald-700 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Più vicino — primo da contattare
              </span>
            ) : (
              <span className="text-xs font-medium text-gray-500">#{rec.rank}</span>
            )}
            {rec.isDirectKiosk ? (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                Chiosco
              </span>
            ) : null}
          </div>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-gray-600">
            <MapPin size={14} className="mt-0.5 shrink-0 text-gray-400" />
            <span>{rec.address}</span>
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {rec.distanceDescription} · ~{rec.distanceMeters} m dall&apos;ingresso
          </p>
          {rec.rating > 0 ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-amber-800">
              <Star size={12} className="fill-amber-400 text-amber-400" />
              {rec.rating.toFixed(1)} · {rec.reviewsCount} recensioni
            </p>
          ) : null}
          <p className="mt-2 text-xs italic text-gray-600">{rec.aiReasoning}</p>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <a
            href={telHref(rec.phone)}
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white no-underline transition-colors ${
              isPrimary ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-gray-800 hover:bg-gray-900'
            }`}
          >
            <Phone size={16} />
            {isPrimary ? 'Chiama subito' : 'Chiama'}
          </a>
          <a
            href={whatsappCollaborationHref(rec.phone, orderNumber, cemeteryLabel)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-600 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
          >
            Richiesta collaborazione
          </a>
          <span className="text-center text-xs text-gray-600">{rec.phone}</span>
          {canChangeStatus ? (
            <>
              <button
                type="button"
                onClick={assignProvisional}
                disabled={loading}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                Assegna provvisorio
              </button>
              <Link
                href={`/dashboard/fioristi?${registerQuery.toString()}`}
                className="text-center text-[11px] font-medium text-emerald-700 underline-offset-2 hover:underline"
              >
                Registra partner completo
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function FloristScoutPanel({
  orderId,
  orderNumber,
  cemeteryName,
  cemeteryCity,
  gravePosition,
  latitude,
  longitude,
  veraWorkflowFlags,
  hasPartner,
  canChangeStatus,
  onPartnerAssigned,
  onScoutUpdated,
}: Props) {
  const initialScout = useMemo(
    () => readFloristScoutFromFlags(veraWorkflowFlags),
    [veraWorkflowFlags]
  );
  const [scout, setScout] = useState<FloristScoutOrderPayload | null>(initialScout);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);

  useEffect(() => {
    setScout(readFloristScoutFromFlags(veraWorkflowFlags));
  }, [veraWorkflowFlags]);

  const cemeteryLabel = buildCemeteryLabel(cemeteryName, cemeteryCity);
  const googleMapsUrl = useMemo(
    () =>
      buildFloristScoutGoogleMapsUrl({
        cemeteryName,
        cemeteryCity,
        gravePosition,
        latitude,
        longitude,
      }),
    [cemeteryName, cemeteryCity, gravePosition, latitude, longitude]
  );
  const partnerDirectoryUrl = useMemo(
    () => buildFloristDirectoryUrl({ cemeteryCity, cemeteryName }),
    [cemeteryCity, cemeteryName]
  );

  const runScoutSearch = useCallback(async () => {
    setSearching(true);
    setSearchError(null);
    setSearchMessage(null);
    try {
      const res = await fetch(`/api/dashboard/orders/${orderId}/scout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      const parsed = await readJsonResponse<{
        ok?: boolean;
        scout?: FloristScoutOrderPayload | null;
        message?: string;
        error?: string;
        recommendations?: number;
        lookupMethod?: string;
        failureReason?: string | null;
      }>(res);
      if (!parsed.ok) throw new Error(parsed.error || 'Ricerca fallita');
      const payload = parsed.data?.scout || null;
      setScout(payload);
      const recCount = parsed.data?.recommendations ?? payload?.recommendations.length ?? 0;
      if (recCount > 0) {
        setSearchMessage(
          parsed.data?.message ||
            `Trovati ${recCount} fioristi (${lookupMethodLabel(parsed.data?.lookupMethod || payload?.lookupMethod)}).`
        );
        setSearchError(null);
      } else {
        setSearchMessage(null);
        setSearchError(
          parsed.data?.failureReason ||
            parsed.data?.message ||
            'Nessun fiorista con telefono verificato. Prova Google Maps manualmente.'
        );
      }
      if (payload) {
        onScoutUpdated?.({
          ...(typeof veraWorkflowFlags === 'object' && veraWorkflowFlags
            ? veraWorkflowFlags
            : {}),
          suggestedFlorists: payload,
          floristScoutAt: payload.scoutedAt,
        });
      }
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Ricerca fallita');
    } finally {
      setSearching(false);
    }
  }, [orderId, onScoutUpdated, veraWorkflowFlags]);

  if (hasPartner) return null;

  const hasResults = Boolean(scout?.recommendations.length);

  return (
    <div className="w-full min-w-0 space-y-4 rounded-2xl border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-amber-50/80 p-4 shadow-sm">
      <div className="flex w-full min-w-0 items-start gap-3">
        <Sparkles size={20} className="mt-0.5 shrink-0 text-orange-700" />
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-orange-950">
            Zona non servita — nessun partner attivo
          </h4>
          <p className="mt-1 text-sm leading-snug text-orange-900/90">
            <span className="font-semibold">{cemeteryLabel}</span>
            {orderNumber ? (
              <>
                {' '}
                · ordine <span className="font-mono">#{orderNumber}</span>
              </>
            ) : null}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-orange-900/75">
            Cerca fioristi vicini al cimitero e assegna rapidamente, oppure invia una richiesta di
            collaborazione.
          </p>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => void runScoutSearch()}
          disabled={searching || !canChangeStatus}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-orange-800 disabled:opacity-60"
        >
          {searching ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Search size={16} />
          )}
          Cerca Fiorista in Zona
        </button>
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-orange-300 bg-white px-3 py-3 text-xs font-bold text-orange-900 hover:bg-orange-50"
        >
          <MapPin size={14} />
          Google Maps
          <ExternalLink size={12} />
        </a>
        <Link
          href={partnerDirectoryUrl}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-3 text-xs font-bold text-slate-800 hover:bg-slate-50"
        >
          <Users size={14} />
          Directory partner
        </Link>
      </div>

      {searching ? (
        <p className="rounded-lg border border-orange-200 bg-white/70 px-3 py-2 text-xs text-orange-900">
          Ricerca in corso… prima Scout AI, poi Google Places se necessario.
        </p>
      ) : null}

      {searchError ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-900">
          {searchError}
        </p>
      ) : null}
      {searchMessage ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">
          {searchMessage}
        </p>
      ) : null}

      {!hasResults && !searching && !searchError ? (
        <p className="text-xs italic text-orange-900/70">
          Premi <strong>Cerca Fiorista in Zona</strong> oppure apri Google Maps / directory partner.
        </p>
      ) : null}

      {hasResults ? (
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-orange-800">
            Candidati trovati ({scout!.recommendations.length})
          </p>
          {scout!.recommendations.map((rec) => (
            <FloristCard
              key={`${rec.rank}-${rec.phone}`}
              rec={rec}
              isPrimary={rec.rank === 1}
              canChangeStatus={canChangeStatus}
              orderId={orderId}
              orderNumber={orderNumber}
              cemeteryLabel={cemeteryLabel}
              onAssigned={onPartnerAssigned}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
