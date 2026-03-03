'use client';
import React, { useState } from 'react';

export interface FAQ {
    question: string;
    answer: string;
}

interface FAQAccordionProps {
    title?: string;
    faqs: FAQ[];
}

export default function FAQAccordion({ title = "Domande Frequenti", faqs }: FAQAccordionProps) {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    const toggle = (idx: number) => {
        setOpenIndex(openIndex === idx ? null : idx);
    };

    return (
        <section className="bg-white rounded-[30px] p-8 lg:p-16 shadow-xl border border-gray-100 w-full max-w-4xl mx-auto">
            {title && (
                <h2 className="text-[32px] font-display font-semibold text-fm-text leading-snug mb-10 text-center">
                    {title}
                </h2>
            )}
            <div className="space-y-4">
                {faqs.map((faq, idx) => (
                    <div key={idx} className="bg-white border text-left border-gray-100 rounded-2xl overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.02)] hover:border-fm-rose-soft/50 transition-colors">
                        <button
                            className="w-full px-6 py-5 flex justify-between items-center text-left"
                            onClick={() => toggle(idx)}
                        >
                            <span className="font-semibold text-fm-text pr-4">{faq.question}</span>
                            <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gray-50 text-fm-muted transition-transform duration-300 ${openIndex === idx ? 'rotate-180 bg-fm-rose-soft text-fm-rose' : ''}`}>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </span>
                        </button>
                        <div className={`px-6 overflow-hidden transition-all duration-300 ease-in-out ${openIndex === idx ? 'max-h-96 pb-5 opacity-100' : 'max-h-0 opacity-0'}`}>
                            <p className="text-fm-muted font-body leading-relaxed">{faq.answer}</p>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
