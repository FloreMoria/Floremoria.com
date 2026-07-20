'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { toCampaignMediaProxyUrl } from '@/lib/dashboard/campaignMediaUrl';
import {
  Calendar,
  AlertCircle,
  CheckCircle2,
  Play,
  RefreshCw,
  Sparkles,
  Check,
  Image as ImageIcon,
  Layers,
  Clock,
  Trash2,
  Edit2,
  X,
  Save,
  Plus,
  Video,
  Upload,
  ArrowRight
} from 'lucide-react';

type Campaign = {
  id: string;
  status: 'DRAFT' | 'APPROVED' | 'PUBLISHED' | 'REJECTED';
  category: 'FF' | 'FT';
  targetChannel: 'META_INSTAGRAM' | 'META_FACEBOOK' | 'TIKTOK' | 'LINKEDIN' | 'YOUTUBE_SHORTS' | 'PINTEREST';
  contentFormat: 'FEED_POST' | 'STORY' | 'REEL';
  copy: string;
  imageUrl: string | null;
  videoUrl: string | null;
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
  { id: 'YOUTUBE_SHORTS', label: 'YT Shorts', icon: '▶️', color: 'from-red-600 to-rose-800' },
  { id: 'PINTEREST', label: 'Pinterest', icon: '📌', color: 'from-red-700 to-red-900' },
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

function parseImageUrl(imageUrl: string | null | undefined): string[] {
  if (!imageUrl) return [];
  const trimmed = imageUrl.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(url => String(url).trim()).filter(Boolean);
      }
    } catch (e) {
      // Prova a splittare per virgola in caso di errore
    }
  }
  if (trimmed.includes(',')) {
    return trimmed.split(',').map(url => url.trim()).filter(Boolean);
  }
  return [trimmed];
}

function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const lower = url.split('?')[0].toLowerCase();
  return lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.webm');
}

