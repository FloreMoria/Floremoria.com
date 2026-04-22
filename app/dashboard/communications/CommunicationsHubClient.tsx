'use client';

import React, { useState } from 'react';
import { Eye, MessageCircle, Settings, BarChart2, CheckCircle2, AlertCircle, Camera, Check, ShieldCheck, Mail, Send, Activity, CheckCheck, Image as ImageIcon, X } from 'lucide-react';

export default function CommunicationsHubClient({ initialProofs }: { initialProofs: any[] }) {
  const [activeTab, setActiveTab] = useState('visione');

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
        {activeTab === 'visione' && <VisioneTab proofs={initialProofs} />}
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
const mockClienti = [
  { id: '1', name: 'Cesaroni Isabella', lastMessage: 'Ne siamo sempre felici 🌹', date: 'sabato', time: '10:30', status: 'read', initials: 'CI' },
  { id: '2', name: 'Marsiglione Salvatore', lastMessage: 'L\'affermazione è parzialmente vera...', date: 'ieri', time: '11:00', status: 'problem', initials: 'MS' },
  { id: '3', name: 'Capellini Diego', lastMessage: 'Sì per entrambi. Grazie! Al tuo client...', date: 'sabato', time: '09:15', status: 'read', initials: 'CD' }
];

const mockFioristi = [
  { id: '4', name: 'Medda Gabriele', lastMessage: 'Foto', date: 'oggi', time: '11:44', status: 'unread', initials: 'MG', hasPhoto: true },
  { id: '5', name: 'Fioraia Civitanova Alta', lastMessage: 'Grazie molte Antonella. A presto. 🌹', date: 'sabato', time: '08:24', status: 'read', initials: 'FC' },
  { id: '6', name: 'Capitano Davide', lastMessage: 'Buongiorno, vai tranquillo. Ci aggiorni...', date: 'sabato', time: '07:12', status: 'read', initials: 'CD' }
];

function VisioneTab({ proofs }: { proofs: any[] }) {
  const [activeChat, setActiveChat] = useState<any>(null);

  const renderStatus = (status: string) => {
    if (status === 'read') return <CheckCheck className="w-[15px] h-[15px] text-[#34B7F1]" />;
    if (status === 'unread') return <Check className="w-[15px] h-[15px] text-gray-400" />;
    if (status === 'problem') return <AlertCircle className="w-[15px] h-[15px] text-red-500" />;
    return <Check className="w-[15px] h-[15px] text-gray-400" />;
  };

  const ChatRow = ({ chat }: { chat: any }) => (
    <div 
      onClick={() => setActiveChat(chat)}
      className="flex items-center gap-4 p-4 hover:bg-[#F0F2F5] cursor-pointer border-b border-[#F0F2F5] last:border-0 transition-colors"
    >
      <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-gray-200 to-gray-300 flex items-center justify-center font-display font-semibold text-gray-700 flex-shrink-0">
         {chat.initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline mb-1">
          <h4 className="font-display font-medium text-[#111B21] truncate">{chat.name}</h4>
          <span className={`text-[12px] font-medium ${chat.status === 'unread' ? 'text-[#25D366]' : 'text-[#667781]'}`}>
             {chat.date !== 'oggi' ? chat.date : chat.time}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[14px] text-[#667781]">
          {renderStatus(chat.status)}
          <span className="truncate flex items-center gap-1.5">
            {chat.hasPhoto && <ImageIcon className="w-4 h-4" />}
            {chat.lastMessage}
          </span>
        </div>
      </div>
      {chat.status === 'unread' && (
        <div className="w-5 h-5 bg-[#25D366] rounded-full flex items-center justify-center text-white text-[10px] font-bold">1</div>
      )}
    </div>
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* COLONNA UTENTI */}
        <div className="bg-white rounded-2xl border border-[#EAE3D9] overflow-hidden shadow-sm flex flex-col h-[520px]">
          <div className="bg-[#F0F2F5] p-4 border-b border-[#EAE3D9] flex justify-between items-center">
             <h3 className="font-display font-semibold text-[#111B21]">Chat Utenti</h3>
             <span className="bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">1 Fix Richiesto</span>
          </div>
          <div className="overflow-y-auto flex-1 custom-scrollbar">
            {mockClienti.map(c => <ChatRow key={c.id} chat={c} />)}
          </div>
        </div>

        {/* COLONNA FIORISTI */}
        <div className="bg-white rounded-2xl border border-[#EAE3D9] overflow-hidden shadow-sm flex flex-col h-[520px]">
          <div className="bg-[#F0F2F5] p-4 border-b border-[#EAE3D9] flex justify-between items-center">
             <h3 className="font-display font-semibold text-[#111B21]">Chat Fioristi (Partner)</h3>
             <span className="bg-[#25D366] text-white text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Nuove Prove Visive</span>
          </div>
          <div className="overflow-y-auto flex-1 custom-scrollbar">
            {mockFioristi.map(f => <ChatRow key={f.id} chat={f} />)}
          </div>
        </div>
      </div>

      {/* CHAT MODAL OVERLAY */}
      {activeChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-all">
           <div className="bg-[#EFEAE2] w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[650px] animate-in zoom-in-95 duration-200">
             
             {/* Header WhatsApp Style */}
             <div className="bg-[#00A884] text-white p-4 flex items-center gap-4 relative shadow-sm">
               <button onClick={() => setActiveChat(null)} className="p-2 hover:bg-white/20 rounded-full transition-colors mr-1">
                 <X className="w-5 h-5"/>
               </button>
               <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-display font-bold text-white shadow-sm border border-white/30">
                 {activeChat.initials}
               </div>
               <div className="flex-1">
                 <h4 className="font-semibold text-[16px] leading-tight truncate">{activeChat.name}</h4>
                 <p className="text-white/80 text-[13px] font-medium">Ultimo accesso oggi alle {activeChat.time}</p>
               </div>
             </div>
             
             {/* Body Chat */}
             <div className="flex-1 overflow-y-auto p-6 space-y-6" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundSize: 'cover' }}>
                <div className="flex justify-center">
                  <span className="bg-[#FFEECD] text-[#54656F] text-[12px] px-4 py-1.5 rounded-lg shadow-sm font-medium">
                    I messaggi e le foto sono crittografati end-to-end tramite le API Twilio.
                  </span>
                </div>
                
                {/* Simulated Received Message */}
                <div className="flex justify-start">
                  <div className="bg-white p-2 rounded-lg rounded-tl-none max-w-[85%] sm:max-w-[70%] shadow-sm relative text-[14.5px] text-[#111B21]">
                    {activeChat.hasPhoto ? (
                       <div className="space-y-1">
                         <div className="w-full aspect-[3/4] bg-gray-200 rounded animate-pulse flex items-center justify-center min-w-[200px]">
                           <Camera className="w-8 h-8 text-gray-400 opacity-50"/>
                         </div>
                         <p className="pt-2 px-1 pb-1">Ecco la ricevuta e la foto posata in cimitero.</p>
                       </div>
                    ) : (
                       <p className="px-1 py-1 pr-12">{activeChat.lastMessage}</p>
                    )}
                    <span className="text-[11px] text-[#8696A0] absolute bottom-1.5 right-2">{activeChat.time}</span>
                  </div>
                </div>

                {/* Simulated Sent Message (Admin) */}
                <div className="flex justify-end">
                  <div className="bg-[#D9FDD3] p-2 rounded-lg rounded-tr-none max-w-[85%] sm:max-w-[70%] shadow-sm relative text-[14.5px] text-[#111B21]">
                    <p className="px-1 py-1 pr-16 leading-relaxed">Perfetto, la ringraziamo a nome di FloreMoria. Questo gesto porterà molta serenità alla famiglia lontana.</p>
                    <div className="absolute bottom-1.5 right-2 flex items-center gap-1">
                      <span className="text-[11px] text-[#8696A0]">{activeChat.time}</span>
                      <CheckCheck className="w-[15px] h-[15px] text-[#53BDEB]" />
                    </div>
                  </div>
                </div>
             </div>
             
             {/* Input Bar */}
             <div className="bg-[#F0F2F5] p-3 md:p-4 flex items-center gap-3">
                <input type="text" placeholder="Scrivi un messaggio" className="flex-1 bg-white rounded-full px-5 py-3 outline-none text-[15px] text-[#111B21] shadow-sm" disabled />
                <button className="w-12 h-12 rounded-full bg-[#00A884] text-white flex items-center justify-center shadow-md hover:bg-[#008f6f] transition-colors flex-shrink-0">
                  <Send className="w-5 h-5 ml-1" />
                </button>
             </div>
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
    <div className="max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-500">
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
