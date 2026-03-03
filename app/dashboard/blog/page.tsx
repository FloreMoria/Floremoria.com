import { Pen, Sparkles } from 'lucide-react';

export default function BlogPage() {
    return (
        <div className="max-w-[1200px] mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-[28px] font-semibold text-black tracking-tight">Piano Editoriale & Social</h1>
                    <p className="text-gray-500 text-[15px] mt-1">Genera articoli per il blog grazie a Gemini e gestisci il calendario.</p>
                </div>

                <button className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-5 py-2.5 rounded-full text-[15px] font-medium shadow-md hover:scale-105 transition-all">
                    <Sparkles size={18} />
                    <span>Genera con AI</span>
                </button>
            </header>

            <div className="bg-white border text-left border-gray-200 rounded-3xl shadow-sm overflow-hidden p-12 text-center">
                <p className="text-gray-400 font-medium">Bozze, Statistiche e Cronologia degli Articoli non appena implementate.</p>
            </div>
        </div>
    );
}
