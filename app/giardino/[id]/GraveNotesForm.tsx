'use client';

import { useState } from 'react';
import { updateGraveNotes } from '@/app/actions/grave-notes';

interface GraveNotesFormProps {
    userId: string;
}

export default function GraveNotesForm({ userId }: GraveNotesFormProps) {
    const [notes, setNotes] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!notes.trim()) return;

        setStatus('loading');
        try {
            const response = await updateGraveNotes(userId, notes);
            if (response.success) {
                setStatus('success');
                setMessage('Le tue indicazioni sono state salvate con cura. Custodiremo questo segreto per aiutarti.');
                setNotes(''); // Clear form on success, or keep it. 
            } else {
                setStatus('error');
                setMessage('Non siamo riusciti a salvare i dati. Riprova tra poco.');
            }
        } catch (error) {
            setStatus('error');
            setMessage('Si è verificato un errore di connessione.');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
            <div className="mb-6 relative">
                <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Es. Cimitero Monumentale, Tomba di famiglia Rossi, terza fila a destra..."
                    className="w-full p-5 bg-[#FAF9F6] border border-fm-rose-soft/50 rounded-2xl font-body text-fm-text resize-none focus:outline-none focus:ring-2 focus:ring-fm-gold/50 focus:border-fm-gold transition-all min-h-[120px] shadow-inner"
                    required
                ></textarea>
            </div>

            <div className="text-center">
                <button
                    type="submit"
                    disabled={status === 'loading'}
                    className="bg-fm-gold text-white font-medium px-10 py-4 rounded-xl shadow-[0_4px_14px_0_rgba(180,150,105,0.39)] hover:bg-yellow-600 transition-all focus:outline-none disabled:opacity-70 flex items-center justify-center mx-auto gap-2"
                >
                    {status === 'loading' ? (
                        <>
                           <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Salvataggio in corso...
                        </>
                    ) : (
                        'Aggiorna le Note'
                    )}
                </button>
            </div>

            {status === 'success' && (
                <div className="mt-6 p-4 rounded-xl bg-green-50 text-green-800 text-sm font-medium border border-green-200 text-center animate-fade-in-up">
                    {message}
                </div>
            )}
            {status === 'error' && (
                <div className="mt-6 p-4 rounded-xl bg-red-50 text-red-800 text-sm font-medium border border-red-200 text-center animate-fade-in-up">
                    {message}
                </div>
            )}
        </form>
    );
}
