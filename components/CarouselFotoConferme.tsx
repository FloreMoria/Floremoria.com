'use client';

import React, { useState, useEffect } from 'react';
import { Camera, CheckCheck } from 'lucide-react';
import Image from 'next/image';

const mockImages = [
  'https://images.unsplash.com/photo-1582794543139-8ac9cb0f7b11?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1526047932273-341f2a7631f9?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1563241527-300ecb9687ee?auto=format&fit=crop&w=800&q=80'
];

export default function CarouselFotoConferme({ photos }: { photos?: string[] }) {
  const images = photos && photos.length > 0 ? photos : mockImages;
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [images.length]);

  return (
    <div className="w-full aspect-[4/5] sm:aspect-square lg:aspect-[4/5] bg-[#EAE3D9] rounded-2xl overflow-hidden relative shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] ring-1 ring-black/5">
      {images.map((src, idx) => (
        <div
          key={idx}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            currentIndex === idx ? 'opacity-100 z-10' : 'opacity-0 z-0'
          }`}
        >
          <Image 
            src={src} 
            alt="Prova di consegna FloreMoria" 
            fill 
            className="object-cover"
            priority={idx === 0}
          />
        </div>
      ))}
      
      {/* Elementi Decorativi / Trust Overlay */}
      <div className="absolute inset-0 z-20 pointer-events-none bg-gradient-to-t from-black/60 via-transparent to-black/10"></div>
      
      <div className="absolute top-4 left-4 z-30 bg-black/40 backdrop-blur-md rounded-full px-3 py-1.5 flex items-center gap-2 border border-white/20">
        <Camera className="w-3.5 h-3.5 text-white" />
        <span className="text-white text-[10px] font-bold tracking-widest uppercase">Genuinità Certificata</span>
      </div>

      <div className="absolute bottom-4 left-4 right-4 z-30 bg-white/95 backdrop-blur-md rounded-xl p-3 shadow-lg border border-white flex flex-col gap-1">
        <p className="text-xs text-[#6F6F6F] font-medium flex items-center justify-between">
          <span>Inviato su WhatsApp</span>
          <span className="text-[10px]">Oggi 11:44</span>
        </p>
        <p className="text-sm font-display font-semibold text-[#111B21] flex items-center justify-between">
          Come promesso, la vicinanza si fa fiore.
          <CheckCheck className="w-4 h-4 text-[#34B7F1]" />
        </p>
      </div>
    </div>
  );
}
