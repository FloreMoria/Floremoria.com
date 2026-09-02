'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, MessageCircle, AlertCircle, Camera, Check, ShieldCheck, Mail, Send, Activity, CheckCheck, Image as ImageIcon, X, Bot, User as UserIcon, Ban, Trash2, Search, SlidersHorizontal, Users, CheckCircle2, MessageSquarePlus, ArrowLeft, Paperclip, Forward, Loader2, Smartphone, Wifi, RefreshCw, Cloud, AlertTriangle, Clock, Heart } from 'lucide-react';
import NewConversationModal from '@/components/dashboard/NewConversationModal';
import StaffPushNotifications from '@/components/dashboard/StaffPushNotifications';
import ChatMessageMedia from '@/components/dashboard/ChatMessageMedia';
import { useEdgeSwipeBack } from '@/lib/dashboard/useEdgeSwipeBack';
import { formatDeceasedName } from '@/lib/utils/formatDeceasedName';
import { formatPersonName } from '@/lib/utils/formatPersonName';
import { dashboardJsonFetcher, useDashboardLive } from '@/hooks/useDashboardLive';

function formatMessageTimestamp(createdAtStr?: string, fallback?: string): string {
  const now = new Date();
  const dayNow = String(now.getDate()).padStart(2, '0');
  const monthNow = String(now.getMonth() + 1).padStart(2, '0');
  const yearNow = now.getFullYear();
  const todayDateStr = `${dayNow}-${monthNow}-${yearNow}`;

  if (!createdAtStr) {
    if (!fallback || fallback.trim() === '') {
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      return `${todayDateStr} | ${hh}:${mm}`;
    }
    const cleanFallback = fallback.trim();
    if (cleanFallback.includes('|')) return cleanFallback;
    if (/^\d{2}:\d{2}$/.test(cleanFallback)) return `${todayDateStr} | ${cleanFallback}`;
    if (cleanFallback.toLowerCase() === 'oggi') {
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      return `${todayDateStr} | ${hh}:${mm}`;
    }
    return `${todayDateStr} | ${cleanFallback}`;
  }

  try {
    const d = new Date(createdAtStr);
    if (isNaN(d.getTime())) {
      if (fallback?.includes('|')) return fallback;
      if (fallback && /^\d{2}:\d{2}$/.test(fallback.trim())) return `${todayDateStr} | ${fallback.trim()}`;
      return fallback || todayDateStr;
    }
    const formatter = new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Europe/Rome',
    });
    
    const parts = formatter.formatToParts(d);
    const day = parts.find(p => p.type === 'day')?.value || '00';
    const month = parts.find(p => p.type === 'month')?.value || '00';
    const year = parts.find(p => p.type === 'year')?.value || '0000';
    const hour = parts.find(p => p.type === 'hour')?.value || '00';
    const minute = parts.find(p => p.type === 'minute')?.value || '00';
    
    return `${day}-${month}-${year} | ${hour}:${minute}`;
  } catch (err) {
    console.error('Error formatting time:', err);
    return fallback || todayDateStr;
  }
}

