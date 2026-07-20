import PrivacyPolicyContent, { privacyPolicyMetadata } from '@/components/legal/PrivacyPolicyContent';

export const metadata = {
    ...privacyPolicyMetadata,
    alternates: {
        canonical: 'https://www.floremoria.com/privacy-policy',
    },
};

/** Alias richiesto da controlli automatici Pinterest / social partner. */
export default function PrivacyPolicyAliasPage() {
    return <PrivacyPolicyContent />;
}
