import {
  WHATSAPP_MAINTENANCE_BANNER_ENABLED,
} from '@/lib/site/maintenanceBanner';

export default function WhatsAppMaintenanceBanner() {
  if (!WHATSAPP_MAINTENANCE_BANNER_ENABLED) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[1000] bg-[#1e3a32] text-white/95 py-2 px-4 text-center text-sm font-body border-b border-[#C0A062]/25"
    >
      <p className="max-w-[1200px] mx-auto leading-snug">
        Assistenza WhatsApp in aggiornamento per 24h, per urgenze contattateci al telefono{' '}
        <a
          href="tel:+393204105305"
          className="font-semibold text-[#E8D5A8] hover:text-white transition-colors whitespace-nowrap"
        >
          3204105305
        </a>{' '}
        o via email a{' '}
        <a
          href="mailto:assistenza@floremoria.com"
          className="font-semibold text-[#E8D5A8] hover:text-white transition-colors whitespace-nowrap"
        >
          assistenza@floremoria.com
        </a>
        .
      </p>
    </div>
  );
}
