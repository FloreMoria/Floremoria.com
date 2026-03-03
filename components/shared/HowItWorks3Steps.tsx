import React from 'react';

interface StepItem {
    title: string;
    description: string;
}

interface HowItWorks3StepsProps {
    title?: string;
    steps: [StepItem, StepItem, StepItem];
}

export default function HowItWorks3Steps({ title = "Come funziona", steps }: HowItWorks3StepsProps) {
    return (
        <section className="bg-white rounded-[30px] p-8 lg:p-16 shadow-xl border border-gray-100">
            {title && (
                <div className="text-center mb-12">
                    <h2 className="text-[32px] font-display font-semibold text-fm-text leading-snug">
                        {title}
                    </h2>
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 relative">
                {/* Connecting Line (Desktop) */}
                <div className="hidden md:block absolute top-[28px] left-[15%] right-[15%] h-[2px] bg-fm-rose-soft/50 z-0"></div>

                {/* Step 1 */}
                <div className="flex flex-col items-center text-center relative z-10 space-y-4">
                    <div className="w-14 h-14 rounded-full bg-fm-cta-soft flex items-center justify-center text-fm-cta font-display font-bold text-2xl shadow-sm border-2 border-white ring-4 ring-white">1</div>
                    <h3 className="text-xl font-semibold text-fm-text">{steps[0].title}</h3>
                    <p className="text-fm-muted max-w-xs">{steps[0].description}</p>
                </div>

                {/* Step 2 */}
                <div className="flex flex-col items-center text-center relative z-10 space-y-4">
                    <div className="w-14 h-14 rounded-full bg-fm-rose-soft flex items-center justify-center text-fm-rose font-display font-bold text-2xl shadow-sm border-2 border-white ring-4 ring-white">2</div>
                    <h3 className="text-xl font-semibold text-fm-text">{steps[1].title}</h3>
                    <p className="text-fm-muted max-w-xs">{steps[1].description}</p>
                </div>

                {/* Step 3 */}
                <div className="flex flex-col items-center text-center relative z-10 space-y-4">
                    <div className="w-14 h-14 rounded-full bg-fm-section flex items-center justify-center text-fm-text font-display font-bold text-2xl shadow-sm border-2 border-white ring-4 ring-white">3</div>
                    <h3 className="text-xl font-semibold text-fm-text">{steps[2].title}</h3>
                    <p className="text-fm-muted max-w-xs">{steps[2].description}</p>
                </div>
            </div>
        </section>
    );
}
