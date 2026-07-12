'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Calendar,
  AlertCircle,
  CheckCircle2,
  Play,
  RefreshCw,
  Sparkles,
  Check,
  Image as ImageIcon,
  Heart,
  Briefcase,
  Layers,
  Clock,
  Eye,
  Trash2
} from 'lucide-react';

type Campaign = {
  id: string;
  status: 'DRAFT' | 'APPROVED' | 'PUBLISHED' | 'REJECTED';
  category: 'FF' | 'FT';
  targetChannel: 'META_INSTAGRAM' | 'META_FACEBOOK' | 'TIKTOK' | 'LINKEDIN';
  contentFormat: 'FEED_POST' | 'STORY' | 'REEL';
  copy: string;
  imageUrl: string | null;
  imagePrompt: string | null;
  hashtags: string[];
  rejectionReason: string | null;
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
};

const SOCIAL_TABS = [
  { id: 'META_INSTAGRAM', label: 'Instagram', icon: '📸', color: 'from-pink-500 to-purple-600' },
  { id: 'META_FACEBOOK', label: 'Facebook', icon: '👥', color: 'from-blue-600 to-indigo-700' },
  { id: 'TIKTOK', label: 'TikTok', icon: '🎵', color: 'from-slate-900 to-black' },
  { id: 'LINKEDIN', label: 'LinkedIn', icon: '💼', color: 'from-blue-700 to-cyan-800' }
];

const PREDEFINED_THEMES = [
  { value: 'automatic', label: '✨ Tema Automatico (Calcolato da Calendario)' },
  { value: 'Commemorazione dei Defunti (Giorno dei Morti) - Ricordo solenne, rispetto profondo, vicinanza emotiva, commemorazione dei propri cari.', label: '💀 Giorno dei Morti (25 Ott - 3 Nov)' },
  { value: 'Natale e Ricordo Familiare - Calore degli affetti passati, legame invisibile che supera la distanza, dolce nostalgia e presenza.', label: '🎄 Natale e Ricordo (10 Dic - 27 Dic)' },
  { value: 'Festa della Mamma - Ricordo materno, dolcezza infinita, gratitudine eterna, il legame indissolubile con la madre.', label: '🌸 Festa della Mamma (1 Mag - 15 Mag)' },
  { value: 'Festa del Papà - Guida silenziosa, forza del ricordo, rispetto e gratitudine per la figura paterna.', label: '👨 Festa del Papà (15 Mar - 22 Mar)' },
  { value: 'custom', label: '⚙️ Tema Personalizzato (Digita manualmente)' }
];

