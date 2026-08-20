/**
 * Polyfill DOM grafici mancanti in Node/Vercel Serverless.
 * Perché: pdf.js / unpdf possono richiamare DOMMatrix anche solo per getText.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export function ensurePdfDomPolyfills(): void {
    const g = globalThis as any;

    if (typeof g.DOMMatrix === 'undefined') {
        g.DOMMatrix = class DOMMatrix {
            a = 1;
            b = 0;
            c = 0;
            d = 1;
            e = 0;
            f = 0;
            constructor(_init?: any) {}
            multiply() {
                return this;
            }
            translate() {
                return this;
            }
            scale() {
                return this;
            }
        };
    }

    if (typeof g.DOMPoint === 'undefined') {
        g.DOMPoint = class DOMPoint {
            x = 0;
            y = 0;
            z = 0;
            w = 1;
            constructor(x = 0, y = 0, z = 0, w = 1) {
                this.x = x;
                this.y = y;
                this.z = z;
                this.w = w;
            }
        };
    }

    if (typeof g.DOMRect === 'undefined') {
        g.DOMRect = class DOMRect {
            x = 0;
            y = 0;
            width = 0;
            height = 0;
            constructor(x = 0, y = 0, width = 0, height = 0) {
                this.x = x;
                this.y = y;
                this.width = width;
                this.height = height;
            }
        };
    }
}