export default function CommunicationsHubClient({ initialProofs, isDashboardAdmin }: { initialProofs?: any[]; isDashboardAdmin?: boolean }) {
  const [activeTab, setActiveTab] = useState('visione');
  const { data: sessionsPayload, isLoading } = useDashboardLive<{
    success?: boolean;
    sessions?: any[];
  }>('/api/dashboard/communications', dashboardJsonFetcher, 'chat');

  const [sessions, setSessions] = useState<any[]>([]);
  useEffect(() => {
    if (sessionsPayload?.success && Array.isArray(sessionsPayload.sessions)) {
      setSessions(sessionsPayload.sessions);
    }
  }, [sessionsPayload]);

  const loading = isLoading && sessions.length === 0;

  const tabs = [
    { id: 'visione', label: 'Monitoraggio Live', icon: Eye },
    { id: 'controllo', label: 'Analytics Consegne', icon: Activity },
    { id: 'manutenzione', label: 'Blacklist & Filtri', icon: Ban },
  ];

  return (
    <div className="space-y-6 md:space-y-12 max-w-full min-w-0 overflow-x-hidden">
      <div className="bg-white rounded-none md:rounded-[32px] shadow-none md:shadow-[0_8px_30px_rgb(0,0,0,0.04)] border-y md:border border-[#EAE3D9] overflow-hidden font-body max-w-full -mx-4 md:mx-0">
        <div className="px-3 pt-3 md:px-8 md:pt-8">
          <StaffPushNotifications />
        </div>
        {/* TABS HEADER */}
        <div className="flex border-b border-[#EAE3D9] overflow-x-auto scrollbar-hide">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-[130px] md:min-w-[200px] py-3.5 md:py-6 px-3 md:px-6 font-display font-semibold transition-all flex items-center justify-center gap-2 md:gap-3 border-b-[3px] text-xs md:text-base
                ${isActive ? 'border-[#C0A062] text-[#B89F78] bg-[#FDFCF9]' : 'border-transparent text-[#6F6F6F] hover:text-[#4A4A4A] hover:bg-[#FAF8F5]'}`}
              >
                <Icon className="w-4.5 h-4.5 md:w-5 md:h-5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* CONTENT AREA */}
        <div className="p-0 md:p-8 lg:p-12 min-h-[500px] md:min-h-[650px] bg-white">
          {activeTab === 'visione' && (
            <VisioneTab 
              sessions={sessions} 
              setSessions={setSessions}
              loading={loading}
            />
          )}
          {activeTab === 'controllo' && (
            <div className="p-4 md:p-0">
              <ControlloTab />
            </div>
          )}
          {activeTab === 'manutenzione' && (
            <div className="p-4 md:p-0">
              <ManutenzioneTab />
            </div>
          )}
        </div>
      </div>

      {isDashboardAdmin && <WhatsAppSetupSection />}
    </div>
  );
}

// -------------------------------------------------------------
// 1. VISIONE (Monitoring Workspace WhatsApp Style)
// -------------------------------------------------------------
function VisioneTab({ 
  sessions, 
  setSessions, 
  loading 
}: { 
  sessions: any[]; 
  setSessions: React.Dispatch<React.SetStateAction<any[]>>; 
  loading: boolean;
}) {
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'CLIENT' | 'FLORIST'>('ALL');
  const [sending, setSending] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [forwardSource, setForwardSource] = useState<{ mediaUrl: string; fromPhone: string } | null>(null);
  const [forwardSearch, setForwardSearch] = useState('');
  const [forwarding, setForwarding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Find the currently active chat
  const activeChat = sessions.find(s => s.phone === activeChatId) || null;

  const handleSwipeBack = useCallback(() => {
    if (activeChatId) {
      setActiveChatId(null);
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    }
  }, [activeChatId, router]);

  useEdgeSwipeBack(handleSwipeBack, true);

  const closeActiveChat = useCallback(() => {
    setActiveChatId(null);
  }, []);

  // Scroll to bottom of chat when active chat or messages change without shifting the outer page
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [activeChat?.messages?.length]);

  const renderStatus = (status: string, direction: string) => {
    if (direction === 'OUTBOUND') {
      return <CheckCheck className="w-[15px] h-[15px] text-[#34B7F1]" />;
    }
    if (status === 'HUMAN_INTERVENTION') {
      return <AlertCircle className="w-[15px] h-[15px] text-red-500" />;
    }
    return <Check className="w-[15px] h-[15px] text-gray-400" />;
  };

  const toggleStatus = async (phone: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'AI_ACTIVE' ? 'HUMAN_INTERVENTION' : 'AI_ACTIVE';
    try {
      const res = await fetch('/api/dashboard/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, action: 'updateStatus', status: nextStatus })
      });
      const data = await res.json();
      if (data.success) {
        setSessions(prev => prev.map(s => s.phone === phone ? { ...s, status: nextStatus } : s));
      }
    } catch (err) {
      console.error('Error toggling status:', err);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeChatId || sending) return;

    setSending(true);
    const textToSend = inputText;
    setInputText('');

    try {
      // Invio staff: se VERA era attiva, passa subito a controllo umano.
      if (activeChat?.status === 'AI_ACTIVE') {
        await fetch('/api/dashboard/communications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: activeChatId, action: 'updateStatus', status: 'HUMAN_INTERVENTION' }),
        });
      }

      const res = await fetch('/api/dashboard/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: activeChatId, action: 'sendMessage', messageText: textToSend })
      });
      const data = await res.json();
      if (data.success) {
        setSessions(prev => prev.map(s => s.phone === activeChatId ? { ...data.session, status: 'HUMAN_INTERVENTION' } : s));
      } else if (data.requiresTemplate) {
        alert(data.error || 'Finestra 24h scaduta: avvii una nuova conversazione con template WhatsApp.');
        setInputText(textToSend);
      } else {
        alert(data.error || 'Invio non riuscito.');
        setInputText(textToSend);
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setInputText(textToSend);
    } finally {
      setSending(false);
    }
  };

  const handleAttachPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeChatId || uploadingPhoto) return;

    if (!file.type.startsWith('image/')) {
      alert('Seleziona un file immagine (JPG, PNG, WebP, HEIC).');
      return;
    }

    setUploadingPhoto(true);
    const caption = inputText;
    try {
      const form = new FormData();
      form.append('phone', activeChatId);
      form.append('caption', caption);
      form.append('file', file);

      const res = await fetch('/api/dashboard/communications/media', { method: 'POST', body: form });
      const data = await res.json();
      if (data.success) {
        setSessions(prev => prev.map(s => (s.phone === activeChatId ? { ...data.session, status: 'HUMAN_INTERVENTION' } : s)));
        setInputText('');
      } else if (data.requiresTemplate) {
        alert(data.error || 'Finestra 24h scaduta: non è stato possibile inviare la foto.');
      } else {
        alert(data.error || 'Invio foto non riuscito.');
      }
    } catch (err) {
      console.error('Error uploading photo:', err);
      alert('Errore di rete durante l\'invio della foto.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleForwardTo = async (targetPhone: string) => {
    if (!forwardSource || forwarding) return;
    setForwarding(true);
    try {
      const res = await fetch('/api/dashboard/communications/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPhone, mediaUrl: forwardSource.mediaUrl }),
      });
      const data = await res.json();
      if (data.success) {
        setSessions(prev => prev.map(s => (s.phone === data.session?.phone ? data.session : s)));
        setForwardSource(null);
        setForwardSearch('');
        setActiveChatId(data.session?.phone || targetPhone);
      } else if (data.requiresTemplate) {
        alert(data.error || 'La chat destinazione è fuori dalla finestra 24h: usa una nuova conversazione con template.');
      } else {
        alert(data.error || 'Inoltro non riuscito.');
      }
    } catch (err) {
      console.error('Error forwarding photo:', err);
      alert('Errore di rete durante l\'inoltro.');
    } finally {
      setForwarding(false);
    }
  };

  const renderLinkedMessage = (text: string): React.ReactNode => {
    if (!text) return null;
    const parts = text.split(/(https?:\/\/[^\s]+)/g);
    return parts.map((part, idx) => {
      if (/^https?:\/\/[^\s]+$/.test(part)) {
        return (
          <a
            key={`${part}-${idx}`}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="text-[#0B57D0] underline break-all font-medium hover:text-[#00A884] transition-colors"
          >
            {part}
          </a>
        );
      }
      return <React.Fragment key={`txt-${idx}`}>{part}</React.Fragment>;
    });
  };

  // Filter and Search logic
  const filteredSessions = sessions.filter(chat => {
    const matchesSearch = 
      chat.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chat.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chat.subtitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chat.shopName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chat.phone?.includes(searchQuery);

    if (!matchesSearch) return false;

    if (filterType === 'CLIENT') {
      return chat.userType === 'UTENTE' || chat.userType === 'UNKNOWN';
    }
    if (filterType === 'FLORIST') {
      return chat.userType === 'FLORIST';
    }
    return true;
  });

  const humanInterventionsCount = sessions.filter(s => s.status === 'HUMAN_INTERVENTION' && (s.userType === 'UTENTE' || s.userType === 'UNKNOWN')).length;

  const handleConversationStarted = (session: Record<string, unknown>) => {
    setSessions((prev) => {
      const phone = String(session.phone || '');
      const without = prev.filter((item) => item.phone !== phone);
      return [session, ...without];
    });
    setActiveChatId(String(session.phone || ''));
  };

  return (
    <div className="animate-in fade-in duration-300">
      <NewConversationModal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        onConversationStarted={handleConversationStarted}
      />

      {forwardSource && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => !forwarding && setForwardSource(null)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-[#EAE3D9] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#EAE3D9] bg-[#FAF8F5]">
              <h4 className="font-display font-bold text-[#111B21] flex items-center gap-2">
                <Forward className="w-4.5 h-4.5 text-[#00A884]" />
                Inoltra foto a…
              </h4>
              <button type="button" onClick={() => !forwarding && setForwardSource(null)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            <div className="p-4 border-b border-[#EAE3D9]">
              <div className="relative">
                <input
                  type="text"
                  value={forwardSearch}
                  onChange={(e) => setForwardSearch(e.target.value)}
                  placeholder="Cerca la chat di destinazione..."
                  className="w-full bg-white rounded-xl pl-9 pr-4 py-2.5 text-sm border border-[#EAE3D9] focus:outline-none focus:border-[#C0A062]"
                />
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              </div>
            </div>
            <div className="max-h-[50vh] overflow-y-auto divide-y divide-gray-50 custom-scrollbar">
              {sessions
                .filter(s => s.phone !== forwardSource.fromPhone)
                .filter(s =>
                  s.name?.toLowerCase().includes(forwardSearch.toLowerCase()) ||
                  s.displayName?.toLowerCase().includes(forwardSearch.toLowerCase()) ||
                  s.subtitle?.toLowerCase().includes(forwardSearch.toLowerCase()) ||
                  s.phone?.includes(forwardSearch)
                )
                .map(s => (
                  <button
                    key={s.phone}
                    type="button"
                    disabled={forwarding}
                    onClick={() => handleForwardTo(s.phone)}
                    className="w-full flex items-center gap-3 p-3.5 hover:bg-[#FAF8F5] text-left transition-colors disabled:opacity-50"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#EAE3D9] to-[#DFDFDF] flex items-center justify-center font-display font-semibold text-gray-700 flex-shrink-0 border border-gray-200">
                      {s.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-display font-semibold text-[14px] text-[#111B21] truncate">{s.displayName || s.name}</span>
                        {s.userType === 'FLORIST' && (
                          <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 rounded border border-emerald-100 font-bold uppercase">Fiorista</span>
                        )}
                      </div>
                      <span className="block text-[11px] text-[#667781] truncate">
                        {s.subtitle || s.phone.replace('whatsapp:', '')}
                      </span>
                    </div>
                    {forwarding ? <Loader2 className="w-4 h-4 animate-spin text-[#00A884]" /> : <Forward className="w-4 h-4 text-[#00A884]" />}
                  </button>
                ))}
              {sessions.filter(s => s.phone !== forwardSource.fromPhone).length === 0 && (
                <div className="p-6 text-center text-sm text-gray-400">Nessun'altra chat disponibile.</div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="flex border-0 md:border border-[#EAE3D9] rounded-none md:rounded-3xl overflow-hidden h-[calc(100dvh-110px)] min-h-[440px] md:h-[680px] bg-[#FAF9F6] shadow-none md:shadow-sm min-w-0 max-w-full">
        
        {/* ── COLONNA 1: CHAT LIST SIDEBAR ── */}
        <div
          className={`border-r border-[#EAE3D9] flex flex-col h-full bg-white w-full md:w-[38%] ${
            activeChatId ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Header Sidebar */}
          <div className="p-3.5 md:p-4 border-b border-[#EAE3D9] space-y-3 bg-[#FAF8F5]">
            <div className="flex justify-between items-center gap-2">
              <h3 className="font-display font-bold text-[#111B21] flex items-center gap-2 text-base">
                <MessageCircle className="w-5 h-5 text-[#B89F78]" />
                Conversazioni
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNewChatOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00A884] text-white text-[11px] font-bold uppercase tracking-wide hover:bg-[#008f6f] transition-colors shadow-sm"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" />
                  Nuova
                </button>
                {humanInterventionsCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse flex items-center gap-1 shadow-sm">
                    <AlertCircle className="w-3 h-3" /> {humanInterventionsCount} SOS
                  </span>
                )}
              </div>
            </div>

            {/* Cerca Input */}
            <div className="relative">
              <input 
                type="text" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cerca per nome o telefono..." 
                className="w-full bg-white rounded-xl pl-9 pr-4 py-2.5 text-sm border border-[#EAE3D9] focus:outline-none focus:border-[#C0A062] transition-colors"
              />
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            </div>

            {/* Pill Filters */}
            <div className="flex gap-1.5 pt-1">
              {[
                { id: 'ALL', label: 'Tutte' },
                { id: 'CLIENT', label: 'Clienti' },
                { id: 'FLORIST', label: 'Fioristi' },
              ].map(pill => (
                <button
                  key={pill.id}
                  onClick={() => setFilterType(pill.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all border
                  ${filterType === pill.id 
                    ? 'bg-[#B89F78] border-[#B89F78] text-white shadow-sm' 
                    : 'bg-white border-[#EAE3D9] text-[#6F6F6F] hover:bg-[#FAF8F5]'}`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          {/* List Area */}
          <div className="overflow-y-auto flex-1 divide-y divide-gray-50 custom-scrollbar">
            {loading ? (
              <div className="p-8 text-center text-[#6F6F6F] text-sm animate-pulse">Caricamento conversazioni...</div>
            ) : filteredSessions.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">Nessuna conversazione trovata.</div>
            ) : (
              filteredSessions.map(chat => {
                const latestMsg = chat.messages?.[chat.messages.length - 1] || null;
                const isSelected = activeChatId === chat.phone;
                return (
                  <div 
                    key={chat.phone} 
                    onClick={() => setActiveChatId(chat.phone)}
                    className={`flex items-center gap-3.5 p-3.5 md:p-4 hover:bg-[#FAF8F5] cursor-pointer transition-colors relative
                    ${isSelected ? 'bg-[#FAF6EE] hover:bg-[#FAF6EE]' : ''}`}
                  >
                    <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-[#EAE3D9] to-[#DFDFDF] flex items-center justify-center font-display font-semibold text-gray-700 flex-shrink-0 border border-gray-200 shadow-sm text-base">
                      {chat.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <h4 className="font-display font-semibold text-[15px] md:text-[14px] text-[#111B21] truncate flex items-center gap-1.5">
                          {chat.displayName || chat.name}
                          {chat.userType === 'FLORIST' && (
                            <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.2 rounded border border-emerald-100 font-bold uppercase tracking-wider">Fiorista</span>
                          )}
                        </h4>
                        <span className={`text-[11px] font-medium ${chat.status === 'HUMAN_INTERVENTION' ? 'text-red-500 font-bold' : 'text-[#667781]'}`}>
                          {formatMessageTimestamp(chat.updatedAt, chat.time || chat.timeLabel)}
                        </span>
                      </div>
                      {chat.subtitle ? (
                        <p className="text-[12px] md:text-[11px] text-[#8A7A5C] truncate mb-0.5 font-medium">{chat.subtitle}</p>
                      ) : null}
                      <div className="flex items-center gap-1 text-[13.5px] md:text-[13px] text-[#667781]">
                        {latestMsg && renderStatus(chat.status, latestMsg.direction)}
                        <span className="truncate flex items-center gap-1.5 flex-1">
                          {chat.hasPhoto && <ImageIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                          <span className="truncate">{chat.lastMessage || 'Nessun messaggio'}</span>
                        </span>
                      </div>
                    </div>
                    {chat.status === 'HUMAN_INTERVENTION' && (
                      <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-[9px] font-bold shadow-sm animate-pulse shrink-0">
                        SOS
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── COLONNA 2: ACTIVE CHAT PANE ── */}
        <div
          className={`flex-col h-full bg-[#EFEAE2] relative w-full md:w-[62%] ${
            activeChatId ? 'flex' : 'hidden md:flex'
          }`}
        >
          {activeChat ? (
            <>
              {/* Header WhatsApp Style */}
              <div className="bg-[#00A884] text-white px-3.5 md:px-6 py-3 md:py-3.5 flex justify-between items-center shadow-md z-10 shrink-0 gap-2">
                <div className="flex items-center gap-2 md:gap-3.5 min-w-0">
                  <button
                    type="button"
                    onClick={closeActiveChat}
                    className="md:hidden inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-white/95 hover:bg-white/10 shrink-0"
                  >
                    <ArrowLeft className="w-5 h-5" />
                    Indietro
                  </button>
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-display font-bold text-white shadow-sm border border-white/30 flex-shrink-0 text-base">
                    {activeChat.initials}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-[16px] md:text-[15px] leading-tight truncate">{activeChat.displayName || activeChat.name}</h4>
                    <p className="text-white/80 text-[12px] md:text-[11px] font-medium truncate">
                      {activeChat.subtitle
                        ? `${activeChat.subtitle} · ${activeChat.phone.replace('whatsapp:', '')}`
                        : `WhatsApp: ${activeChat.phone.replace('whatsapp:', '')}`}
                    </p>
                  </div>
                </div>

                {/* AI / MANUAL TAKEOVER TOGGLE */}
                <button 
                  onClick={() => toggleStatus(activeChat.phone, activeChat.status)}
                  className={`px-2.5 md:px-3.5 py-1.5 rounded-full text-[10px] md:text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 md:gap-1.5 transition-all shadow-sm border shrink-0
                  ${activeChat.status === 'AI_ACTIVE' 
                    ? 'bg-emerald-950/40 text-emerald-200 border-emerald-400 hover:bg-emerald-800/50' 
                    : 'bg-red-600 text-white border-red-400 hover:bg-red-700 animate-pulse'}`}
                >
                  {activeChat.status === 'AI_ACTIVE' ? (
                    <>
                      <Bot className="w-3.5 h-3.5" />
                      🤖 VERA AI ATTIVA
                    </>
                  ) : (
                    <>
                      <UserIcon className="w-3.5 h-3.5" />
                      👤 UMANO ATTIVO
                    </>
                  )}
                </button>
              </div>

              <div className="flex justify-center mt-2 px-2">
                <span className="bg-[#FFEECD] text-[#54656F] text-[11px] md:text-[10px] px-3.5 py-1.5 rounded-lg shadow-sm font-semibold border border-[#F0E6D2] uppercase tracking-wide text-center">
                  {activeChat.status === 'AI_ACTIVE' ? 'VERA AI sta monitorando ed assistendo questa chat.' : 'Controllo Manuale attivato dallo Staff.'}
                </span>
              </div>

              <div 
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto p-3.5 sm:p-4 md:p-6 space-y-3.5 md:space-y-4 custom-scrollbar bg-repeat" 
                style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")' }}
              >
                {activeChat.messages?.map((m: any, idx: number) => {
                  const isOutbound = m.direction === 'OUTBOUND';
                  const deliveryStatus = (m.metadata?.deliveryStatus || '').toUpperCase();
                  const deliveryError = m.metadata?.deliveryError;
                  const isFailed = deliveryStatus === 'FAILED' || Boolean(deliveryError);
                  const isRead = deliveryStatus === 'READ';
                  const isDelivered = deliveryStatus === 'DELIVERED';

                  return (
                    <div key={m.id || idx} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                      <div 
                        className={`px-4 py-3 md:py-3.5 rounded-2xl shadow-sm relative text-[16px] md:text-[15px] text-[#111B21] max-w-[88%] sm:max-w-[82%] md:max-w-[80%] leading-relaxed border font-normal tracking-wide
                        ${isOutbound 
                          ? isFailed
                            ? 'bg-red-50 rounded-tr-none border-red-200 text-red-950'
                            : 'bg-[#D9FDD3] rounded-tr-none border-[#C1E7B9]' 
                          : 'bg-white rounded-tl-none border-[#E6E6E6]'}`}
                      >
                        {isFailed && (
                          <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-red-100/90 px-2.5 py-1 text-[12px] font-semibold text-red-700 border border-red-300">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-600" />
                            <span>Mancata Consegna / Errore Meta{deliveryError ? `: ${deliveryError}` : ''}</span>
                          </div>
                        )}
                        {m.mediaUrl ? (
                          <div>
                            <ChatMessageMedia
                              mediaUrl={m.mediaUrl}
                              caption={m.body ? renderLinkedMessage(m.body) : null}
                              orderId={activeChat?.orderId || m.orderId}
                              orderNumber={activeChat?.orderNumber || m.orderNumber}
                              onOrderLinked={() => {
                                router.refresh();
                              }}
                            />

                            <button
                              type="button"
                              onClick={() => { setForwardSource({ mediaUrl: m.mediaUrl, fromPhone: activeChat.phone }); setForwardSearch(''); }}
                              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#00A884]/30 bg-white px-3 py-1.5 text-[12px] font-semibold text-[#00A884] hover:bg-[#E7F7F1] transition-colors"
                            >
                              <Forward className="w-3.5 h-3.5" />
                              Inoltra a…
                            </button>
                          </div>
                        ) : (
                          <p className="pb-3.5 pr-11 whitespace-pre-wrap text-[16px] md:text-[15px] leading-[1.5] text-[#111B21] tracking-[0.01em]">{renderLinkedMessage(m.body)}</p>
                        )}
                        <div className="absolute bottom-1 right-2.5 flex items-center gap-1">
                          <span className="text-[11px] md:text-[10px] text-[#8696A0] font-medium tracking-normal">{formatMessageTimestamp(m.createdAt, m.timestampLabel || m.timestamp || 'ora')}</span>
                          {isOutbound && (
                            isFailed ? (
                              <span title={deliveryError || 'Mancata Consegna / Errore Meta'}>
                                <AlertCircle className="w-[14px] h-[14px] text-red-600 shrink-0" />
                              </span>
                            ) : isRead ? (
                              <span title="Letto">
                                <CheckCheck className="w-[14px] h-[14px] text-[#53BDEB]" />
                              </span>
                            ) : isDelivered ? (
                              <span title="Consegnato">
                                <CheckCheck className="w-[14px] h-[14px] text-[#8696A0]" />
                              </span>
                            ) : (
                              <span title="Inviato">
                                <Check className="w-[14px] h-[14px] text-[#8696A0]" />
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Chat Input Bar — graffetta sempre disponibile */}
              <form onSubmit={handleSendMessage} className="bg-[#F0F2F5] p-2.5 sm:p-3.5 flex flex-col gap-2 border-t border-[#DFDFDF] shrink-0">
                {activeChat.status === 'AI_ACTIVE' && (
                  <p className="text-[11px] text-center text-[#667781] px-2">
                    VERA AI è attiva: inviando un messaggio o una foto passi al controllo umano.
                  </p>
                )}
                <div className="flex items-center gap-2 sm:gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAttachPhoto}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    title="Allega una foto dal Mac (funziona anche come primo messaggio)"
                    className={`w-11 h-11 rounded-full flex items-center justify-center shadow-sm transition-all flex-shrink-0 border
                    ${uploadingPhoto
                      ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                      : 'bg-white text-[#54656F] border-gray-200 hover:bg-[#F0F2F5] active:scale-95'}`}
                  >
                    {uploadingPhoto ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                  </button>
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Scrivi un messaggio o allega una foto..."
                    className="flex-1 bg-white rounded-full px-4 sm:px-5 py-2.5 sm:py-3 outline-none text-[16px] md:text-[15px] text-[#111B21] shadow-sm border border-gray-200 transition-all focus:border-[#00A884] placeholder:text-gray-400"
                  />
                  <button
                    type="submit"
                    disabled={!inputText.trim() || sending}
                    className={`w-11 h-11 rounded-full text-white flex items-center justify-center shadow-md transition-all flex-shrink-0
                    ${!inputText.trim() || sending
                      ? 'bg-gray-300 cursor-not-allowed shadow-none'
                      : 'bg-[#00A884] hover:bg-[#008f6f] active:scale-95'}`}
                  >
                    <Send className="w-4.5 h-4.5 ml-0.5" />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-white">
              <div className="w-16 h-16 rounded-full bg-[#FAF8F5] border border-[#EAE3D9] flex items-center justify-center mb-3">
                <MessageCircle className="w-8 h-8 text-[#B89F78] opacity-60" />
              </div>
              <h4 className="font-display font-semibold text-[#111B21] text-base mb-1">Bacheca Messaggi VERA</h4>
              <p className="text-sm text-gray-500 max-w-sm text-center px-6 leading-relaxed">Seleziona una chat dalla barra laterale per visualizzare lo storico dei messaggi in tempo reale e prendere il controllo.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 2. CONTROLLO (Analytics & Metriche)
// -------------------------------------------------------------
function ControlloTab() {
  const [data, setData] = useState({
    windowDays: 30,
    veraAutonomyRate: 0,
    humanEscalationRate: 0,
    veraSessions: 0,
    humanSessions: 0,
    totalSessions: 0,
    gdmOpens: [] as Array<{
      id: string;
      buyerName: string;
      buyerEmail: string;
      orderNumber: string;
      deceasedName: string;
      openedAt: string;
      device: string;
      isBot?: boolean;
      deviceHint?: string | null;
      userAgent?: string | null;
    }>,
    whatsappAudit: {
      windowDays: 30,
      outboundTotal: 0,
      inboundTotal: 0,
      photosSent: 0,
      photosReceived: 0,
      outside24hCount: 0,
      outside24hRate: 0,
      veraOutbound: 0,
      humanOutbound: 0,
      veraMsgRate: 0,
      humanMsgRate: 0,
      totalOutbound: 0,
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      failedCount: 0,
      trackedWithStatus: 0,
      deliveredOrRead: 0,
      openOnDeliveredRate: 0,
      deliveredRate: 0,
      readRate: 0,
      failedRate: 0,
      sentOkVsFailedRate: 100,
      failedDetails: [] as Array<{
        id: string;
        phone: string;
        recipientName: string;
        userType: string;
        bodyPreview: string;
        deliveryStatus: string;
        deliveryError?: string;
        createdAt: string;
      }>,
    },
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch('/api/dashboard/communications/analytics');
      const analytics = await res.json();
      if (analytics.success) {
        setData((prev) => ({
          windowDays: analytics.windowDays ?? 30,
          veraAutonomyRate: analytics.veraAutonomyRate,
          humanEscalationRate: analytics.humanEscalationRate,
          veraSessions: analytics.veraSessions ?? 0,
          humanSessions: analytics.humanSessions ?? 0,
          totalSessions: analytics.totalSessions ?? 0,
          gdmOpens: analytics.gdmOpens || [],
          whatsappAudit: {
            ...prev.whatsappAudit,
            ...(analytics.whatsappAudit || {}),
          },
        }));
      }
    } catch (err) {
      console.error('Error fetching communications analytics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const audit = data.whatsappAudit;
  const total = audit.totalOutbound || 1;
  const days = data.windowDays || 30;

  const kpiCard = (
    title: string,
    value: string,
    subtitle: string,
    icon: React.ReactNode,
    valueClass: string,
    subtitleClass: string,
    iconBg: string
  ) => (
    <div className="bg-white rounded-2xl p-5 border border-[#EAE3D9] shadow-sm flex flex-col justify-between">
      <div className="flex justify-between items-start mb-3">
        <h4 className="text-[#6F6F6F] font-semibold text-xs uppercase tracking-wider">{title}</h4>
        <span className={`w-8 h-8 rounded-full ${iconBg} flex items-center justify-center`}>{icon}</span>
      </div>
      <div>
        <p className={`text-3xl font-display font-bold mb-1 ${valueClass}`}>
          {loading ? '...' : value}
        </p>
        <p className={`text-[11px] font-semibold flex items-center gap-1 ${subtitleClass}`}>
          {subtitle}
        </p>
      </div>
    </div>
  );

  return (
    <div className="animate-in fade-in duration-500 space-y-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-display font-medium text-[#2B2B2B]">Analytics di Consegna & Audit Meta WhatsApp</h2>
          <p className="text-[#6F6F6F] mt-1 text-sm">
            Metriche operative ultimi {days} giorni · status Meta sul campione outbound più recente.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchAnalytics}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-[#EAE3D9] text-xs font-semibold text-[#111B21] hover:bg-[#FAF8F5] transition-colors shadow-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#00A884] ${refreshing ? 'animate-spin' : ''}`} />
          Aggiorna Audit Meta
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        {kpiCard(
          'Uso VERA vs Umano',
          loading ? '...' : `${audit.veraMsgRate}% / ${audit.humanMsgRate}%`,
          `${audit.veraOutbound} auto · ${audit.humanOutbound} staff (msg ${days}g)`,
          <Bot className="w-4 h-4 text-[#2F6B43]" />,
          'text-[#2B2B2B]',
          'text-[#2F6B43]',
          'bg-[#E6F3EA]'
        )}
        {kpiCard(
          'Aperti su consegnati',
          loading ? '...' : `${audit.openOnDeliveredRate}%`,
          `${audit.readCount} letti / ${audit.deliveredOrRead} con status Meta`,
          <Eye className="w-4 h-4 text-[#0284C7]" />,
          'text-[#0284C7]',
          'text-[#0284C7]',
          'bg-[#E0F4FC]'
        )}
        {kpiCard(
          'Inviati vs falliti',
          loading ? '...' : `${audit.sentOkVsFailedRate}% ok`,
          `${Math.max(audit.totalOutbound - audit.failedCount, 0)} ok · ${audit.failedCount} falliti (campione)`,
          <CheckCheck className="w-4 h-4 text-[#00A884]" />,
          'text-[#00A884]',
          'text-[#00A884]',
          'bg-[#E7F7F1]'
        )}
        {kpiCard(
          'Messaggi ricevuti',
          loading ? '...' : String(audit.inboundTotal),
          `Inbound clienti/fioristi (ultimi ${days} giorni)`,
          <Smartphone className="w-4 h-4 text-[#5B6B7A]" />,
          'text-[#2B2B2B]',
          'text-[#6F6F6F]',
          'bg-slate-100'
        )}
        {kpiCard(
          'Foto inviate / ricevute',
          loading ? '...' : `${audit.photosSent} / ${audit.photosReceived}`,
          `Outbound con media · inbound con media (${days}g)`,
          <Camera className="w-4 h-4 text-[#B89F78]" />,
          'text-[#2B2B2B]',
          'text-[#8A7355]',
          'bg-[#F5F0E8]'
        )}
        {kpiCard(
          'Fuori finestra 24h',
          loading ? '...' : `${audit.outside24hCount}`,
          `${audit.outside24hRate}% outbound via template Meta`,
          <Clock className="w-4 h-4 text-amber-700" />,
          'text-amber-800',
          'text-amber-700',
          'bg-amber-50'
        )}
        {kpiCard(
          'Interazione emotiva',
          loading ? '...' : `${audit.readRate}%`,
          `${audit.readCount} READ tracciati sul campione status`,
          <Heart className="w-4 h-4 text-[#E11D48]" />,
          'text-[#E11D48]',
          'text-[#BE123C]',
          'bg-rose-50'
        )}
        {kpiCard(
          'SOS / Manuale',
          loading ? '...' : `${data.humanEscalationRate}%`,
          `${data.humanSessions} sessioni in intervento umano / ${data.totalSessions}`,
          <UserIcon className="w-4 h-4 text-amber-600" />,
          'text-[#2B2B2B]',
          'text-amber-700',
          'bg-amber-50'
        )}
      </div>

      {/* RECAPITO VISUAL BREAKDOWN BAR */}
      <div className="bg-white rounded-2xl p-6 border border-[#EAE3D9] shadow-sm space-y-4">
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <h4 className="font-display font-semibold text-base text-[#111B21] flex items-center gap-2">
            <Activity className="w-4.5 h-4.5 text-[#00A884]" />
            Ripartizione Status Consegna Meta WhatsApp
          </h4>
          <span className="text-xs text-gray-500 font-medium">
            {audit.totalOutbound} outbound analizzati · {audit.trackedWithStatus} con callback Meta
          </span>
        </div>

        <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden flex">
          <div style={{ width: `${Math.max(pctBar(audit.readCount, total), audit.readCount ? 2 : 0)}%` }} className="bg-[#34B7F1] h-full" title={`READ: ${audit.readCount}`} />
          <div style={{ width: `${Math.max(pctBar(audit.deliveredCount, total), audit.deliveredCount ? 2 : 0)}%` }} className="bg-[#00A884] h-full" title={`DELIVERED: ${audit.deliveredCount}`} />
          <div style={{ width: `${Math.max(pctBar(audit.sentCount, total), audit.sentCount ? 1 : 0)}%` }} className="bg-[#8696A0] h-full" title={`SENT (senza callback): ${audit.sentCount}`} />
          <div style={{ width: `${Math.max(pctBar(audit.failedCount, total), audit.failedCount ? 1 : 0)}%` }} className="bg-red-500 h-full" title={`FAILED: ${audit.failedCount}`} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs pt-1">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#34B7F1] shrink-0" />
            <span className="text-gray-600 font-medium">Letto (READ): <strong className="text-gray-900">{audit.readCount}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#00A884] shrink-0" />
            <span className="text-gray-600 font-medium">Consegnato (DELIVERED): <strong className="text-gray-900">{audit.deliveredCount}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#8696A0] shrink-0" />
            <span className="text-gray-600 font-medium">Inviato senza callback (SENT): <strong className="text-gray-900">{audit.sentCount}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
            <span className="text-gray-600 font-medium">Mancata Consegna (FAILED): <strong className="text-red-600">{audit.failedCount}</strong></span>
          </div>
        </div>
        <p className="text-[11px] text-[#8696A0]">
          SENT = accettato da Meta ma senza webhook di stato (non significa “non arrivato”). READ/DELIVERED richiedono il callback wamid.
        </p>
      </div>

      {/* REGISTRO ERRORI META WHATSAPP (failedDetails) */}
      <div className="bg-[#FDFCF9] rounded-[24px] border border-[#EAE3D9] overflow-hidden">
        <div className="p-6 border-b border-[#EAE3D9] bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <div>
              <h4 className="font-display font-semibold text-base text-[#111B21]">Registro Mancata Consegna & Errori Webhook Meta</h4>
              <p className="text-xs text-gray-500 mt-0.5">Messaggi con status FAILED o deliveryError degli ultimi 7 giorni (Retention 7 giorni · Auto-purge attivo).</p>
            </div>
          </div>
          {audit.failedCount > 0 && (
            <span className="bg-red-100 text-red-700 text-xs font-bold px-3 py-1 rounded-full border border-red-200">
              {audit.failedCount} Errori
            </span>
          )}
        </div>

        <div className="p-6">
          {loading ? (
            <div className="py-6 text-center text-[#6F6F6F] text-sm animate-pulse">Caricamento errori...</div>
          ) : audit.failedDetails.length === 0 ? (
            <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-800 flex items-center gap-3 text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>Nessun errore FAILED registrato nel campione analizzato.</span>
            </div>
          ) : (
            <div className="dashboard-table-scroll overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[#EAE3D9] text-[#6F6F6F] text-xs uppercase tracking-wider font-semibold">
                    <th className="pb-3 pr-4">Data e Ora</th>
                    <th className="pb-3 pr-4">Destinatario</th>
                    <th className="pb-3 pr-4">Telefono</th>
                    <th className="pb-3 pr-4">Errore Meta Webhook</th>
                    <th className="pb-3">Anteprima Testo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {audit.failedDetails.map(failed => (
                    <tr key={failed.id} className="hover:bg-[#FAF8F5]/50 transition-colors">
                      <td className="py-3.5 pr-4 text-xs font-semibold text-gray-700 whitespace-nowrap">
                        {formatMessageTimestamp(failed.createdAt)}
                      </td>
                      <td className="py-3.5 pr-4">
                        <span className="font-medium text-[#111B21]">{failed.recipientName}</span>
                        {failed.userType === 'FLORIST' && (
                          <span className="ml-1.5 text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.2 rounded border border-emerald-100 font-bold uppercase">Fiorista</span>
                        )}
                      </td>
                      <td className="py-3.5 pr-4 font-mono text-xs text-gray-600">{failed.phone}</td>
                      <td className="py-3.5 pr-4 text-xs">
                        <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 px-2.5 py-1 rounded-lg border border-red-200 font-semibold">
                          <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          {failed.deliveryError}
                        </span>
                      </td>
                      <td className="py-3.5 text-xs text-[#6F6F6F] max-w-[240px] truncate" title={failed.bodyPreview}>
                        {failed.bodyPreview}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Feed Attività GdM */}
      <div className="bg-[#FDFCF9] rounded-[24px] border border-[#EAE3D9] overflow-hidden">
        <div className="p-6 border-b border-[#EAE3D9] bg-white flex items-center gap-3">
          <SlidersHorizontal className="w-5 h-5 text-[#B89F78]" />
          <div>
            <h4 className="font-display font-semibold text-base text-[#111B21]">Tracciamento Apertura Link Consegna (Giardino della Memoria)</h4>
            <p className="text-xs text-gray-500 mt-0.5">
              Ultime {data.gdmOpens.length || 20} aperture. Se il dispositivo è &quot;Anteprima Meta (bot)&quot; è solo il crawler
              facebookexternalhit che genera l&apos;anteprima del link su WhatsApp, non un click umano.
            </p>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="py-6 text-center text-[#6F6F6F] text-sm animate-pulse">Caricamento attività...</div>
          ) : data.gdmOpens.length === 0 ? (
            <div className="py-6 text-center text-gray-400 text-sm">Nessuna attività di apertura registrata.</div>
          ) : (
            <div className="dashboard-table-scroll overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[#EAE3D9] text-[#6F6F6F] text-xs uppercase tracking-wider font-semibold">
                    <th className="pb-3 pr-4">Cliente</th>
                    <th className="pb-3 pr-4">Ordine</th>
                    <th className="pb-3 pr-4">Caro Estinto</th>
                    <th className="pb-3 pr-4">Orario Apertura</th>
                    <th className="pb-3">Dispositivo / Browser</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {data.gdmOpens.map(open => (
                    <tr key={open.id} className="hover:bg-[#FAF8F5]/50 transition-colors">
                      <td className="py-3.5 pr-4">
                        <span className="font-medium text-[#111B21]">{formatPersonName(open.buyerName, 'Cliente')}</span>
                        <span className="block text-[11px] text-[#8696A0]">{open.buyerEmail}</span>
                      </td>
                      <td className="py-3.5 pr-4 font-mono text-xs">{open.orderNumber}</td>
                      <td className="py-3.5 pr-4">{formatDeceasedName(open.deceasedName, '—')}</td>
                      <td className="py-3.5 pr-4 text-xs font-semibold text-gray-600">{open.openedAt}</td>
                      <td className="py-3.5 text-xs max-w-[220px]" title={open.deviceHint || open.userAgent || open.device}>
                        <span className={open.isBot ? 'text-amber-700 font-semibold' : 'text-[#8696A0]'}>
                          {open.device}
                        </span>
                        {open.isBot ? (
                          <span className="block text-[10px] text-amber-600/90 mt-0.5">Non è un’apertura umana</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function pctBar(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return (part / whole) * 100;
}


// -------------------------------------------------------------
// 3. MANUTENZIONE & BLACKLIST (Email Blacklist Panel)
// -------------------------------------------------------------
function ManutenzioneTab() {
  return (
    <div className="max-w-3xl animate-in fade-in duration-500">
      <EmailBlacklistPanel />
    </div>
  );
}

function EmailBlacklistPanel() {
  const [entries, setEntries] = useState<{ id: string; email: string; createdAt: string }[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = async () => {
    try {
      const res = await fetch('/api/dashboard/email-blacklist');
      const data = await res.json();
      if (data.ok) {
        setEntries(data.entries || []);
        setError(null);
      } else {
        setError(data.error || 'Impossibile caricare la blacklist.');
      }
    } catch {
      setError('Errore di rete durante il caricamento.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const handleBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = emailInput.trim();
    if (!raw || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/email-blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: raw }),
      });
      const data = await res.json();
      if (data.ok) {
        setEmailInput('');
        await fetchEntries();
      } else {
        setError(data.error || 'Impossibile bloccare l\'indirizzo.');
      }
    } catch {
      setError('Errore di rete durante il salvataggio.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      const res = await fetch(`/api/dashboard/email-blacklist?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.ok) {
        setEntries(prev => prev.filter(e => e.id !== id));
      }
    } catch {
      setError('Errore durante la rimozione.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-display font-medium text-[#2B2B2B] flex items-center gap-2">
          <Mail className="w-6 h-6 text-[#B89F78]" />
          Blacklist Email Assistenza
        </h2>
        <p className="text-[#6F6F6F] mt-1">
          Mittenti esclusi dal risponditore automatico (es. newsletter, avvisi di notifica, comunicazioni@staff.aruba.it).
          Le email in blacklist vengono ignorate senza risposte automatiche e senza essere registrate in bacheca.
        </p>
      </div>

      <div className="bg-[#FDFCF9] rounded-[24px] border border-[#EAE3D9] overflow-hidden shadow-sm">
        <div className="p-6 border-b border-[#EAE3D9] bg-white">
          <form onSubmit={handleBlock} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="es. comunicazioni@staff.aruba.it"
              className="flex-1 bg-white rounded-xl px-4 py-3 border border-[#DFDFDF] text-[15px] outline-none focus:border-[#C0A062] transition-colors"
              disabled={submitting}
            />
            <button
              type="submit"
              disabled={!emailInput.trim() || submitting}
              className="px-6 py-3 rounded-xl font-semibold text-sm bg-[#2B2B2B] text-white hover:bg-[#111] disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              <Ban className="w-4 h-4" />
              Blocca Email
            </button>
          </form>
          {error && (
            <p className="mt-3 text-sm text-red-600 flex items-center gap-1.5 font-medium">
              <AlertCircle className="w-4 h-4" />
              {error}
            </p>
          )}
        </div>

        <div className="p-6 bg-white">
          {loading ? (
            <p className="text-[#6F6F6F] text-sm animate-pulse">Caricamento indirizzi bloccati...</p>
          ) : entries.length === 0 ? (
            <p className="text-gray-400 text-sm italic">Nessun indirizzo inserito in blacklist.</p>
          ) : (
            <ul className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
              {entries.map(entry => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between bg-white border border-[#EAE3D9] rounded-xl px-4 py-3 hover:bg-[#FAF8F5] transition-colors"
                >
                  <div>
                    <span className="font-mono text-sm text-[#2B2B2B] font-semibold">{entry.email}</span>
                    <span className="block text-[10px] text-[#8696A0] mt-0.5">
                      Aggiunto il {new Date(entry.createdAt).toLocaleDateString('it-IT')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(entry.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Rimuovi dalla blacklist"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

type ConnectionState = 'open' | 'not_configured' | 'error' | null;

interface StatusResponse {
    ok: boolean;
    provider?: string;
    state?: ConnectionState;
    displayPhoneNumber?: string;
    error?: string;
    missingEnv?: string[];
}

function WhatsAppSetupSection() {
    const [state, setState] = useState<ConnectionState>(null);
    const [displayPhone, setDisplayPhone] = useState<string | null>(null);
    const [missingEnv, setMissingEnv] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const {
        data: statusData,
        error: statusFetchError,
        isLoading,
        isValidating,
        mutate,
    } = useDashboardLive<StatusResponse>(
        '/api/dashboard/whatsapp/status',
        dashboardJsonFetcher,
        'metrics'
    );

    useEffect(() => {
        if (statusFetchError) {
            setError('Impossibile contattare Meta WhatsApp Cloud API');
            return;
        }
        if (!statusData) return;
        if (statusData.ok && statusData.state) {
            setState(statusData.state);
            setDisplayPhone(statusData.displayPhoneNumber ?? null);
            setMissingEnv([]);
            setError(null);
        } else {
            setState(statusData.state ?? 'error');
            setError(statusData.error ?? 'Errore nel recupero stato Meta Cloud API');
            setMissingEnv(statusData.missingEnv ?? []);
        }
        setLastUpdated(new Date());
    }, [statusData, statusFetchError]);

    const fetchStatus = useCallback(async () => {
        setError(null);
        await mutate();
    }, [mutate]);

    const loading = isLoading && !statusData;
    const isConnected = state === 'open';

    return (
        <div className="bg-white rounded-[24px] md:rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#EAE3D9] p-6 md:p-8 lg:p-10 space-y-6 md:space-y-8 font-body">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center border border-green-100">
                    <Cloud className="w-5 h-5 text-green-600" />
                </div>
                <div>
                    <h3 className="text-lg font-display font-bold text-[#2B2B2B]">WhatsApp — Meta Cloud API</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Canale VERA assistenza clienti via API ufficiale Meta
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-gray-700">Stato connessione</h4>
                        <button
                            type="button"
                            onClick={() => fetchStatus()}
                            disabled={isValidating}
                            className="flex items-center gap-1.5 text-xs text-[#B89F78] hover:text-[#9A7F56] transition-colors disabled:opacity-40 font-bold uppercase tracking-wider"
                            aria-label="Aggiorna stato"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin' : ''}`} />
                            Aggiorna
                        </button>
                    </div>

                    {loading && !state ? (
                        <div className="flex items-center gap-3 rounded-xl px-4 py-3 border border-gray-150 bg-gray-50/50">
                            <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
                            <span className="text-sm text-gray-500">Verifica credenziali Meta…</span>
                        </div>
                    ) : isConnected ? (
                        <div className="flex items-center gap-3 rounded-xl px-4 py-3 border border-emerald-200 bg-emerald-50/50">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                            <div>
                                <span className="font-semibold text-emerald-700 text-sm">Connesso — Meta Cloud API attiva</span>
                                {displayPhone && (
                                    <p className="text-xs text-gray-500 mt-0.5 font-mono">{displayPhone}</p>
                                )}
                            </div>
                            {lastUpdated && (
                                <span className="ml-auto text-[10px] text-gray-400 font-medium">
                                    Aggiornato alle {lastUpdated.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 rounded-xl px-4 py-3 border border-red-200 bg-red-50/50">
                            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                            <span className="font-semibold text-red-700 text-sm">
                                {state === 'not_configured' ? 'Non configurato' : 'Errore connessione'}
                            </span>
                        </div>
                    )}

                    {error && (
                        <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 border border-red-200 bg-red-50/60">
                            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-red-700 font-semibold">{error}</p>
                        </div>
                    )}

                    {missingEnv.length > 0 && (
                        <p className="text-xs text-amber-600 font-semibold">
                            ⚠️ Variabili mancanti su Vercel: {missingEnv.join(', ')}
                        </p>
                    )}

                    {isConnected && (
                        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50/30 border border-emerald-100/50 px-3.5 py-2.5 rounded-xl">
                            <Wifi className="w-4 h-4 text-emerald-600" />
                            <span className="font-medium">VERA risponde automaticamente ai messaggi WhatsApp in entrata.</span>
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-[#B89F78]" />
                        Configurazione Meta Developer Console
                    </h4>
                    <ol className="space-y-2.5 text-xs text-gray-600 list-decimal list-inside leading-relaxed bg-[#FAF9F6] border border-[#EAE3D9] p-4 rounded-2xl">
                        <li>Crea un'app Meta Business con prodotto WhatsApp attivo</li>
                        <li>Configura il Webhook all'indirizzo: <code className="text-emerald-700 font-mono bg-white px-1 py-0.5 rounded border border-gray-200">https://www.floremoria.com/api/whatsapp/webhook</code></li>
                        <li>Verify Token = <code className="text-emerald-700 font-mono bg-white px-1 py-0.5 rounded border border-gray-200">WHATSAPP_WEBHOOK_SECRET</code></li>
                        <li>Sottoscrivi il campo <strong className="text-gray-800">messages</strong> nella dashboard Meta</li>
                        <li>Imposta le variabili di ambiente Vercel elencate di seguito</li>
                    </ol>
                </div>
            </div>

            <div className="border-t border-[#EAE3D9] pt-6 space-y-3">
                <h4 className="text-sm font-semibold text-gray-700">Variabili Vercel (produzione)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {[
                        ['WHATSAPP_CLOUD_API_KEY', 'Token permanente Graph API (alias: WHATSAPP_ACCESS_TOKEN)'],
                        ['WHATSAPP_PHONE_NUMBER_ID', 'ID numero WhatsApp Business'],
                        ['WHATSAPP_APP_SECRET', 'App Secret Meta — firma webhook POST'],
                        ['WHATSAPP_WEBHOOK_SECRET', 'Verify token webhook GET (es. FloreMoriaVera2026!)'],
                        ['GEMINI_API_KEY', 'Google Gemini — risposte AI VERA'],
                    ].map(([key, desc]) => (
                        <div key={key} className="flex flex-col gap-0.5 bg-gray-50 border border-gray-150 p-2.5 rounded-xl">
                            <span className="text-emerald-700 font-mono font-bold">{key}</span>
                            <span className="text-gray-500 font-medium text-[11px]">{desc}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