export default function CampaignsDashboardClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Tab iniziale da URL o default META_INSTAGRAM
  const initialTab = searchParams.get('tab') || 'META_INSTAGRAM';
  const [activeTab, setActiveTab] = useState(initialTab);
  
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeTheme, setActiveTheme] = useState('');
  const [manualThemeOverride, setManualThemeOverride] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [themeLoading, setThemeLoading] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [selectedThemeOption, setSelectedThemeOption] = useState('automatic');
  const [customThemeText, setCustomThemeText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch dati iniziali
  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/campaigns');
      const data = await res.json();
      if (data.success) {
        setCampaigns(data.campaigns);
        setActiveTheme(data.activeTheme);
        setManualThemeOverride(data.manualThemeOverride);
        
        // Risolvi opzione tema selezionato
        if (!data.manualThemeOverride) {
          setSelectedThemeOption('automatic');
        } else {
          const matched = PREDEFINED_THEMES.find(t => t.value === data.manualThemeOverride);
          if (matched) {
            setSelectedThemeOption(data.manualThemeOverride);
          } else {
            setSelectedThemeOption('custom');
            setCustomThemeText(data.manualThemeOverride);
          }
        }
      }
    } catch (err) {
      console.error('Failed fetching campaigns data:', err);
      setErrorMessage('Errore nel recupero dei dati dal server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Sincronizza tab se cambia URL search param
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && SOCIAL_TABS.some(t => t.id === tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Gestione cambio tab
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    // Aggiorna URL query param senza ricaricare
    const params = new URLSearchParams(window.location.search);
    params.set('tab', tabId);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // Salvataggio Tema
  const handleSaveTheme = async () => {
    setThemeLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    
    let targetTheme = '';
    if (selectedThemeOption === 'custom') {
      targetTheme = customThemeText;
    } else if (selectedThemeOption !== 'automatic') {
      targetTheme = selectedThemeOption;
    }

    try {
      const res = await fetch('/api/dashboard/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: targetTheme }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveTheme(data.activeTheme);
        setManualThemeOverride(data.manualThemeOverride);
        setSuccessMessage('Tema editoriale salvato con successo!');
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        setErrorMessage(data.error || 'Errore nel salvataggio del tema.');
      }
    } catch (err) {
      setErrorMessage('Errore di connessione durante il salvataggio.');
    } finally {
      setThemeLoading(false);
    }
  };

  // Pubblicazione Manuale
  const handlePublishNow = async (campaignId: string) => {
    setPublishingId(campaignId);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/dashboard/campaigns/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage(
          data.simulated
            ? 'Pubblicazione simulata con successo (credenziali reali assenti).'
            : 'Post pubblicato con successo sui canali ufficiali!'
        );
        // Aggiorna lo stato in locale
        setCampaigns(prev =>
          prev.map(c => (c.id === campaignId ? { ...c, status: 'PUBLISHED' as const } : c))
        );
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        setErrorMessage(data.error || 'Errore durante la pubblicazione.');
      }
    } catch (err) {
      setErrorMessage('Errore di rete durante la chiamata di pubblicazione.');
    } finally {
      setPublishingId(null);
    }
  };

  // Filtra campagne per canale e stato
  const filteredCampaigns = campaigns.filter(c => {
    if (c.targetChannel !== activeTab) return false;
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
    return true;
  });

  const getStatusBadge = (status: Campaign['status']) => {
    switch (status) {
      case 'PUBLISHED':
        return (
          <span className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700">
            <CheckCircle2 size={13} className="text-blue-500" /> PUBBLICATO
          </span>
        );
      case 'APPROVED':
        return (
          <span className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
            <Check size={13} className="text-emerald-500" /> APPROVATO
          </span>
        );
      case 'REJECTED':
        return (
          <span className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full bg-red-50 border border-red-200 text-red-700">
            <AlertCircle size={13} className="text-red-500" /> RIFIUTATO
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600">
            <Clock size={13} className="text-slate-400" /> BOZZA (DRAFT)
          </span>
        );
    }
  };

  const getCategoryBadge = (category: Campaign['category']) => {
    return category === 'FF' ? (
      <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 uppercase">
        Funerale (FF)
      </span>
    ) : (
      <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 uppercase">
        Tombale (FT)
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-6 fade-in">
      
      {/* HEADER DI PAGINA */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm">
        <div>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">
            Command Center
          </span>
          <h1 className="font-display font-bold text-2xl md:text-3xl text-slate-800 uppercase tracking-wide">
            Social Media & Campagne
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Gestisci la pianificazione, monitora i checkpoint dei Guardiani e controlla i temi editoriali.
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-4 py-2.5 rounded-2xl border border-slate-200 transition-all active:scale-95 disabled:opacity-50 shrink-0 self-start md:self-auto"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Aggiorna Coda
        </button>
      </div>

      {/* ALERT DI SUCCESSO E ERRORE */}
      {successMessage && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl shadow-sm animate-slide-up">
          <CheckCircle2 className="text-emerald-500 shrink-0" size={20} />
          <span className="text-sm font-semibold">{successMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-800 p-4 rounded-2xl shadow-sm animate-slide-up">
          <AlertCircle className="text-red-500 shrink-0" size={20} />
          <span className="text-sm font-semibold">{errorMessage}</span>
        </div>
      )}

      {/* PANNELLO DI CONTROLLO DEL TEMA EDITORIALE */}
      <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="text-amber-500" size={22} />
          <h3 className="font-display font-bold text-lg text-slate-800 uppercase tracking-wide">
            Tema Editoriale Attivo
          </h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col justify-between p-5 bg-white border border-slate-100 rounded-2xl">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                TEMA ATTIVATO SULL\'ALGORITMO
              </span>
              <div className="font-display font-bold text-slate-800 text-lg leading-relaxed">
                {activeTheme || 'Generazione Standard FloreMoria'}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Stato di configurazione:</span>
              {manualThemeOverride ? (
                <span className="font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100">
                  ⚠️ Sovrascrittura manuale attiva
                </span>
              ) : (
                <span className="font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                  ✨ Risoluzione automatica del calendario
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 p-5 bg-white border border-slate-100 rounded-2xl justify-between">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Imposta tema manualmente
              </label>
              <select
                value={selectedThemeOption}
                onChange={(e) => setSelectedThemeOption(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-medium text-slate-700 outline-none focus:border-slate-400 focus:bg-white transition-all"
              >
                {PREDEFINED_THEMES.map(theme => (
                  <option key={theme.value} value={theme.value}>
                    {theme.label}
                  </option>
                ))}
              </select>

              {selectedThemeOption === 'custom' && (
                <input
                  type="text"
                  placeholder="Scrivi qui il tema personalizzato..."
                  value={customThemeText}
                  onChange={(e) => setCustomThemeText(e.target.value)}
                  className="w-full mt-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-medium text-slate-700 outline-none focus:border-slate-400 focus:bg-white transition-all"
                />
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={handleSaveTheme}
                disabled={themeLoading}
                className="flex-1 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold uppercase tracking-wider py-3 px-4 rounded-xl transition-all disabled:opacity-50"
              >
                {themeLoading ? 'Salvataggio...' : 'Applica Tema'}
              </button>
              {manualThemeOverride && (
                <button
                  onClick={async () => {
                    setSelectedThemeOption('automatic');
                    setCustomThemeText('');
                    setThemeLoading(true);
                    try {
                      const res = await fetch('/api/dashboard/campaigns', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ theme: '' }),
                      });
                      const data = await res.json();
                      if (data.success) {
                        setActiveTheme(data.activeTheme);
                        setManualThemeOverride('');
                        setSuccessMessage('Tema automatico ripristinato!');
                        setTimeout(() => setSuccessMessage(null), 4000);
                      }
                    } catch (e) {
                      setErrorMessage('Errore nel ripristino del tema.');
                    } finally {
                      setThemeLoading(false);
                    }
                  }}
                  disabled={themeLoading}
                  className="bg-red-50 hover:bg-red-100 text-red-600 p-3 rounded-xl border border-red-100 transition-all"
                  title="Resetta a tema automatico"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* TABS PER SOCIAL */}
      <div className="flex border-b border-slate-200 overflow-x-auto gap-1 scrollbar-none">
        {SOCIAL_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex items-center gap-2 px-5 py-4 border-b-2 font-display font-bold text-sm tracking-wide transition-all uppercase whitespace-nowrap active:scale-95 ${
              activeTab === tab.id
                ? 'border-slate-800 text-slate-800 bg-slate-50/50'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* FILTRI DI STATO */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 bg-slate-100/80 border border-slate-200/60 p-1 rounded-2xl">
          {['ALL', 'APPROVED', 'PUBLISHED', 'REJECTED', 'DRAFT'].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`text-xs font-bold uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all ${
                statusFilter === status
                  ? 'bg-white text-slate-800 shadow-sm border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {status === 'ALL' ? 'Tutti' : status === 'DRAFT' ? 'Bozza' : status.toLowerCase()}
            </button>
          ))}
        </div>

        <div className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-3.5 py-2.5 rounded-full shadow-sm">
          Trovati <span className="text-slate-800 font-extrabold">{filteredCampaigns.length}</span> post
        </div>
      </div>

      {/* LISTA CAMPAGNE GRID */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <RefreshCw className="animate-spin text-slate-400" size={32} />
          <span className="text-slate-500 font-medium text-sm">Caricamento coda campagne...</span>
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-sm">
          <Layers className="text-slate-300 mx-auto mb-4" size={48} />
          <h4 className="font-bold text-slate-700 text-lg uppercase mb-1">Nessuna Campagna Trovata</h4>
          <p className="text-slate-400 text-sm max-w-md mx-auto">
            Non ci sono post con lo stato selezionato per questo social in archivio. Il cron automatico genererà nuove campagne al prossimo ciclo.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredCampaigns.map(c => (
            <div
              key={c.id}
              className={`bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between h-full ${
                c.status === 'REJECTED' ? 'border-red-200' : ''
              }`}
            >
              <div>
                
                {/* CARD HEADER */}
                <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black tracking-widest text-slate-400 uppercase">
                        {c.contentFormat}
                      </span>
                      {getCategoryBadge(c.category)}
                    </div>
                    {c.scheduledFor && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono font-bold">
                        <Calendar size={10} /> {new Date(c.scheduledFor).toLocaleDateString('it-IT')}
                      </span>
                    )}
                  </div>
                  {getStatusBadge(c.status)}
                </div>

                {/* IMAGINE ANTEPRIMA (IMAGEN) */}
                {c.imageUrl ? (
                  <div className="relative aspect-[16/9] w-full bg-slate-50 border-b border-slate-50 group overflow-hidden">
                    <img
                      src={c.imageUrl}
                      alt={c.imagePrompt || 'Social image'}
                      className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                    />
                    {c.imagePrompt && (
                      <div className="absolute inset-0 bg-slate-900/80 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 overflow-y-auto flex flex-col justify-center text-xs text-slate-200 leading-relaxed font-mono">
                        <span className="font-bold text-amber-400 mb-1 uppercase tracking-wide text-[10px]">Art Direction Prompt:</span>
                        {c.imagePrompt}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="aspect-[16/6] bg-slate-50 border-b border-slate-100 flex flex-col items-center justify-center gap-1 text-slate-400">
                    <ImageIcon size={20} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Nessuna immagine generata</span>
                  </div>
                )}

                {/* CONTENUTO DI TESTO */}
                <div className="p-5 flex flex-col gap-4">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                      Copy del Post
                    </span>
                    <p className="text-slate-700 text-sm whitespace-pre-line leading-relaxed font-medium">
                      {c.copy}
                    </p>
                  </div>

                  {c.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {c.hashtags.map(tag => (
                        <span key={tag} className="text-xs font-semibold text-slate-500">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* BOX DI ERRORE GUARDIANI (REJECTED) */}
                  {c.status === 'REJECTED' && c.rejectionReason && (
                    <div className="bg-red-50 border border-red-200/60 rounded-2xl p-4 flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 text-red-800 font-bold text-xs uppercase tracking-wide">
                        <AlertCircle size={14} className="text-red-600" />
                        Checkpoint Bocciato dai Guardiani
                      </div>
                      <p className="text-red-700 text-xs leading-relaxed font-semibold">
                        {c.rejectionReason}
                      </p>
                    </div>
                  )}
                </div>

              </div>

              {/* CARD FOOTER CON AZIONI */}
              <div className="p-5 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between gap-4 mt-auto">
                <span className="text-[10px] font-mono text-slate-400">
                  ID: {c.id.slice(0, 8)}...
                </span>
                
                {c.status === 'APPROVED' && (
                  <button
                    onClick={() => handlePublishNow(c.id)}
                    disabled={publishingId !== null}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs uppercase tracking-wider py-2.5 px-4 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                  >
                    {publishingId === c.id ? (
                      <>
                        <RefreshCw size={12} className="animate-spin" /> Invio...
                      </>
                    ) : (
                      <>
                        <Play size={12} /> Pubblica Ora
                      </>
                    )}
                  </button>
                )}
                {c.status === 'PUBLISHED' && (
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                    <CheckCircle2 size={12} /> Pubblicazione Completata
                  </span>
                )}
              </div>

            </div>
          ))}
        </div>
      )}

    </div>
  );
}
