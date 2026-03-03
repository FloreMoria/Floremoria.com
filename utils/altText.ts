import { Product } from '@/lib/products';

export function normalizeStr(str: string): string {
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

interface AltTextContext {
    context: "card" | "hover" | "gallery" | "main";
    imageIndex?: number;
    variant?: string;
    municipalityName?: string;
    province?: string;
}

export function buildProductAlt(product: Product, options: AltTextContext): string {
    if (!product || !product.name) {
        return "Omaggi floreali con consegna al cimitero e foto su WhatsApp";
    }

    let corePhrase = product.name;

    // Add purpose/service depending on category
    if (product.category === 'funerale') {
        corePhrase += ", composizione floreale per funerale e camera ardente";
    } else if (product.category === 'cimitero' || product.isBouquet) {
        corePhrase += ", omaggio floreale con consegna al cimitero";
    } else {
        corePhrase += ", accessorio per omaggio floreale al cimitero";
    }

    // Add trust line for card/hover
    if (options.context === "card" || options.context === "hover") {
        corePhrase += ", con foto di conferma su WhatsApp";
    }

    // Append municipality
    if (options.municipalityName) {
        if (options.province) {
            corePhrase += ` a ${options.municipalityName} (${options.province})`;
        } else {
            corePhrase += ` a ${options.municipalityName}`;
        }
    }

    // Append variant
    if (options.variant) {
        corePhrase += ` — variante ${options.variant}`;
    }

    // Append gallery index
    if (options.context === "gallery" && typeof options.imageIndex === 'number') {
        corePhrase += ` — foto ${options.imageIndex + 1}`;
    }

    return corePhrase;
}

export function buildGenericAlt(type: "hero" | "section" | "logo", label?: string): string {
    if (type === "hero") {
        return "FloreMoria, consegna fiori al cimitero in tutta Italia con foto su WhatsApp";
    }
    if (type === "section") {
        if (label === "foto-conferma") {
            return "Tomba fiorita con conferma consegna FloreMoria";
        }
        return label || "Consegna fiori al cimitero FloreMoria";
    }
    if (type === "logo") {
        return "Logo FloreMoria";
    }
    return "";
}

export function isDecorative(imageRole?: string): boolean {
    return imageRole === "decorative";
}
