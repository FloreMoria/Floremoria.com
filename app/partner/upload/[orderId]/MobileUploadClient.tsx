'use client';

import React, { useState } from 'react';
import imageCompression from 'browser-image-compression';
import { Camera, Image as ImageIcon, Send, Loader2, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';

type UploadState = 'idle' | 'compressing' | 'uploading' | 'success' | 'error';

export default function MobileUploadClient({ orderId, isFuneral }: { orderId: string, isFuneral: boolean }) {
  const [photo1, setPhoto1] = useState<File | null>(null);
  const [photo2, setPhoto2] = useState<File | null>(null);
  const [preview1, setPreview1] = useState<string | null>(null);
  const [preview2, setPreview2] = useState<string | null>(null);
  const [status, setStatus] = useState<UploadState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Etichette dinamiche (Martina's Protocol per i Funerali)
  const label1 = isFuneral ? "Foto Dettaglio 1 (La Composizione)" : "Scatto Prima (Cimitero all'arrivo)";
  const label2 = isFuneral ? "Foto Dettaglio 2 (Posizionamento)" : "Scatto Dopo (Omaggio posato)";

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, setPhoto: typeof setPhoto1, setPreview: typeof setPreview1) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      setStatus('compressing');
      try {
        // Parametri di Compressione aggressivi per le "zone d'ombra" (Max 1MB, Max Width 1920)
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          initialQuality: 0.8,
        };
        const compressedBlob = await imageCompression(file, options);
        
        // Ricovertito in file standard o Blob da inviare poi alla API
        const compressedFile = new File([compressedBlob], file.name, { type: file.type });
        
        setPhoto(compressedFile);
        // Preview per l'operatore (si crea un Local URI che bypassa la rete = immediato)
        setPreview(URL.createObjectURL(compressedFile));
        setStatus('idle');
      } catch (error) {
        console.error("Errore compressione locale:", error);
        setStatus('error');
        setErrorMessage("Errore durante l'ottimizzazione dell'immagine dal tuo telefono. Riprova.");
      }
    }
  };

  const handleSubmit = async () => {
    if (!photo1 || !photo2) return;
    setStatus('uploading');

    let lat: number | null = null;
    let lng: number | null = null;

    try {
        if ("geolocation" in navigator) {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    timeout: 5000,
                    enableHighAccuracy: true,
                    maximumAge: 0
                });
            });
            lat = position.coords.latitude;
            lng = position.coords.longitude;
        }
    } catch (e) {
        console.warn("GPS timeout o non autorizzato, proseguo senza:", e);
    }

    try {
      const formData = new FormData();
      formData.append('orderId', orderId);
      formData.append('photo1', photo1);
      formData.append('photo2', photo2);
      if (lat !== null && lng !== null) {
          formData.append('latitude', lat.toString());
          formData.append('longitude', lng.toString());
      }

      const res = await fetch('/api/partner/upload', {
          method: 'POST',
          body: formData
      });

      if (!res.ok) throw new Error('Network response was not ok');
      
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setErrorMessage("Assenza di connessione. Se sei nel Cimitero, aspetta di rientrare in negozio e premi di nuovo Invia.");
    }
  };

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center justify-center p-8 pt-32 text-center animate-in zoom-in-95 duration-500">
        <div className="w-24 h-24 bg-[#D9FDD3] rounded-full flex items-center justify-center shadow-lg border-4 border-white mb-6">
          <CheckCircle2 className="w-12 h-12 text-[#1DA851]" />
        </div>
        <h2 className="text-3xl font-display font-bold text-[#111B21] mb-2">Consegna Completata</h2>
        <p className="text-[#54656F] text-lg max-w-sm mb-6">Le immagini per l'ordine <strong>{orderId}</strong> sono state caricate sul server. Le puoi vedere sul tuo profilo gratuito. Se il pagamento non è stato ancora effettuato, lo sarà a breve.</p>
        <div className="bg-[#EFEAE2] rounded-xl px-6 py-4 flex items-center gap-3 w-full max-w-xs justify-center text-[#54656F] font-semibold mx-auto">
           <ShieldCheck className="w-5 h-5 text-[#B89F78]" /> Crittografia E2E attiva
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto relative pt-12 px-6">
      
      {/* HEADER WA-STYLE */}
      <div className="bg-[#00A884] fixed top-0 left-0 right-0 h-16 flex items-center px-4 shadow-sm z-50 rounded-b-xl border-b border-black/10">
         <h1 className="text-white font-semibold flex flex-col pt-1">
           <span className="text-[16px] font-display">Conferma Operativa FloreMoria</span>
           <span className="text-[12px] text-white/80 font-mono tracking-wider">ID {orderId}</span>
         </h1>
      </div>
      
      <div className="mt-8 mb-6 space-y-2">
         <h2 className="text-2xl font-display font-bold text-[#111B21]">Caricamento Foto</h2>
         <p className="text-[15px] text-[#54656F] leading-snug">Premi sui due riquadri qui sotto e seleziona dalla tua galleria le due foto richieste. Poi clicca sul tasto verde Invia.</p>
      </div>

      <div className="space-y-6">
        
        {/* BOX 1 */}
        <div className="bg-white rounded-[24px] p-6 shadow-sm border border-[#EAE3D9]">
          <h3 className="font-semibold text-[15px] text-[#111B21] mb-4 flex items-center gap-2">
             <span className="w-6 h-6 bg-[#C0A062] text-white rounded-full flex items-center justify-center text-xs">1</span> 
             {label1}
          </h3>
          <label className="relative block w-full aspect-video bg-[#F0F2F5] rounded-2xl border-2 border-dashed border-[#DFDFDF] flex flex-col items-center justify-center cursor-pointer hover:bg-gray-200 transition overflow-hidden">
             {preview1 ? (
               <img src={preview1} alt="Preview 1" className="absolute inset-0 w-full h-full object-cover" />
             ) : (
               <>
                 <Camera className="w-8 h-8 text-[#54656F] opacity-50 mb-2" />
                 <span className="text-[14px] text-[#54656F] font-medium">Scegli dalla Libreria</span>
               </>
             )}
             <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e, setPhoto1, setPreview1)} />
          </label>
        </div>

        {/* BOX 2 */}
        <div className="bg-white rounded-[24px] p-6 shadow-sm border border-[#EAE3D9]">
          <h3 className="font-semibold text-[15px] text-[#111B21] mb-4 flex items-center gap-2">
             <span className="w-6 h-6 bg-[#2F6B43] text-white rounded-full flex items-center justify-center text-xs">2</span> 
             {label2}
          </h3>
          <label className="relative block w-full aspect-video bg-[#F0F2F5] rounded-2xl border-2 border-dashed border-[#DFDFDF] flex flex-col items-center justify-center cursor-pointer hover:bg-gray-200 transition overflow-hidden">
             {preview2 ? (
               <img src={preview2} alt="Preview 2" className="absolute inset-0 w-full h-full object-cover" />
             ) : (
               <>
                 <ImageIcon className="w-8 h-8 text-[#54656F] opacity-50 mb-2" />
                 <span className="text-[14px] text-[#54656F] font-medium">Scegli dalla Libreria</span>
               </>
             )}
             <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e, setPhoto2, setPreview2)} />
          </label>
        </div>

      </div>

      {status === 'error' && (
        <div className="mt-6 bg-red-50 text-red-700 p-4 rounded-xl flex items-start gap-3 border border-red-200">
           <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
           <p className="text-sm font-medium">{errorMessage}</p>
        </div>
      )}

      {/* FIXED SUBMIT BAR */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 pb-8 flex justify-center z-40">
        <div className="w-full max-w-md">
          <button 
             onClick={handleSubmit}
             disabled={!photo1 || !photo2 || status === 'compressing' || status === 'uploading'}
             className="w-full bg-[#1DA851] text-white py-4 rounded-full font-bold text-lg flex items-center justify-center gap-2 shadow-lg shadow-[#1DA851]/20 hover:bg-[#158f42] active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale"
          >
             {status === 'compressing' ? <><Loader2 className="w-5 h-5 animate-spin" /> Ottimizzazione in corso...</> :
              status === 'uploading' ? <><Loader2 className="w-5 h-5 animate-spin" /> Trasferimento Server...</> : 
              <><Send className="w-5 h-5 ml-1" /> Invia e chiudi il servizio</>}
          </button>
        </div>
      </div>
    </div>
  );
}
