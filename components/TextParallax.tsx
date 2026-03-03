'use client';

import { useEffect, useRef, ReactNode } from 'react';

interface TextParallaxProps {
    children: ReactNode;
    speed?: number; // Moltiplicatore della velocità (1 = normale, <1 più lento, >1 più veloce in direzione contraria)
    className?: string;
}

export default function TextParallax({ children, speed = 0.5, className = '' }: TextParallaxProps) {
    const elementRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let animationFrameId: number;

        const handleScroll = () => {
            if (!elementRef.current) return;

            const scrollY = window.scrollY;
            // Muove il testo verso l'alto (più lento dello scroll della pagina se speed > 0)
            const yPos = scrollY * speed;
            elementRef.current.style.transform = `translate3d(0, ${yPos}px, 0)`;
        };

        const onScroll = () => {
            animationFrameId = requestAnimationFrame(handleScroll);
        };

        window.addEventListener('scroll', onScroll, { passive: true });

        return () => {
            window.removeEventListener('scroll', onScroll);
            cancelAnimationFrame(animationFrameId);
        };
    }, [speed]);

    return (
        <div ref={elementRef} className={`will-change-transform ${className}`}>
            {children}
        </div>
    );
}
