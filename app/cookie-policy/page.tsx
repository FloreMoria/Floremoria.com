import CookiePolicyContent, { cookiePolicyMetadata } from "@/components/legal/CookiePolicyContent";

export const metadata = {
    ...cookiePolicyMetadata,
    alternates: {
        canonical: "https://www.floremoria.com/cookie-policy",
    },
};

/** Alias richiesto da controlli automatici / partner digitali. */
export default function CookiePolicyAliasPage() {
    return <CookiePolicyContent />;
}
