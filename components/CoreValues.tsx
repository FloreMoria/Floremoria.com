import React from 'react';
import { Heart, Users, Leaf, BadgeCheck } from 'lucide-react';

export default function CoreValues() {
    const values = [
        {
            icon: <Heart size={28} className="text-[#B69666]" />,
            title: "Rispetto",
            description: "Ogni consegna è trattata con la massima cura e delicatezza"
        },
        {
            icon: <Users size={28} className="text-[#B69666]" />,
            title: "Fioristi locali",
            description: "Una rete di partner in tutta Italia"
        },
        {
            icon: <Leaf size={28} className="text-[#B69666]" />,
            title: "Ecosostenibile",
            description: "Fiori locali, meno trasporti, meno CO2"
        },
        {
            icon: <BadgeCheck size={28} className="text-[#B69666]" />,
            title: "Startup innovativa",
            description: "Certificata nel Registro delle imprese"
        }
    ];

    return (
        <section className="w-full max-w-6xl mx-auto px-4 py-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                {values.map((item, idx) => (
                    <div 
                        key={idx} 
                        className="flex flex-col items-center text-center p-4 md:p-6 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow"
                    >
                        <div className="mb-3 md:mb-4">
                            {item.icon}
                        </div>
                        <h4 className="font-display font-bold text-gray-900 text-[15px] md:text-lg mb-1 md:mb-2 leading-tight">
                            {item.title}
                        </h4>
                        <p className="text-gray-500 font-body text-[12px] md:text-[14px] leading-snug">
                            {item.description}
                        </p>
                    </div>
                ))}
            </div>
        </section>
    );
}
