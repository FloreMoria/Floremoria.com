import React from 'react';
import Link from 'next/link';

type ButtonVariant = 'primary' | 'secondary';

interface ButtonProps {
    href?: string;
    variant?: ButtonVariant;
    className?: string;
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void;
    type?: 'button' | 'submit' | 'reset';
}

export default function Button({
    href,
    variant = 'primary',
    className = '',
    children,
    onClick,
    type = 'button',
}: ButtonProps) {
    const baseClasses = "inline-flex items-center justify-center px-6 py-3 rounded-[10px] font-body font-semibold transition-all duration-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 w-full sm:w-auto text-center";

    const variants = {
        primary: "bg-fm-cta text-white hover:bg-fm-cta-hover focus:ring-fm-cta active:transform active:scale-95",
        secondary: "bg-white border border-fm-rose-soft text-fm-text hover:bg-fm-section focus:ring-fm-rose-soft active:transform active:scale-95"
    };

    const combinedClasses = `${baseClasses} ${variants[variant]} ${className}`;

    if (href) {
        return (
            <Link href={href} className={combinedClasses} onClick={onClick}>
                {children}
            </Link>
        );
    }

    return (
        <button type={type} className={combinedClasses} onClick={onClick}>
            {children}
        </button>
    );
}
