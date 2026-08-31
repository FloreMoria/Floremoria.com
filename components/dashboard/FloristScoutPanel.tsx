'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Phone, MapPin, Star, Sparkles, UserPlus, Loader2 } from 'lucide-react';
import {
  readFloristScoutFromFlags,
  type FloristScoutRecommendation,
} from '@/lib/ai/floristScoutTypes';

type Props = {
  orderId: string;
  orderNumber?: string | null;
  cemeteryName?: string;
  cemeteryCity?: string;
  veraWorkflowFlags?: unknown;
  hasPartner: boolean;
  canChangeStatus: boolean;
  onPartnerAssigned?: (partnerId: string, shopName: string) => void;
};

function telHref(phone: string): string {
  return `tel:${phone.replace(/\s/g, '')}`;
}

function FloristCard({
  rec,
  isPrimary,
  canChangeStatus,
  orderId,
  onAssigned,
}: {
  rec: FloristScoutRecommendation;
  isPrimary: boolean;
  canChangeStatus: boolean;
  orderId: string;
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
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error || 'Errore assegnazione fiorista provvisorio.');
        return;
      }
      onAssigned?.(data.partnerId, data.shopName);
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
                Più vicino all&apos;ingresso — Primo da contattare
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
              isPrimary
                ? 'bg-emerald-700 hover:bg-emerald-800'
                : 'bg-gray-800 hover:bg-gray-900'
            }`}
          >
            <Phone size={16} />
            {isPrimary ? 'Chiama subito' : 'Chiama'}
          </a>
          <span className="text-center text-xs text-gray-600">{rec.phone}</span>
          {canChangeStatus ? (
            <>
              <button
                type="button"
                onClick={assignProvisional}
                disabled={loading}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-600 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
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
  veraWorkflowFlags,
  hasPartner,
  canChangeStatus,
  onPartnerAssigned,
}: Props) {
  const scout = useMemo(
    () => readFloristScoutFromFlags(veraWorkflowFlags),
    [veraWorkflowFlags]
  );

  if (hasPartner || !scout?.recommendations.length) return null;

  return (
    <div className="space-y-3 rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-4">
      <div className="flex items-start gap-2">
        <Sparkles size={18} className="mt-0.5 shrink-0 text-amber-700" />
        <div>
          <h4 className="text-sm font-bold text-amber-950">
            Fioristi di Prossimità (Scout AI)
          </h4>
          <p className="text-xs leading-relaxed text-amber-900/80">
            Nessun partner ufficiale in zona per{' '}
            <strong>{cemeteryName || scout.cemetery}</strong>
            {cemeteryCity || scout.cemeteryCity ? ` (${cemeteryCity || scout.cemeteryCity})` : ''}.
            Ordine {orderNumber ? `#${orderNumber}` : ''} — contattare per primo il candidato #1.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {scout.recommendations.map((rec) => (
          <FloristCard
            key={`${rec.rank}-${rec.phone}`}
            rec={rec}
            isPrimary={rec.rank === 1}
            canChangeStatus={canChangeStatus}
            orderId={orderId}
            onAssigned={onPartnerAssigned}
          />
        ))}
      </div>
    </div>
  );
}
