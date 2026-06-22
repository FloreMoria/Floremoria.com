'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Eye, MessageCircle, Settings, BarChart2, CheckCircle2, AlertCircle, Camera, Check, ShieldCheck, Mail, Send, Activity, CheckCheck, Image as ImageIcon, X, Bot, User as UserIcon, Ban, Trash2 } from 'lucide-react';

export default function CommunicationsHubClient({ initialProofs }: { initialProofs: any[] }) {
  const [activeTab, setActiveTab] = useState('visione');
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Poll for new messages every 4 seconds to simulate real-time chat
  useEffect(() => {
    async function fetchSessions() {
      try {
        const res = await fetch('/api/dashboard/communications');
        const data = await res.json();
        if (data.success) {
          setSessions(data.sessions || []);
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
    { id: 'visione', label: 'Monitoraggio', icon: Eye },
    { id: 'foto', label: 'Foto (Approvazione)', icon: ImageIcon },
    { id: 'manutenzione', label: 'Configurazione', icon: Settings },
    { id: 'controllo', label: 'Analytics', icon: Activity },
  ];

  return (
    <div className="bg-white rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#EAE3D9] overflow-hidden font-body">
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
            proofs={initialProofs} 
            sessions={sessions} 
            setSessions={setSessions}
            loading={loading}
          />
        )}
        {activeTab === 'foto' && <FotoTab proofs={initialProofs} />}
        {activeTab === 'manutenzione' && <ManutenzioneTab />}
        {activeTab === 'controllo' && <ControlloTab />}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 1. VISIONE (Monitoring Feed WhatsApp Style)
// -------------------------------------------------------------
function VisioneTab({ 
  proofs, 
  sessions, 
  setSessions, 
  loading 
}: { 
  proofs: any[]; 
  sessions: any[]; 
  setSessions: React.Dispatch<React.SetStateAction<any[]>>; 
  loading: boolean;
}) {
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
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
      }
    } catch (err) {
      console.error('Error sending message:', err);
      // Rollback input if failed
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
            className="text-[#0B57D0] underline break-all"
          >
            {part}
          </a>
        );
      }
      return <React.Fragment key={`txt-${idx}`}>{part}</React.Fragment>;
    });
  };

  const ChatRow = ({ chat }: { chat: any }) => {
    const latestMsg = chat.messages?.[chat.messages.length - 1] || null;
    return (
      <div 
        onClick={() => setActiveChatId(chat.phone)}
        className={`flex items-center gap-4 p-4 hover:bg-[#F0F2F5] cursor-pointer border-b border-[#F0F2F5] last:border-0 transition-colors
        ${activeChatId === chat.phone ? 'bg-[#F0F2F5]' : ''}`}
      >
        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#EAE3D9] to-[#DFDFDF] flex items-center justify-center font-display font-semibold text-gray-700 flex-shrink-0 border border-gray-200">
           {chat.initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline mb-1">
            <h4 className="font-display font-medium text-[#111B21] truncate flex items-center gap-2">
              {chat.name}
              {chat.status === 'HUMAN_INTERVENTION' && (
                <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" title="Richiede Intervento Umano" />
              )}
            </h4>
            <span className={`text-[12px] font-medium ${chat.status === 'HUMAN_INTERVENTION' ? 'text-red-500 font-bold animate-pulse' : 'text-[#667781]'}`}>
               {chat.time}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[14px] text-[#667781]">
            {latestMsg && renderStatus(chat.status, latestMsg.direction)}
            <span className="truncate flex items-center gap-1.5">
              {chat.hasPhoto && <ImageIcon className="w-4 h-4 text-emerald-600" />}
              {chat.lastMessage || 'Nessun messaggio'}
            </span>
          </div>
        </div>
        {chat.status === 'HUMAN_INTERVENTION' && (
          <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm animate-pulse">
            SOS
          </div>
        )}
      </div>
    );
  };

  // Filter users and florists from sessions
  const clienti = sessions.filter(s => s.userType === 'UTENTE' || s.userType === 'UNKNOWN');
  const fioristi = sessions.filter(s => s.userType === 'FLORIST');

  const humanInterventionsCount = clienti.filter(c => c.status === 'HUMAN_INTERVENTION').length;
  const newVisualsCount = fioristi.filter(f => f.hasPhoto).length;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* COLONNA UTENTI */}
        <div className="bg-white rounded-2xl border border-[#EAE3D9] overflow-hidden shadow-sm flex flex-col h-[520px]">
          <div className="bg-[#F0F2F5] p-4 border-b border-[#EAE3D9] flex justify-between items-center">
             <h3 className="font-display font-semibold text-[#111B21] flex items-center gap-2">
               <UserIcon className="w-4 h-4 text-gray-600" />
               Chat Utenti (Clienti)
             </h3>
             {humanInterventionsCount > 0 ? (
               <span className="bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse flex items-center gap-1">
                 <AlertCircle className="w-3 h-3" /> {humanInterventionsCount} Richiesta Umano
               </span>
             ) : (
               <span className="bg-[#00A884] text-white text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">AI Vito Attivo</span>
             )}
          </div>
          <div className="overflow-y-auto flex-1 custom-scrollbar">
            {loading ? (
              <div className="p-8 text-center text-[#6F6F6F]">Caricamento chat...</div>
            ) : clienti.length === 0 ? (
              <div className="p-8 text-center text-[#6F6F6F]">Nessuna chat utente registrata.</div>
            ) : (
              clienti.map(c => <ChatRow key={c.phone} chat={c} />)
            )}
          </div>
        </div>

        {/* COLONNA FIORISTI */}
        <div className="bg-white rounded-2xl border border-[#EAE3D9] overflow-hidden shadow-sm flex flex-col h-[520px]">
          <div className="bg-[#F0F2F5] p-4 border-b border-[#EAE3D9] flex justify-between items-center">
             <h3 className="font-display font-semibold text-[#111B21] flex items-center gap-2">
               <Camera className="w-4 h-4 text-gray-600" />
               Chat Fioristi (Partner)
             </h3>
             {newVisualsCount > 0 ? (
               <span className="bg-[#25D366] text-white text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                 {newVisualsCount} Prove Foto Caricate
               </span>
             ) : (
               <span className="bg-gray-400 text-white text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">In Attesa</span>
             )}
          </div>
          <div className="overflow-y-auto flex-1 custom-scrollbar">
            {loading ? (
              <div className="p-8 text-center text-[#6F6F6F]">Caricamento chat...</div>
            ) : fioristi.length === 0 ? (
              <div className="p-8 text-center text-[#6F6F6F]">Nessuna chat fiorista registrata.</div>
            ) : (
              fioristi.map(f => <ChatRow key={f.phone} chat={f} />)
            )}
          </div>
        </div>
      </div>

      {/* CHAT MODAL OVERLAY */}
      {activeChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-all">
           <div className="bg-[#EFEAE2] w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[650px] animate-in zoom-in-95 duration-200">
             
             {/* Header WhatsApp Style */}
             <div className="bg-[#00A884] text-white p-4 flex items-center gap-4 relative shadow-md">
               <button onClick={() => setActiveChatId(null)} className="p-2 hover:bg-white/20 rounded-full transition-colors mr-1">
                 <X className="w-5 h-5"/>
               </button>
               <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-display font-bold text-white shadow-sm border border-white/30 flex-shrink-0">
                 {activeChat.initials}
               </div>
               <div className="flex-1 min-w-0 mr-4">
                 <h4 className="font-semibold text-[16px] leading-tight truncate">{activeChat.name}</h4>
                 <p className="text-white/80 text-[12px] font-medium truncate">Twilio: {activeChat.phone.replace('whatsapp:', '')}</p>
               </div>

               {/* UMANO / AI TOGGLE BUTTON */}
               <button 
                 onClick={() => toggleStatus(activeChat.phone, activeChat.status)}
                 className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm border
                 ${activeChat.status === 'AI_ACTIVE' 
                   ? 'bg-emerald-900/40 text-emerald-100 hover:bg-emerald-800/60 border-emerald-400' 
                   : 'bg-red-600 text-white hover:bg-red-700 border-red-300 animate-pulse'}`}
               >
                 {activeChat.status === 'AI_ACTIVE' ? (
                   <>
                     <Bot className="w-3.5 h-3.5" />
                     🤖 AI VITO
                   </>
                 ) : (
                   <>
                     <UserIcon className="w-3.5 h-3.5" />
                     👤 UMANO
                   </>
                 )}
               </button>
             </div>
             
             {/* Body Chat */}
             <div className="flex-1 overflow-y-auto p-6 space-y-6" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundSize: 'cover' }}>
                <div className="flex justify-center">
                  <span className="bg-[#FFEECD] text-[#54656F] text-[12px] px-4 py-1.5 rounded-lg shadow-sm font-medium border border-[#F0E6D2]">
                    I messaggi e le foto sono sincronizzati end-to-end con le API di Twilio.
                  </span>
                </div>
                
                {/* Dynamically render messages */}
                {activeChat.messages.map((m: any, idx: number) => {
                  const isOutbound = m.direction === 'OUTBOUND';
                  return (
                    <div key={m.id || idx} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                      <div 
                        className={`p-2.5 rounded-xl shadow-sm relative text-[14.5px] text-[#111B21] max-w-[85%] sm:max-w-[70%] leading-relaxed border
                        ${isOutbound 
                          ? 'bg-[#D9FDD3] rounded-tr-none border-[#C1E7B9]' 
                          : 'bg-white rounded-tl-none border-[#E6E6E6]'}`}
                      >
                        {m.mediaUrl ? (
                           <div className="space-y-1.5">
                             <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-gray-200">
                               <img src={m.mediaUrl} alt="Visual Proof" className="w-full h-auto max-h-[300px] object-cover hover:scale-105 transition-transform duration-300" />
                             </a>
                             {m.body && <p className="pt-2 px-1 pb-1 whitespace-pre-wrap">{renderLinkedMessage(m.body)}</p>}
                           </div>
                        ) : (
                           <p className="px-1 py-0.5 pb-2 pr-12 whitespace-pre-wrap">{renderLinkedMessage(m.body)}</p>
                        )}
                        <div className="absolute bottom-1 right-2 flex items-center gap-1.5">
                          <span className="text-[10px] text-[#8696A0]">{m.timestamp || m.time}</span>
                          {isOutbound && <CheckCheck className="w-[14px] h-[14px] text-[#53BDEB]" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
             </div>
             
             {/* Input Bar */}
             <form onSubmit={handleSendMessage} className="bg-[#F0F2F5] p-3 md:p-4 flex items-center gap-3 border-t border-[#DFDFDF]">
                <input 
                  type="text" 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={activeChat.status === 'AI_ACTIVE' ? "Vito sta rispondendo... disattiva l'AI per scrivere manuale" : "Scrivi un messaggio... (Invia per inoltrare su WhatsApp)"}
                  className="flex-1 bg-white rounded-full px-5 py-3 outline-none text-[15px] text-[#111B21] shadow-sm border border-gray-200 transition-all focus:border-[#00A884]"
                  disabled={activeChat.status === 'AI_ACTIVE'}
                />
                <button 
                  type="submit"
                  disabled={activeChat.status === 'AI_ACTIVE' || !inputText.trim() || sending}
                  className={`w-12 h-12 rounded-full text-white flex items-center justify-center shadow-md transition-all flex-shrink-0
                  ${activeChat.status === 'AI_ACTIVE' || !inputText.trim() || sending
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-[#00A884] hover:bg-[#008f6f] active:scale-95'}`}
                >
                  <Send className="w-5 h-5 ml-1" />
                </button>
             </form>
           </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// 2. FOTO (Approvazione & Inoltro Postman)
// -------------------------------------------------------------
function FotoTab({ proofs }: { proofs: any[] }) {

  // Mock dati Controllo Qualità
  const mockPhotos = [
    { id: 'ORD-75', fiorista: 'Medda Gabriele', utente: 'Marsiglione S.', data: 'Oggi, 11:44', status: 'In Attesa' },
    { id: 'ORD-78', fiorista: 'Fioraia Civitanova Alta', utente: 'Cesaroni I.', data: 'Ieri, 16:30', status: 'In Attesa' },
    { id: 'ORD-81', fiorista: 'Capitano Davide', utente: 'Capellini D.', data: 'Oggi, 09:12', status: 'In Attesa' },
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8 flex justify-between items-center">
         <div>
           <h2 className="text-2xl font-display font-medium text-[#2B2B2B]">Controllo Qualità: Foto Consegne</h2>
           <p className="text-[#6F6F6F] mt-1">Verifica le immagini caricate dai fioristi prima che il bot Postman le inoltri in automatico agli Utenti via WhatsApp.</p>
         </div>
         <div className="bg-orange-50 text-orange-600 px-4 py-2 rounded-full border border-orange-200 flex items-center gap-2 shadow-sm">
            <Camera className="w-4 h-4" />
            <span className="text-sm font-bold uppercase tracking-wider">3 in Coda</span>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockPhotos.map((photo, i) => (
           <div key={i} className="bg-white border border-[#EAE3D9] rounded-[24px] overflow-hidden shadow-sm flex flex-col group hover:shadow-md transition-all">
              <div className="w-full h-56 bg-gradient-to-tr from-gray-100 to-gray-200 flex items-center justify-center relative overflow-hidden">
                 <Camera className="w-10 h-10 text-gray-400 opacity-60 group-hover:scale-110 transition-transform duration-500" />
                 <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                 <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                    <span className="text-white font-semibold font-display text-lg shadow-sm">{photo.id}</span>
                    <span className="bg-black/50 backdrop-blur-md text-white/90 text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide">
                      {photo.status}
                    </span>
                 </div>
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between bg-white relative z-10">
                <div>
                   <p className="text-xs text-[#8696A0] font-semibold uppercase tracking-wider">{photo.data}</p>
                   <h4 className="text-[17px] font-display font-semibold text-[#111B21] mt-3">Da: {photo.fiorista}</h4>
                   <h5 className="text-[14px] font-display text-[#54656F] mt-1">Per: {photo.utente}</h5>
                   
                   <div className="mt-4 bg-[#FAF8F5] p-2.5 rounded-xl border border-[#EAE3D9] flex items-start gap-2">
                     <ShieldCheck className="w-4 h-4 text-[#B89F78] mt-0.5" />
                     <p className="text-[12px] text-[#2B2B2B] font-medium leading-snug">
                       Analisi pre-inoltro superata. Assenza di imperfezioni visive gravi (Controllo AI).
                     </p>
                   </div>
                </div>
                <div className="flex gap-3 mt-6">
                   <button className="flex-1 bg-[#25D366] text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-[#1DA851] transition-colors flex items-center justify-center gap-1.5 shadow-sm">
                     <Send className="w-4 h-4"/> Approva & Inoltra
                   </button>
                   <button className="bg-red-50 text-red-600 px-4 py-2.5 rounded-xl font-semibold hover:bg-red-100 transition-colors border border-red-200" title="Rifiuta e chiedi nuova foto">
                     <X className="w-5 h-5"/>
                   </button>
                </div>
              </div>
           </div>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 3. MANUTENZIONE (Configurazione Env)
// -------------------------------------------------------------
function ManutenzioneTab() {
  return (
    <div className="max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-10">
      <EmailBlacklistPanel />

      <div>
      <div className="mb-8">
         <h2 className="text-2xl font-display font-medium text-[#2B2B2B]">Integrazione Gateway (Twilio)</h2>
         <p className="text-[#6F6F6F] mt-1">Configurazione delle variabili d'ambiente. I token reali risiedono nel file <span className="font-mono bg-gray-100 px-2 py-1 rounded mx-1">.env</span> (Server-Side).</p>
      </div>

      <div className="bg-[#FDFCF9] rounded-[24px] border border-[#EAE3D9] overflow-hidden">
        <div className="p-6 border-b border-[#EAE3D9] flex items-center gap-4 bg-white">
          <div className="w-12 h-12 bg-[#EFF6FF] rounded-full flex items-center justify-center"><Settings className="text-[#2563EB] w-6 h-6" /></div>
          <div>
            <h4 className="font-display font-semibold text-lg">Chiavi API & Permessi</h4>
            <p className="text-sm text-gray-500">Credenziali lette dinamicamente in ambiente sicuro.</p>
          </div>
        </div>
        
        <div className="p-6 space-y-6">
          {['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_NUMBER'].map(v => (
             <div key={v} className="flex justify-between items-center bg-white border border-[#DFDFDF] p-4 rounded-xl">
               <span className="font-mono text-sm font-semibold">{v}</span>
               <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider bg-gray-100 text-gray-500 px-3 py-1 rounded-md">
                 Confidenziale
               </span>
             </div>
          ))}
        </div>
      </div>
      </div>
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
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-display font-medium text-[#2B2B2B] flex items-center gap-2">
          <Mail className="w-6 h-6 text-[#B89F78]" />
          Blacklist email assistenza@
        </h2>
        <p className="text-[#6F6F6F] mt-1">
          Mittenti esclusi dal risponditore automatico (newsletter, robot di notifica, comunicazioni@staff.aruba.it).
          Le mail in blacklist vengono ignorate senza risposta e senza log in bacheca.
        </p>
      </div>

      <div className="bg-[#FDFCF9] rounded-[24px] border border-[#EAE3D9] overflow-hidden">
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
              Blocca
            </button>
          </form>
          {error && (
            <p className="mt-3 text-sm text-red-600 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              {error}
            </p>
          )}
        </div>

        <div className="p-6">
          {loading ? (
            <p className="text-[#6F6F6F] text-sm">Caricamento...</p>
          ) : entries.length === 0 ? (
            <p className="text-[#6F6F6F] text-sm">Nessun indirizzo bloccato.</p>
          ) : (
            <ul className="space-y-2">
              {entries.map(entry => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between bg-white border border-[#EAE3D9] rounded-xl px-4 py-3"
                >
                  <div>
                    <span className="font-mono text-sm text-[#2B2B2B]">{entry.email}</span>
                    <span className="block text-[11px] text-[#8696A0] mt-0.5">
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

// -------------------------------------------------------------
// 4. CONTROLLO (Analytics & Metriche)
// -------------------------------------------------------------
function ControlloTab() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8 flex justify-between items-center">
         <div>
           <h2 className="text-2xl font-display font-medium text-[#2B2B2B]">Analytics di Consegna</h2>
           <p className="text-[#6F6F6F] mt-1">Monitoraggio dell'efficienza logistica dei Fioristi Partner.</p>
         </div>
         <button className="text-sm font-semibold text-[#B89F78] hover:text-[#C0A062] flex items-center gap-2 bg-[#FAF8F5] px-4 py-2 flex rounded-full border border-[#EAE3D9]">
            Scarica Report CSV
         </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-[#EAE3D9] shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <h4 className="text-[#6F6F6F] font-semibold text-sm">Tasso Apertura WhatsApp</h4>
            <span className="w-8 h-8 rounded-full bg-[#E6F3EA] flex items-center justify-center"><Mail className="w-4 h-4 text-[#2F6B43]" /></span>
          </div>
          <p className="text-4xl font-display font-bold text-[#2B2B2B] mb-2">91.4%</p>
          <p className="text-sm font-medium text-[#2F6B43] flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Eccellente conversione emotiva</p>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-[#EAE3D9] shadow-sm">
           <div className="flex justify-between items-start mb-4">
            <h4 className="text-[#6F6F6F] font-semibold text-sm">SLA Rispettate (Funerale)</h4>
            <span className="w-8 h-8 rounded-full bg-[#EFF6FF] flex items-center justify-center"><Activity className="w-4 h-4 text-[#2563EB]" /></span>
          </div>
          <p className="text-4xl font-display font-bold text-[#2B2B2B] mb-2">98.2%</p>
          <p className="text-sm font-medium text-[#2563EB]">Consegne in Priorità Rossa puntuali</p>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-[#EAE3D9] shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <h4 className="text-[#6F6F6F] font-semibold text-sm">Costo Medio Twilio / Ordine</h4>
            <span className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center"><AlertCircle className="w-4 h-4 text-orange-600" /></span>
          </div>
          <p className="text-4xl font-display font-bold text-[#2B2B2B] mb-2">€0.14</p>
          <p className="text-sm font-medium text-orange-600">Entro le stime del Quartale</p>
        </div>
      </div>
    </div>
  );
}
