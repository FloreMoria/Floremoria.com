'use client';

import React from 'react';
import { ExternalLink, RefreshCw, BarChart3 } from 'lucide-react';
import { toCampaignMediaProxyUrl } from '@/lib/dashboard/campaignMediaUrl';
import type {
  CampaignMetricsRow,
  ChannelMetricsSummary,
} from '@/lib/marketing/socialMetrics/types';

function fmt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '0';
  return new Intl.NumberFormat('it-IT').format(n);
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function thumbUrl(row: CampaignMetricsRow): string | null {
  // Preferisci frame/immagine: l’URL video non funziona come <img> (Reel → N/A).
  if (row.metrics.thumbnailUrl) {
    return toCampaignMediaProxyUrl(row.metrics.thumbnailUrl) || row.metrics.thumbnailUrl;
  }
  if (row.imageUrl) {
    const first = row.imageUrl.trim().startsWith('[')
      ? (() => {
          try {
            const parsed = JSON.parse(row.imageUrl!);
            return Array.isArray(parsed) ? String(parsed[0] || '') : row.imageUrl;
          } catch {
            return row.imageUrl.split(',')[0]?.trim() || row.imageUrl;
          }
        })()
      : row.imageUrl.includes(',')
        ? row.imageUrl.split(',')[0]!.trim()
        : row.imageUrl;
    return toCampaignMediaProxyUrl(first) || first;
  }
  return null;
}

type Props = {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  summary: ChannelMetricsSummary | null;
  rows: CampaignMetricsRow[];
  onRefresh: () => void;
};

