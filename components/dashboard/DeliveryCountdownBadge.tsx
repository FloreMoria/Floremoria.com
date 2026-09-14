'use client';

import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';
import { calculateDeliveryCountdown, type DeliveryCountdownResult } from '@/lib/datetime/deliveryCountdown';

interface DeliveryCountdownBadgeProps {
    deliveryDate?: Date | string | null;
    status?: string | null;
    className?: string;
    showIcon?: boolean;
}

export default function DeliveryCountdownBadge({
    deliveryDate,
    status,
    className = '',
    showIcon = true,
}: DeliveryCountdownBadgeProps) {
    const [now, setNow] = useState<Date>(() => new Date());

    useEffect(() => {
        // Aggiorna il countdown ogni 60 secondi
        const interval = setInterval(() => {
            setNow(new Date());
        }, 60_000);
        return () => clearInterval(interval);
    }, []);

    const countdown = calculateDeliveryCountdown(deliveryDate, status, now);

    if (!countdown) return null;

    // Se l'ordine è completato o cancellato, possiamo non mostrare badge o mostrarne uno neutro
    if (countdown.variant === 'neutral') {
        return null;
    }

    const renderIcon = () => {
        if (!showIcon) return null;
        if (countdown.isOverdue) {
            return <AlertCircle size={12} className="shrink-0 text-rose-700" />;
        }
        if (countdown.isUrgent) {
            return <AlertTriangle size={12} className="shrink-0 text-rose-600 animate-bounce" />;
        }
        if (countdown.variant === 'orange') {
            return <Clock size={12} className="shrink-0 text-amber-600" />;
        }
        return <Clock size={12} className="shrink-0 text-emerald-600" />;
    };

    return (
        <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] leading-tight border shadow-2xs whitespace-nowrap ${countdown.badgeClasses} ${className}`}
            title={`Scadenza consegna: ${countdown.deadline.toLocaleString('it-IT')}`}
        >
            {renderIcon()}
            <span>{countdown.label}</span>
        </span>
    );
}
