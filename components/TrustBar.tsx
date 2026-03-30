'use client';

import { Leaf, Camera, Truck, Star, ShieldCheck } from 'lucide-react';
import React from 'react';

const trustItems = [
  { icon: Leaf, text: 'Impegno Ecosostenibile' },
  { icon: Camera, text: 'Foto via Whatsapp' },
  { icon: Truck, text: 'Consegna gratuita' },
  { icon: Star, text: '5.0 Google', fill: true },
  { icon: ShieldCheck, text: 'Garanzia di soddisfazione' },
];

export default function TrustBar() {
  return (
    <div className="w-full bg-[#FDFCF9]/65 backdrop-blur-sm border-y border-[#EAE3D9]/50 py-5 overflow-hidden relative z-10 shadow-sm mx-auto mb-16 lg:mb-24">
      <div className="flex animate-marquee md:animate-marquee-slow w-max">
        {/* Usiamo 4 copie dell'array. Traslando del -50% otteniamo un loop perfetto infinito */}
        {[...Array(4)].map((_, arrayIndex) => (
          <div key={arrayIndex} className="flex">
            {trustItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <div 
                  key={`${arrayIndex}-${index}`} 
                  className="flex items-center justify-center gap-3 w-[50vw] md:w-[33.33vw] lg:w-[25vw] xl:w-[20vw]"
                >
                  <Icon 
                    className="w-5 h-5 text-fm-gold" 
                    fill={item.fill ? "currentColor" : "none"} 
                    strokeWidth={item.fill ? 0 : 1.5}
                  />
                  <span className="font-body text-[15px] md:text-base font-medium text-slate-700">
                    {item.text}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
