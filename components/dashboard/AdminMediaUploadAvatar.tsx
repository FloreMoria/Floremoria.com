'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2, User } from 'lucide-react';
import Image from 'next/image';

type Props = {
    imageUrl?: string | null;
    fallbackLabel?: string;
    size?: 'sm' | 'lg';
    entity: 'user' | 'deceased';
    entityId?: string;
    orderId?: string;
    onUploaded: (url: string, meta?: { userId?: string; deceasedProfileId?: string }) => void;
    disabled?: boolean;
};

export default function AdminMediaUploadAvatar({
    imageUrl,
    fallbackLabel,
    size = 'lg',
    entity,
    entityId,
    orderId,
    onUploaded,
    disabled = false,
}: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const displayUrl = previewUrl || imageUrl || null;
    const dim = size === 'lg' ? 'w-20 h-20' : 'w-10 h-10';
    const iconSize = size === 'lg' ? 40 : 18;

    const handlePick = () => {
        if (disabled || uploading) return;
        inputRef.current?.click();
    };

    const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;

        setError(null);
        const local = URL.createObjectURL(file);
        setPreviewUrl(local);
        setUploading(true);

        try {
            const form = new FormData();
            form.append('entity', entity);
            if (entityId) form.append('entityId', entityId);
            if (orderId) form.append('orderId', orderId);
            form.append('file', file);

            const res = await fetch('/api/dashboard/media/upload', {
                method: 'POST',
                body: form,
            });
            const data = (await res.json()) as {
                ok?: boolean;
                error?: string;
                url?: string;
                userId?: string;
                deceasedProfileId?: string;
            };

            if (!res.ok || !data.ok || !data.url) {
                throw new Error(data.error || 'Upload non riuscito.');
            }

            setPreviewUrl(data.url);
            onUploaded(data.url, {
                userId: data.userId,
                deceasedProfileId: data.deceasedProfileId,
            });
        } catch (err) {
            setPreviewUrl(null);
            setError(err instanceof Error ? err.message : 'Errore upload.');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="flex flex-col items-start gap-1">
            <div
                className={`relative group cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={handlePick}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => ev.key === 'Enter' && handlePick()}
                aria-label="Carica immagine"
            >
                <div
                    className={`${dim} bg-gray-200 rounded-full border-4 border-white shadow-md flex items-center justify-center overflow-hidden`}
                >
                    {displayUrl ? (
                        <Image
                            src={displayUrl}
                            alt={fallbackLabel || 'Immagine profilo'}
                            width={size === 'lg' ? 80 : 40}
                            height={size === 'lg' ? 80 : 40}
                            className="w-full h-full object-cover"
                            unoptimized
                        />
                    ) : (
                        <User className="text-gray-400" size={iconSize} />
                    )}
                    {uploading ? (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-full">
                            <Loader2 className="animate-spin text-white" size={20} />
                        </div>
                    ) : (
                        <div className="absolute bottom-0 right-0 bg-white p-1.5 rounded-full shadow border border-gray-100 text-gray-600 group-hover:text-fm-gold transition-colors">
                            <Camera className="w-4 h-4" />
                        </div>
                    )}
                </div>
                <input
                    ref={inputRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleChange}
                    disabled={disabled || uploading}
                />
            </div>
            {error ? <p className="text-xs text-red-600 max-w-[200px]">{error}</p> : null}
        </div>
    );
}