export default function CampaignsDashboardClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Tab iniziale da URL o default META_INSTAGRAM
  const initialTab = searchParams.get('tab') || 'META_INSTAGRAM';
  const [activeTab, setActiveTab] = useState(initialTab);
  
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeTheme, setActiveTheme] = useState('');
  const [manualThemeOverride, setManualThemeOverride] = useState('');
  const [isTikTokConnected, setIsTikTokConnected] = useState(false);
  const [tiktokPublishReady, setTiktokPublishReady] = useState(false);
  const [tiktokGrantedScopes, setTiktokGrantedScopes] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [themeLoading, setThemeLoading] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [selectedThemeOption, setSelectedThemeOption] = useState('automatic');
  const [customThemeText, setCustomThemeText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Stati per la modifica dei post esistenti
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCopy, setEditCopy] = useState('');
  const [editHashtags, setEditHashtags] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);

  // Stati per la creazione di un post manuale
  const [showModal, setShowModal] = useState(false);
  const [manualChannel, setManualChannel] = useState<'META_INSTAGRAM' | 'META_FACEBOOK' | 'TIKTOK' | 'LINKEDIN' | 'YOUTUBE_SHORTS' | 'PINTEREST'>('META_INSTAGRAM');
  const [manualFormat, setManualFormat] = useState<'FEED_POST' | 'STORY' | 'REEL'>('FEED_POST');
  const [manualCopy, setManualCopy] = useState('');
  const [manualHashtags, setManualHashtags] = useState('');
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modale pubblicazione TikTok (linee guida Direct Post API)
  const [showTiktokPublishModal, setShowTiktokPublishModal] = useState(false);
  const [tiktokPublishCampaignId, setTiktokPublishCampaignId] = useState<string | null>(null);
  const [tiktokCreatorLoading, setTiktokCreatorLoading] = useState(false);
  const [tiktokCreator, setTiktokCreator] = useState<{
    nickname: string;
    username: string;
    privacyLevelOptions: { value: string; label: string }[];
    commentDisabled: boolean;
    duetDisabled: boolean;
    stitchDisabled: boolean;
    maxVideoPostDurationSec: number;
    requiresPrivatePost: boolean;
  } | null>(null);
  const [tiktokPrivacyLevel, setTiktokPrivacyLevel] = useState('');
  const [tiktokAllowComment, setTiktokAllowComment] = useState(false);
  const [tiktokAllowDuet, setTiktokAllowDuet] = useState(false);
  const [tiktokAllowStitch, setTiktokAllowStitch] = useState(false);
  const [tiktokCommercialDisclosure, setTiktokCommercialDisclosure] = useState(false);
  const [tiktokBrandOrganic, setTiktokBrandOrganic] = useState(false);
  const [tiktokBrandContent, setTiktokBrandContent] = useState(false);
  const [tiktokMusicConsent, setTiktokMusicConsent] = useState(false);

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
        setIsTikTokConnected(data.isTikTokConnected || false);
        setTiktokPublishReady(data.tiktokPublishReady || false);
        setTiktokGrantedScopes(data.tiktokGrantedScopes || '');
        
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
    setEditingId(null); // Reset modifica se cambia scheda
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

  // Salvataggio Modifica Testi Campagna
  const handleSaveCampaignEdit = async (campaignId: string) => {
    setSaveLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    const tagsArray = editHashtags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    try {
      const res = await fetch('/api/dashboard/campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          copy: editCopy,
          hashtags: tagsArray,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage('Campagna modificata con successo!');
        // Aggiorna lo stato in locale
        setCampaigns(prev =>
          prev.map(c => (c.id === campaignId ? data.campaign : c))
        );
        setEditingId(null);
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        setErrorMessage(data.error || 'Errore nel salvataggio delle modifiche.');
      }
    } catch (err) {
      setErrorMessage('Errore di rete durante il salvataggio delle modifiche.');
    } finally {
      setSaveLoading(false);
    }
  };

  // Pubblicazione Manuale
  const resetTiktokPublishForm = (keepCampaignId = false) => {
    setTiktokPrivacyLevel('');
    setTiktokAllowComment(false);
    setTiktokAllowDuet(false);
    setTiktokAllowStitch(false);
    setTiktokCommercialDisclosure(false);
    setTiktokBrandOrganic(false);
    setTiktokBrandContent(false);
    setTiktokMusicConsent(false);
    setTiktokCreator(null);
    if (!keepCampaignId) {
      setTiktokPublishCampaignId(null);
    }
  };

  const openTiktokPublishModal = async (campaignId: string) => {
    setShowTiktokPublishModal(true);
    resetTiktokPublishForm(true);
    setTiktokPublishCampaignId(campaignId);
    setTiktokCreatorLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/dashboard/tiktok/creator-info');
      const data = await res.json();
      if (!data.success) {
        setErrorMessage(data.error || 'Impossibile recuperare le info creator TikTok.');
        setShowTiktokPublishModal(false);
        return;
      }
      setTiktokCreator(data.creator);
    } catch {
      setErrorMessage('Errore di rete durante il recupero profilo TikTok.');
      setShowTiktokPublishModal(false);
    } finally {
      setTiktokCreatorLoading(false);
    }
  };

  const executePublish = async (
    campaignId: string,
    tiktokUx?: {
      privacyLevel: string;
      allowComment: boolean;
      allowDuet: boolean;
      allowStitch: boolean;
      commercialDisclosure: boolean;
      brandOrganic: boolean;
      brandContent: boolean;
      musicUsageConsent: boolean;
    }
  ) => {
    setPublishingId(campaignId);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/dashboard/campaigns/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, tiktokUx }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage(
          data.simulated
            ? 'Pubblicazione simulata con successo (credenziali reali assenti).'
            : data.privatePost
              ? 'Post inviato a TikTok in modalità privata (Solo io). Potrebbe richiedere alcuni minuti per essere visibile sul profilo.'
              : 'Post pubblicato con successo sui canali ufficiali!'
        );
        setCampaigns(prev =>
          prev.map(c => (c.id === campaignId ? { ...c, status: 'PUBLISHED' as const } : c))
        );
        setTimeout(() => setSuccessMessage(null), 6000);
      } else {
        setErrorMessage(data.error || 'Errore durante la pubblicazione.');
      }
    } catch {
      setErrorMessage('Errore di rete durante la chiamata di pubblicazione.');
    } finally {
      setPublishingId(null);
    }
  };

  const handlePublishNow = async (campaignId: string) => {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (campaign?.targetChannel === 'TIKTOK') {
      await openTiktokPublishModal(campaignId);
      return;
    }
    await executePublish(campaignId);
  };

  const handleConfirmTiktokPublish = async () => {
    if (!tiktokPublishCampaignId) return;

    if (!tiktokPrivacyLevel) {
      setErrorMessage('Seleziona il livello di privacy prima di pubblicare su TikTok.');
      return;
    }
    if (!tiktokMusicConsent) {
      setErrorMessage('Devi accettare la Music Usage Confirmation di TikTok.');
      return;
    }
    if (tiktokCommercialDisclosure && !tiktokBrandOrganic && !tiktokBrandContent) {
      setErrorMessage('Se abiliti la disclosure commerciale, seleziona almeno una opzione.');
      return;
    }
    if (tiktokCommercialDisclosure && tiktokBrandContent && tiktokPrivacyLevel === 'SELF_ONLY') {
      setErrorMessage('I contenuti branded non possono essere pubblicati con visibilità "Solo io".');
      return;
    }

    setShowTiktokPublishModal(false);
    await executePublish(tiktokPublishCampaignId, {
      privacyLevel: tiktokPrivacyLevel,
      allowComment: tiktokAllowComment,
      allowDuet: tiktokAllowDuet,
      allowStitch: tiktokAllowStitch,
      commercialDisclosure: tiktokCommercialDisclosure,
      brandOrganic: tiktokBrandOrganic,
      brandContent: tiktokBrandContent,
      musicUsageConsent: tiktokMusicConsent,
    });
    resetTiktokPublishForm();
  };

  const tiktokPublishCampaign = tiktokPublishCampaignId
    ? campaigns.find(c => c.id === tiktokPublishCampaignId)
    : null;
  const tiktokPublishIsVideo = Boolean(
    tiktokPublishCampaign?.videoUrl ||
      tiktokPublishCampaign?.contentFormat === 'REEL'
  );
  const tiktokMusicDeclaration = tiktokBrandContent
    ? 'Pubblicando, accetti la Branded Content Policy e la Music Usage Confirmation di TikTok.'
    : 'Pubblicando, accetti la Music Usage Confirmation di TikTok.';

  // Caricamento del Post Manuale (handlePublishNow sopra)
  const handleCreateManualPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualFile || !manualCopy.trim()) {
      setErrorMessage('Assicurati di selezionare un file (foto o video) e scrivere il testo.');
      return;
    }

    setUploadProgress(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('file', manualFile);
    formData.append('channel', manualChannel);
    formData.append('contentFormat', manualFormat);
    formData.append('copy', manualCopy);
    formData.append('hashtags', manualHashtags);

    try {
      const res = await fetch('/api/dashboard/campaigns/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage('Nuovo post manuale creato ed approvato con successo!');
        setCampaigns(prev => [data.campaign, ...prev]);
        setShowModal(false);
        // Resetta i campi del form
        setManualCopy('');
        setManualHashtags('');
        setManualFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        // Forza tab sul social caricato per vederlo
        handleTabChange(manualChannel);
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        setErrorMessage(data.error || 'Errore nel caricamento del post.');
      }
    } catch (err) {
      setErrorMessage('Errore di connessione durante il caricamento del post.');
    } finally {
      setUploadProgress(false);
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
        <div className="flex gap-3 shrink-0 self-start md:self-auto">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs uppercase tracking-wider px-5 py-3 rounded-2xl transition-all active:scale-95 shadow-sm"
          >
            <Plus size={16} />
            Nuovo Post Manuale
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-4 py-3 rounded-2xl border border-slate-200 transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Aggiorna Coda
          </button>
        </div>
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

      {activeTab === 'TIKTOK' && (
        <div className="flex flex-col gap-3 animate-fade-in">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md">
            <div className="flex items-center gap-3">
              <span className="text-3xl shrink-0">🎵</span>
              <div>
                <h4 className="font-bold text-sm uppercase tracking-wider text-slate-100">Collegamento Account TikTok</h4>
                <p className="text-slate-400 text-xs mt-0.5 font-medium leading-relaxed">
                  {isTikTokConnected
                    ? tiktokPublishReady
                      ? 'Profilo connesso con permessi di pubblicazione (video.publish, video.upload).'
                      : 'Profilo connesso solo per login (user.info.basic). Per pubblicare serve una nuova autorizzazione con i permessi Content Posting.'
                    : 'Nessun account TikTok associato nel database. Connetti il profilo per abilitare la pubblicazione automatica e manuale.'}
                </p>
                {isTikTokConnected && tiktokGrantedScopes && (
                  <p className="text-slate-500 text-[10px] mt-1 font-mono">
                    Scope attivi: {tiktokGrantedScopes}
                  </p>
                )}
              </div>
            </div>
            <div className="shrink-0 flex flex-wrap gap-2">
              {isTikTokConnected ? (
                <>
                  {!tiktokPublishReady && (
                    <a
                      href="/api/dashboard/tiktok/auth"
                      className="bg-amber-400 hover:bg-amber-300 text-slate-900 font-bold text-xs uppercase tracking-wider px-5 py-3 rounded-2xl transition-all active:scale-95 inline-block text-center shadow-sm"
                    >
                      Riautorizza per pubblicare
                    </a>
                  )}
                  <button
                    onClick={async () => {
                      if (confirm('Sei sicuro di voler scollegare l\'account TikTok di FloreMoria?')) {
                        try {
                          const res = await fetch('/api/dashboard/tiktok/disconnect', { method: 'POST' });
                          const data = await res.json();
                          if (data.success) {
                            setIsTikTokConnected(false);
                            setTiktokPublishReady(false);
                            setTiktokGrantedScopes('');
                            setSuccessMessage('Account TikTok scollegato con successo.');
                            setTimeout(() => setSuccessMessage(null), 4000);
                          }
                        } catch (e) {
                          setErrorMessage('Errore durante lo scollegamento.');
                        }
                      }
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-wider px-5 py-3 rounded-2xl transition-all active:scale-95 shadow-sm"
                  >
                    Scollega Profilo
                  </button>
                </>
              ) : (
                <a
                  href="/api/dashboard/tiktok/auth"
                  className="bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs uppercase tracking-wider px-5 py-3 rounded-2xl transition-all active:scale-95 inline-block text-center shadow-sm"
                >
                  Connetti Profilo
                </a>
              )}
            </div>
          </div>
          {isTikTokConnected && !tiktokPublishReady && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl px-4 py-3 text-xs leading-relaxed">
              <strong>Pubblicazione non ancora abilitata sul token attuale.</strong> Sul portale TikTok gli scope{' '}
              <code className="font-mono bg-amber-100 px-1 rounded">video.publish</code> e{' '}
              <code className="font-mono bg-amber-100 px-1 rounded">video.upload</code> sono già configurati per
              l&apos;app, ma il profilo è stato collegato chiedendo solo{' '}
              <code className="font-mono bg-amber-100 px-1 rounded">user.info.basic</code>. Clicca{' '}
              <strong>Riautorizza per pubblicare</strong> e accetta tutti i permessi nella schermata TikTok.
            </div>
          )}
        </div>
      )}

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

                {/* VISUAL DI ANTEPRIMA (IMMAGINE O VIDEO) */}
                {(() => {
                  const videoSrc = toCampaignMediaProxyUrl(c.videoUrl);
                  if (videoSrc) {
                    return (
                      <div className="relative aspect-[16/9] w-full bg-slate-900 border-b border-slate-100 overflow-hidden flex items-center justify-center">
                        <video
                          src={videoSrc}
                          controls
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute top-3 left-3 bg-slate-900/80 px-2.5 py-1 rounded-lg text-[9px] font-black text-amber-400 uppercase flex items-center gap-1 shadow-sm">
                          <Video size={10} /> CONTENUTO VIDEO
                        </div>
                      </div>
                    );
                  }

                  const urls = parseImageUrl(c.imageUrl);
                  if (urls.length === 0) {
                    return (
                      <div className="aspect-[16/6] bg-slate-50 border-b border-slate-100 flex flex-col items-center justify-center gap-1 text-slate-400">
                        <ImageIcon size={20} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Nessun file multimediale</span>
                      </div>
                    );
                  }

                  if (urls.length === 1) {
                    const singleUrl = urls[0];
                    const proxiedUrl = toCampaignMediaProxyUrl(singleUrl);
                    if (isVideoUrl(singleUrl)) {
                      return (
                        <div className="relative aspect-[16/9] w-full bg-slate-900 border-b border-slate-100 overflow-hidden flex items-center justify-center">
                          <video
                            src={proxiedUrl || undefined}
                            controls
                            className="w-full h-full object-contain"
                          />
                          <div className="absolute top-3 left-3 bg-slate-900/80 px-2.5 py-1 rounded-lg text-[9px] font-black text-amber-400 uppercase flex items-center gap-1 shadow-sm">
                            <Video size={10} /> CONTENUTO VIDEO
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="relative aspect-[16/9] w-full bg-slate-50 border-b border-slate-50 group overflow-hidden">
                        <img
                          src={proxiedUrl || undefined}
                          alt={`Anteprima campagna ${c.targetChannel}`}
                          className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                        />
                        {c.imagePrompt && (
                          <div className="absolute inset-0 bg-slate-900/80 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 overflow-y-auto flex flex-col justify-center text-xs text-slate-200 leading-relaxed font-mono">
                            <span className="font-bold text-amber-400 mb-1 uppercase tracking-wide text-[10px]">Art Direction Prompt:</span>
                            {c.imagePrompt}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Carousel
                  return (
                    <div className="relative border-b border-slate-150 bg-slate-50 p-3">
                      <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto custom-scrollbar">
                        {urls.map((url, index) => {
                          const proxiedUrl = toCampaignMediaProxyUrl(url);
                          const isVideo = isVideoUrl(url);
                          return (
                            <div key={index} className="relative aspect-square bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                              {isVideo ? (
                                <video
                                  src={proxiedUrl || undefined}
                                  controls
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <img
                                  src={proxiedUrl || undefined}
                                  alt={`Anteprima ${index + 1}`}
                                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                                />
                              )}
                              <div className="absolute bottom-2 right-2 bg-slate-900/80 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm uppercase">
                                {isVideo ? 'Video' : `Foto ${index + 1}`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="absolute top-3 left-3 bg-slate-950 text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-md uppercase tracking-wider flex items-center gap-1">
                        <Layers size={10} className="text-fm-gold" /> Carosello ({urls.length} elementi)
                      </div>
                    </div>
                  );
                })()}

                {/* CONTENUTO DI TESTO (FLEX MODIFICA O VISUALIZZAZIONE) */}
                <div className="p-5 flex flex-col gap-4">
                  {editingId === c.id ? (
                    /* SEZIONE DI MODIFICA ATTIVA */
                    <div className="flex flex-col gap-3">
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                          Modifica Copy
                        </label>
                        <textarea
                          rows={6}
                          value={editCopy}
                          onChange={(e) => setEditCopy(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-sm font-medium text-slate-700 outline-none focus:border-slate-400 focus:bg-white transition-all resize-none"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                          Modifica Hashtags (separati da virgola)
                        </label>
                        <input
                          type="text"
                          value={editHashtags}
                          onChange={(e) => setEditHashtags(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-medium text-slate-700 outline-none focus:border-slate-400 focus:bg-white transition-all"
                          placeholder="es. floremoria, lutto, ricordo"
                        />
                      </div>
                      <div className="flex gap-2 justify-end mt-2">
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex items-center gap-1 text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all"
                        >
                          <X size={12} /> Annulla
                        </button>
                        <button
                          onClick={() => handleSaveCampaignEdit(c.id)}
                          disabled={saveLoading}
                          className="flex items-center gap-1 text-white bg-slate-800 hover:bg-slate-900 px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase transition-all disabled:opacity-50"
                        >
                          <Save size={12} /> {saveLoading ? 'Salvataggio...' : 'Salva'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* SEZIONE DI VISUALIZZAZIONE STANDARD */
                    <>
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                            Copy del Post
                          </span>
                          {c.status !== 'PUBLISHED' && (
                            <button
                              onClick={() => {
                                setEditingId(c.id);
                                setEditCopy(c.copy);
                                setEditHashtags(c.hashtags.join(', '));
                              }}
                              className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 shadow-sm"
                            >
                              <Edit2 size={11} /> Modifica
                            </button>
                          )}
                        </div>
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
                    </>
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
                      {editingId !== c.id && (
                        <span className="text-[10px] text-red-600 font-semibold italic mt-1">
                          💡 Suggerimento: clicca su "Modifica" sopra per correggere il testo seguendo le indicazioni.
                        </span>
                      )}
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
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-mono">
                    <CheckCircle2 size={12} /> Pubblicazione Completata
                  </span>
                )}
              </div>

            </div>
          ))}
        </div>
      )}

      {/* MODALE PUBBLICAZIONE TIKTOK (linee guida Direct Post API) */}
      {showTiktokPublishModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg p-6 shadow-xl max-h-[90vh] overflow-y-auto flex flex-col gap-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-150 pb-4">
              <div>
                <h3 className="font-display font-black text-slate-800 text-lg uppercase tracking-wide">
                  Pubblica su TikTok
                </h3>
                {tiktokCreator && (
                  <p className="text-xs text-slate-500 mt-1">
                    Account: <strong className="text-slate-700">{tiktokCreator.nickname}</strong>
                    {tiktokCreator.username ? ` (@${tiktokCreator.username})` : ''}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setShowTiktokPublishModal(false);
                  resetTiktokPublishForm();
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>

            {tiktokCreatorLoading ? (
              <div className="py-8 text-center text-slate-500 text-sm">Caricamento profilo creator...</div>
            ) : tiktokCreator ? (
              <>
                {tiktokCreator.requiresPrivatePost && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-3 py-2 text-xs leading-relaxed">
                    App in Sandbox/non verificata: TikTok consente solo post con visibilità <strong>Solo io</strong> fino all&apos;audit.
                  </div>
                )}

                {tiktokPublishCampaign && (
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs text-slate-600">
                    Anteprima testo: <span className="font-medium text-slate-800">{tiktokPublishCampaign.copy.slice(0, 120)}{tiktokPublishCampaign.copy.length > 120 ? '…' : ''}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Privacy *
                  </label>
                  <select
                    value={tiktokPrivacyLevel}
                    onChange={e => setTiktokPrivacyLevel(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-sm text-slate-800 outline-none focus:border-slate-400"
                  >
                    <option value="">— Seleziona visibilità —</option>
                    {tiktokCreator.privacyLevelOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Interazioni</span>
                  <label className={`flex items-center gap-2 text-sm ${tiktokCreator.commentDisabled ? 'opacity-50' : ''}`}>
                    <input
                      type="checkbox"
                      checked={tiktokAllowComment}
                      disabled={tiktokCreator.commentDisabled}
                      onChange={e => setTiktokAllowComment(e.target.checked)}
                    />
                    Consenti commenti
                  </label>
                  {tiktokPublishIsVideo && (
                    <>
                      <label className={`flex items-center gap-2 text-sm ${tiktokCreator.duetDisabled ? 'opacity-50' : ''}`}>
                        <input
                          type="checkbox"
                          checked={tiktokAllowDuet}
                          disabled={tiktokCreator.duetDisabled}
                          onChange={e => setTiktokAllowDuet(e.target.checked)}
                        />
                        Consenti Duet
                      </label>
                      <label className={`flex items-center gap-2 text-sm ${tiktokCreator.stitchDisabled ? 'opacity-50' : ''}`}>
                        <input
                          type="checkbox"
                          checked={tiktokAllowStitch}
                          disabled={tiktokCreator.stitchDisabled}
                          onChange={e => setTiktokAllowStitch(e.target.checked)}
                        />
                        Consenti Stitch
                      </label>
                    </>
                  )}
                </div>

                <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={tiktokCommercialDisclosure}
                      onChange={e => {
                        setTiktokCommercialDisclosure(e.target.checked);
                        if (!e.target.checked) {
                          setTiktokBrandOrganic(false);
                          setTiktokBrandContent(false);
                        }
                      }}
                    />
                    Disclosure contenuto commerciale
                  </label>
                  {tiktokCommercialDisclosure && (
                    <div className="pl-6 flex flex-col gap-1.5">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={tiktokBrandOrganic}
                          onChange={e => setTiktokBrandOrganic(e.target.checked)}
                        />
                        Your brand (contenuto promozionale)
                      </label>
                      <label className={`flex items-center gap-2 text-sm ${tiktokPrivacyLevel === 'SELF_ONLY' ? 'opacity-50' : ''}`}>
                        <input
                          type="checkbox"
                          checked={tiktokBrandContent}
                          disabled={tiktokPrivacyLevel === 'SELF_ONLY'}
                          onChange={e => setTiktokBrandContent(e.target.checked)}
                        />
                        Branded content (paid partnership)
                      </label>
                    </div>
                  )}
                </div>

                <label className="flex items-start gap-2 text-xs text-slate-600 border border-slate-200 rounded-xl p-3 bg-slate-50">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={tiktokMusicConsent}
                    onChange={e => setTiktokMusicConsent(e.target.checked)}
                  />
                  <span>{tiktokMusicDeclaration}</span>
                </label>

                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Dopo la pubblicazione, TikTok può impiegare alcuni minuti per elaborare il contenuto.
                </p>

                <button
                  type="button"
                  onClick={handleConfirmTiktokPublish}
                  disabled={publishingId !== null || !tiktokPrivacyLevel || !tiktokMusicConsent}
                  className="w-full bg-slate-900 hover:bg-black text-white font-bold text-xs uppercase tracking-wider py-3 rounded-xl transition-all disabled:opacity-50"
                >
                  {publishingId ? 'Invio in corso...' : 'Conferma e pubblica su TikTok'}
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* MODALE DI CARICAMENTO NUOVO POST MANUALE */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg p-6 shadow-xl max-h-[90vh] overflow-y-auto flex flex-col justify-between animate-scale-up">
            
            <div className="flex items-center justify-between border-b border-slate-150 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <Upload size={18} className="text-slate-700" />
                <h3 className="font-display font-black text-slate-800 text-lg uppercase tracking-wide">
                  Nuovo Post Manuale
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateManualPost} className="flex flex-col gap-4">
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">
                    Social Network *
                  </label>
                  <select
                    value={manualChannel}
                    onChange={(e) => setManualChannel(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400 transition-all"
                  >
                    {SOCIAL_TABS.map(tab => (
                      <option key={tab.id} value={tab.id}>
                        {tab.icon} {tab.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">
                    Formato Post *
                  </label>
                  <select
                    value={manualFormat}
                    onChange={(e) => setManualFormat(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400 transition-all"
                  >
                    <option value="FEED_POST">Feed Post (Standard)</option>
                    <option value="STORY">Story (Verticale)</option>
                    <option value="REEL">Reel (Video)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">
                  Seleziona File (Foto o Video) *
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-slate-400 rounded-2xl p-6 text-center cursor-pointer bg-slate-50 hover:bg-slate-100/50 transition-all flex flex-col items-center justify-center gap-1.5"
                >
                  <Upload className="text-slate-400" size={24} />
                  <span className="text-xs font-bold text-slate-700">
                    {manualFile ? manualFile.name : 'Trascina o clicca per caricare foto/video'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    Supporta PNG, JPG, WEBP, MP4, MOV (max 50MB)
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setManualFile(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">
                  Copy del Post *
                </label>
                <textarea
                  rows={4}
                  value={manualCopy}
                  onChange={(e) => setManualCopy(e.target.value)}
                  placeholder="Scrivi il corpo del post, dettagli del servizio, inviti all'azione o link..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-sm font-medium text-slate-700 outline-none focus:border-slate-400 focus:bg-white transition-all resize-none"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">
                  Hashtags (separati da virgola, es: floremoria, lutto)
                </label>
                <input
                  type="text"
                  value={manualHashtags}
                  onChange={(e) => setManualHashtags(e.target.value)}
                  placeholder="es. floremoria, fiori, ricordo"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-medium text-slate-700 outline-none focus:border-slate-400 focus:bg-white transition-all"
                />
              </div>

              <div className="flex gap-2 justify-end border-t border-slate-150 pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all"
                >
                  Chiudi
                </button>
                <button
                  type="submit"
                  disabled={uploadProgress}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {uploadProgress ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" /> Caricamento...
                    </>
                  ) : (
                    <>
                      Carica e Approva <ArrowRight size={12} />
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
