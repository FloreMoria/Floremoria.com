import type { Product } from '@/lib/products';
import { products } from '@/lib/products';

/**
 * Sezione PDP «Spesso i nostri utenti acquistano anche»:
 * - 1 card: omaggio principale di **fascia più alta** della stessa categoria (diverso dal PDP corrente se possibile).
 * - Fino a 2 card: **accessori** della stessa categoria (non il prodotto corrente).
 *
 * FT → tombe; FF → funerale; PA → animali.
 */
export function getPdpCrossSellProducts(current: Product, maxItems = 3): Product[] {
    const cat = current.category;
    if (!cat) return [];

    const inCat = (p: Product) => p.category === cat;

    const bouquetsInCategory = products
        .filter((p) => inCat(p) && p.isBouquet)
        .sort((a, b) => b.price - a.price);

    /** Omaggio «di punta» da proporre: il più costoso tra quelli ≠ pagina corrente; se la PDP è un accessorio, il top di gamma della categoria. */
    let flagship: Product | undefined;
    if (current.isBouquet) {
        flagship = bouquetsInCategory.find((b) => b.id !== current.id);
    } else {
        flagship = bouquetsInCategory[0];
    }

    const accessoriesInCategory = products
        .filter((p) => inCat(p) && !p.isBouquet && p.id !== current.id)
        .sort((a, b) => b.price - a.price);

    const out: Product[] = [];
    const add = (p: Product | undefined) => {
        if (!p || out.some((x) => x.id === p.id)) return;
        if (out.length >= maxItems) return;
        out.push(p);
    };

    add(flagship);

    for (const a of accessoriesInCategory) {
        add(a);
        if (out.length >= maxItems) break;
    }

    /** Riempimento se mancano slot (es. PDP sul solo accessorio in catalogo ridotto). */
    if (out.length < maxItems) {
        for (const b of bouquetsInCategory) {
            add(b);
            if (out.length >= maxItems) break;
        }
    }

    return out.slice(0, maxItems);
}
