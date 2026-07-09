'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Eye, MessageCircle, AlertCircle, Camera, Check, ShieldCheck, Mail, Send, Activity, CheckCheck, Image as ImageIcon, X, Bot, User as UserIcon, Ban, Trash2, Search, SlidersHorizontal, Users, CheckCircle2, MessageSquarePlus } from 'lucide-react';
import NewConversationModal from '@/components/dashboard/NewConversationModal';
import StaffPushNotifications from '@/components/dashboard/StaffPushNotifications';

export default function CommunicationsHubClient({ initialProofs }: { initialProofs?: any[] }) {
  const [activeTab, setActiveTab] = useState('visione');
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const prevInboundCountRef = useRef(0);

  // Poll for new messages every 4 seconds to simulate real-time chat
  useEffect(() => {
    async function fetchSessions() {
      try {
        const res = await fetch('/api/dashboard/communications');
        const data = await res.json();
        if (data.success) {
          const nextSessions = data.sessions || [];
          const inboundCount = nextSessions.reduce(
            (sum: number, s: { messages?: { direction: string }[] }) =>
              sum + (s.messages?.filter((m) => m.direction === 'INBOUND').length || 0),
            0
          );
          if (
            prevInboundCountRef.current > 0 &&
            inboundCount > prevInboundCountRef.current &&
            typeof Audio !== 'undefined'
          ) {
            try {
              const beep = new Audio(
                'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onp6WjHqBk5mMgH2Gg4B8d3Z0c3Bua2lmZGFhX15bWllYV1ZUUU5MSklIR0VEQ0JBQT09PQ=='
              );
              beep.volume = 0.35;
              void beep.play();
            } catch {
              /* ignore autoplay restrictions */
            }
          }
          prevInboundCountRef.current = inboundCount;
          setSessions(nextSessions);
        }
      } catch (err) {
        console.error('Error fetching chat sessions:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchSessions();
    const interval = setInterval(fetchSessions, 4000);
    return () => clearInterval(interval);
  }, []);

  const tabs = [
    { id: 'visione', label: 'Monitoraggio Live', icon: Eye },
    { id: 'controllo', label: 'Analytics Consegne', icon: Activity },
    { id: 'manutenzione', label: 'Blacklist & Filtri', icon: Ban },
  ];

  return (
    <div className="bg-white rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#EAE3D9] overflow-hidden font-body">
      <div className="px-8 pt-8">
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
              className={`flex-1 min-w-[200px] py-6 px-6 font-display font-semibold transition-all flex items-center justify-center gap-3 border-b-[3px]
              ${isActive ? 'border-[#C0A062] text-[#B89F78] bg-[#FDFCF9]' : 'border-transparent text-[#6F6F6F] hover:text-[#4A4A4A] hover:bg-[#FAF8F5]'}`}
            >
              <Icon className="w-5 h-5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* CONTENT AREA */}
      <div className="p-8 md:p-12 min-h-[650px] bg-white">
        {activeTab === 'visione' && (
          <VisioneTab 
            sessions={sessions} 
            setSessions={setSessions}
            loading={loading}
          />
        )}
        {activeTab === 'controllo' && <ControlloTab />}
        {activeTab === 'manutenzione' && <ManutenzioneTab />}
      </div>
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Find the currently active chat
  const activeChat = sessions.find(s => s.phone === activeChatId) || null;

  // Scroll to bottom of chat when active chat or messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
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
      const res = await fetch('/api/dashboard/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: activeChatId, action: 'sendMessage', messageText: textToSend })
      });
      const data = await res.json();
      if (data.success) {
        setSessions(prev => prev.map(s => s.phone === activeChatId ? data.session : s));
      } else if (data.requiresTemplate) {
        alert(data.error || 'Finestra 24h scaduta: avvii una nuova conversazione con template WhatsApp.');
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setInputText(textToSend);
    } finally {
      setSending(false);
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
      <div className="flex border border-[#EAE3D9] rounded-3xl overflow-hidden h-[680px] bg-[#FAF9F6] shadow-sm">
        
        {/* ── COLONNA 1: CHAT LIST SIDEBAR ── */}
        <div className="w-[38%] border-r border-[#EAE3D9] flex flex-col h-full bg-white">
          {/* Header Sidebar */}
          <div className="p-4 border-b border-[#EAE3D9] space-y-3 bg-[#FAF8F5]">
            <div className="flex justify-between items-center gap-2">
              <h3 className="font-display font-bold text-[#111B21] flex items-center gap-2">
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
                className="w-full bg-white rounded-xl pl-9 pr-4 py-2 text-sm border border-[#EAE3D9] focus:outline-none focus:border-[#C0A062] transition-colors"
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
                    className={`flex items-center gap-3.5 p-4 hover:bg-[#FAF8F5] cursor-pointer transition-colors relative
                    ${isSelected ? 'bg-[#FAF6EE] hover:bg-[#FAF6EE]' : ''}`}
                  >
                    <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-[#EAE3D9] to-[#DFDFDF] flex items-center justify-center font-display font-semibold text-gray-700 flex-shrink-0 border border-gray-200 shadow-sm">
                      {chat.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <h4 className="font-display font-semibold text-[14px] text-[#111B21] truncate flex items-center gap-1.5">
                          {chat.name}
                          {chat.userType === 'FLORIST' && (
                            <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.2 rounded border border-emerald-100 font-bold uppercase tracking-wider">Fiorista</span>
                          )}
                        </h4>
                        <span className={`text-[11px] font-medium ${chat.status === 'HUMAN_INTERVENTION' ? 'text-red-500 font-bold' : 'text-[#667781]'}`}>
                          {chat.time || chat.timeLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[13px] text-[#667781]">
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
        <div className="w-[62%] flex flex-col h-full bg-[#EFEAE2] relative">
          {activeChat ? (
            <>
              {/* Header WhatsApp Style */}
              <div className="bg-[#00A884] text-white px-6 py-3.5 flex justify-between items-center shadow-md z-10 shrink-0">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-display font-bold text-white shadow-sm border border-white/30 flex-shrink-0">
                    {activeChat.initials}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-[15px] leading-tight truncate">{activeChat.name}</h4>
                    <p className="text-white/80 text-[11px] font-medium truncate">WhatsApp: {activeChat.phone.replace('whatsapp:', '')}</p>
                  </div>
                </div>

                {/* AI / MANUAL TAKEOVER TOGGLE */}
                <button 
                  onClick={() => toggleStatus(activeChat.phone, activeChat.status)}
                  className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm border
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

              <div className="flex justify-center mt-2">
                <span className="bg-[#FFEECD] text-[#54656F] text-[11px] px-3.5 py-1.5 rounded-lg shadow-sm font-semibold border border-[#F0E6D2] uppercase tracking-wide">
                  {activeChat.status === 'AI_ACTIVE' ? 'VERA AI sta monitorando ed assistendo questa chat.' : 'Controllo Manuale attivato dallo Staff.'}
                </span>
              </div>

              <div 
                className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-repeat" 
                style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")' }}
              >
                {activeChat.messages?.map((m: any, idx: number) => {
                  const isOutbound = m.direction === 'OUTBOUND';
                  return (
                    <div key={m.id || idx} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                      <div 
                        className={`p-3 rounded-2xl shadow-sm relative text-[14px] text-[#111B21] max-w-[80%] leading-relaxed border
                        ${isOutbound 
                          ? 'bg-[#D9FDD3] rounded-tr-none border-[#C1E7B9]' 
                          : 'bg-white rounded-tl-none border-[#E6E6E6]'}`}
                      >
                        {m.mediaUrl ? (
                          <div>
                            <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                              <img src={m.mediaUrl} alt="Visual Proof" className="w-full h-auto max-h-[250px] object-contain hover:scale-102 transition-transform duration-300" />
                            </a>
                            {m.body && <p className="pt-1.5 whitespace-pre-wrap">{renderLinkedMessage(m.body)}</p>}
                          </div>
                        ) : (
                          <p className="pb-3 pr-10 whitespace-pre-wrap">{renderLinkedMessage(m.body)}</p>
                        )}
                        <div className="absolute bottom-1 right-2.5 flex items-center gap-1">
                          <span className="text-[9px] text-[#8696A0] font-medium">{m.timestampLabel || m.timestamp || 'ora'}</span>
                          {isOutbound && <CheckCheck className="w-[13px] h-[13px] text-[#53BDEB]" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Bar */}
              <form onSubmit={handleSendMessage} className="bg-[#F0F2F5] p-3.5 flex items-center gap-3 border-t border-[#DFDFDF] shrink-0">
                {activeChat.status === 'AI_ACTIVE' ? (
                  <div className="flex-1 bg-white/75 text-[#54656F] text-center py-3.5 px-6 rounded-full border border-dashed border-[#C0A062]/30 text-sm font-medium shadow-inner">
                    🤖 <b>VERA AI sta gestendo la conversazione.</b> Disattiva VERA in alto per intervenire.
                  </div>
                ) : (
                  <>
                    <input 
                      type="text" 
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Scrivi un messaggio... (Invia per inoltrare su WhatsApp)"
                      className="flex-1 bg-white rounded-full px-5 py-3 outline-none text-[14px] text-[#111B21] shadow-sm border border-gray-200 transition-all focus:border-[#00A884]"
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
                  </>
                )}
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
    veraAutonomyRate: 0,
    humanEscalationRate: 0,
    gdmOpens: [] as Array<{
      id: string;
      buyerName: string;
      buyerEmail: string;
      orderNumber: string;
      deceasedName: string;
      openedAt: string;
      device: string;
    }>,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch('/api/dashboard/communications/analytics');
        const analytics = await res.json();
        if (analytics.success) {
          setData({
            veraAutonomyRate: analytics.veraAutonomyRate,
            humanEscalationRate: analytics.humanEscalationRate,
            gdmOpens: analytics.gdmOpens
          });
        }
      } catch (err) {
        console.error('Error fetching communications analytics:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, []);

  return (
    <div className="animate-in fade-in duration-500 space-y-10">
      <div className="flex justify-between items-center">
         <div>
           <h2 className="text-2xl font-display font-medium text-[#2B2B2B]">Analytics di Consegna</h2>
           <p className="text-[#6F6F6F] mt-1">Efficienza operativa e tracciamento dell'interazione emotiva dei clienti.</p>
         </div>
      </div>

      {/* Metriche Principali */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-[#EAE3D9] shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <h4 className="text-[#6F6F6F] font-semibold text-sm">Tasso Autonomia VERA</h4>
            <span className="w-8 h-8 rounded-full bg-[#E6F3EA] flex items-center justify-center"><Bot className="w-4 h-4 text-[#2F6B43]" /></span>
          </div>
          <div>
            <p className="text-4xl font-display font-bold text-[#2B2B2B] mb-2">{loading ? '...' : `${data.veraAutonomyRate}%`}</p>
            <p className="text-xs font-semibold text-[#2F6B43] flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5"/> Risposte gestite autonomamente dall'AI</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-[#EAE3D9] shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <h4 className="text-[#6F6F6F] font-semibold text-sm">Richiesta Intervento Umano</h4>
            <span className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center"><UserIcon className="w-4 h-4 text-red-600" /></span>
          </div>
          <div>
            <p className="text-4xl font-display font-bold text-[#2B2B2B] mb-2">{loading ? '...' : `${data.humanEscalationRate}%`}</p>
            <p className="text-xs font-semibold text-red-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5"/> Richieste di SOS / Intervento manuale</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-[#EAE3D9] shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <h4 className="text-[#6F6F6F] font-semibold text-sm">Aperture Giardino della Memoria</h4>
            <span className="w-8 h-8 rounded-full bg-[#EFF6FF] flex items-center justify-center"><Activity className="w-4 h-4 text-[#2563EB]" /></span>
          </div>
          <div>
            <p className="text-4xl font-display font-bold text-[#2B2B2B] mb-2">{loading ? '...' : data.gdmOpens.length}</p>
            <p className="text-xs font-semibold text-[#2563EB] flex items-center gap-1"><CheckCheck className="w-3.5 h-3.5"/> Clic tracciati sui link foto di consegna</p>
          </div>
        </div>
      </div>

      {/* Feed Attività GdM */}
      <div className="bg-[#FDFCF9] rounded-[24px] border border-[#EAE3D9] overflow-hidden">
        <div className="p-6 border-b border-[#EAE3D9] bg-white flex items-center gap-3">
          <SlidersHorizontal className="w-5 h-5 text-[#B89F78]" />
          <div>
            <h4 className="font-display font-semibold text-base text-[#111B21]">Tracciamento Apertura Link Consegna (Giardino della Memoria)</h4>
            <p className="text-xs text-gray-500 mt-0.5">Visualizzazioni in tempo reale dei link inviati ai clienti via WhatsApp.</p>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="py-6 text-center text-[#6F6F6F] text-sm animate-pulse">Caricamento attività...</div>
          ) : data.gdmOpens.length === 0 ? (
            <div className="py-6 text-center text-gray-400 text-sm">Nessuna attività di apertura registrata.</div>
          ) : (
            <div className="overflow-x-auto">
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
                        <span className="font-medium text-[#111B21]">{open.buyerName}</span>
                        <span className="block text-[11px] text-[#8696A0]">{open.buyerEmail}</span>
                      </td>
                      <td className="py-3.5 pr-4 font-mono text-xs">{open.orderNumber}</td>
                      <td className="py-3.5 pr-4">{open.deceasedName}</td>
                      <td className="py-3.5 pr-4 text-xs font-medium text-gray-500">{open.openedAt}</td>
                      <td className="py-3.5 text-xs text-[#8696A0] max-w-[200px] truncate" title={open.device}>{open.device}</td>
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