export default function CampaignMetricsPanel({
  loading,
  refreshing,
  error,
  summary,
  rows,
  onRefresh,
}: Props) {
  // Filtra la lista escludendo Storie (mostra solo contenuti permanenti: Reel, Feed, Foto, Caroselli)
  const activeRows = rows.filter(
    (row) => row.contentFormat !== 'STORY' && row.contentFormat !== 'STORIES'
  );

  return (
    <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-slate-500" />
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">
            Metriche pubblicazioni permanenti (Feed, Reel, Caroselli)
          </h3>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 disabled:opacity-50 transition-all shadow-2xs"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin text-slate-600' : ''} />
          {refreshing ? 'Aggiornamento…' : 'Aggiorna da social'}
        </button>
      </div>

      {summary ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 px-4 py-3 bg-slate-50/80 border-b border-slate-100">
          {[
            { label: 'Post Permanenti', value: activeRows.length },
            { label: 'Con metriche', value: summary.withLiveMetrics },
            { label: 'Visualizzazioni', value: summary.views },
            { label: 'Copertura', value: summary.reach },
            { label: 'Like', value: summary.likes },
            { label: 'Commenti', value: summary.comments },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-2xl bg-white border border-slate-200 px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {kpi.label}
              </div>
              <div className="text-sm font-black text-slate-800 tabular-nums">{fmt(kpi.value)}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="px-4 py-2 text-[11px] text-slate-500 border-b border-slate-100 bg-white">
        Instagram & Facebook: metriche live dei post permanenti (views, reach, like, commenti, condivisioni). Storie escluse.
      </div>

      {error ? (
        <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border-b border-red-100">{error}</div>
      ) : null}

      <div className="overflow-auto max-h-[calc(100vh-220px)] min-h-[300px] relative w-full border-t border-b border-slate-100 bg-white">
        <table className="w-full min-w-[1050px] text-sm text-left border-collapse">
          <thead className="sticky top-0 z-20 bg-slate-900 text-slate-100 shadow-md">
            <tr>
              <th className="sticky top-0 z-20 bg-slate-900 text-slate-200 font-bold py-3 px-3.5 uppercase text-[11px] tracking-wider text-center min-w-[64px]">
                Media
              </th>
              <th className="sticky top-0 z-20 bg-slate-900 text-slate-200 font-bold py-3 px-3.5 uppercase text-[11px] tracking-wider min-w-[135px]">
                Pubblicato
              </th>
              <th className="sticky top-0 z-20 bg-slate-900 text-slate-200 font-bold py-3 px-3.5 uppercase text-[11px] tracking-wider min-w-[100px]">
                Formato
              </th>
              <th className="sticky top-0 z-20 bg-slate-900 text-slate-200 font-bold py-3 px-3.5 uppercase text-[11px] tracking-wider min-w-[220px]">
                Copy
              </th>
              <th className="sticky top-0 z-20 bg-slate-900 text-slate-200 font-bold py-3 px-3.5 uppercase text-[11px] tracking-wider text-right min-w-[125px]">
                Visualizzazioni
              </th>
              <th className="sticky top-0 z-20 bg-slate-900 text-slate-200 font-bold py-3 px-3.5 uppercase text-[11px] tracking-wider text-right min-w-[110px]">
                Copertura
              </th>
              <th className="sticky top-0 z-20 bg-slate-900 text-slate-200 font-bold py-3 px-3.5 uppercase text-[11px] tracking-wider text-right min-w-[80px]">
                Like
              </th>
              <th className="sticky top-0 z-20 bg-slate-900 text-slate-200 font-bold py-3 px-3.5 uppercase text-[11px] tracking-wider text-right min-w-[95px]">
                Commenti
              </th>
              <th className="sticky top-0 z-20 bg-slate-900 text-slate-200 font-bold py-3 px-3.5 uppercase text-[11px] tracking-wider text-right min-w-[100px]">
                Salvi/Cond.
              </th>
              <th className="sticky top-0 z-20 bg-slate-900 text-slate-200 font-bold py-3 px-3.5 uppercase text-[11px] tracking-wider text-right min-w-[110px]">
                Interazioni
              </th>
              <th className="sticky top-0 z-20 bg-slate-900 text-slate-200 font-bold py-3 px-3.5 uppercase text-[11px] tracking-wider min-w-[110px]">
                Stato sync
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading && activeRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center py-10 text-slate-500">
                  Caricamento metriche…
                </td>
              </tr>
            ) : activeRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center py-10 text-slate-500 font-medium">
                  Nessun post permanente (Feed, Reel, Caroselli) pubblicato su questo social.
                </td>
              </tr>
            ) : (
              activeRows.map((row) => {
                const thumb = thumbUrl(row);
                const m = row.metrics;
                const views = m.views ?? m.impressions ?? 0;
                const reach = m.reach ?? 0;
                const likes = m.likes ?? 0;
                const comments = m.comments ?? 0;
                const savesOrShares = (m.shares ?? 0) + (m.saves ?? 0);
                const engagement = m.engagement ?? (likes + comments + savesOrShares);

                return (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 mx-auto">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[9px] text-slate-400 font-bold">
                            N/A
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-xs font-mono text-slate-600">
                      {fmtDate(row.publishedAt)}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                        {row.contentFormat}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 max-w-[240px]">
                      <p className="text-xs text-slate-700 line-clamp-2 leading-snug">
                        {row.copy}
                      </p>
                      {m.permalink ? (
                        <a
                          href={m.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:underline mt-1"
                        >
                          Apri post <ExternalLink size={10} />
                        </a>
                      ) : null}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-slate-800">
                      {fmt(views)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-slate-700">
                      {fmt(reach)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-slate-700">
                      {fmt(likes)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-slate-700">
                      {fmt(comments)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-slate-700">
                      {fmt(savesOrShares)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-slate-800">
                      {fmt(engagement)}
                    </td>
                    <td className="py-2.5 px-3">
                      {m.error ? (
                        <span className="text-[10px] font-semibold text-amber-700 leading-snug block max-w-[160px]">
                          {m.error}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-md">
                          {m.source === 'live' ? 'Live' : m.source === 'cached' ? 'Cache' : 'N/D'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
