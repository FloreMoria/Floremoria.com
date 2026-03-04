'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Image as ImageIcon, Check, X, Tag, Euro, Package, XCircle } from 'lucide-react';
import Image from 'next/image';

interface Category {
    id: string;
    name: string;
}

interface Product {
    id: string;
    name: string;
    shortDescription: string | null;
    basePriceCents: number;
    isActive: boolean;
    mediaUrl: string | null;
    categoryId: string;
    category?: Category;
}

interface ClientProductsTableProps {
    initialProducts: Product[];
    initialCategories: Category[];
}

export default function ClientProductsTable({ initialProducts, initialCategories }: ClientProductsTableProps) {
    const [products, setProducts] = useState<Product[]>(initialProducts);
    const [categories, setCategories] = useState<Category[]>(initialCategories);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    // Creating category inline state
    const [isCreatingCategory, setIsCreatingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');

    // Form state
    const [formData, setFormData] = useState({
        id: '',
        name: '',
        shortDescription: '',
        basePriceCents: 0,
        categoryId: '',
        mediaUrl: '',
        isActive: true
    });

    const openDrawer = (product?: Product) => {
        if (product) {
            setFormData({
                id: product.id,
                name: product.name,
                shortDescription: product.shortDescription || '',
                basePriceCents: product.basePriceCents / 100, // converte per l'editor
                categoryId: product.categoryId,
                mediaUrl: product.mediaUrl || '',
                isActive: product.isActive
            });
        } else {
            setFormData({
                id: '',
                name: '',
                shortDescription: '',
                basePriceCents: 0,
                categoryId: categories.length > 0 ? categories[0].id : '',
                mediaUrl: '',
                isActive: true
            });
        }
        setIsDrawerOpen(true);
    };

    const closeDrawer = () => {
        setIsDrawerOpen(false);
        setIsCreatingCategory(false);
    };

    const handleCreateCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCategoryName.trim()) return;

        try {
            const res = await fetch('/api/dashboard/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newCategoryName })
            });

            if (res.ok) {
                const newCat = await res.json();
                setCategories(prev => [...prev, newCat]);
                setFormData(prev => ({ ...prev, categoryId: newCat.id }));
                setNewCategoryName('');
                setIsCreatingCategory(false);
            } else {
                alert('Errore crezione categoria');
            }
        } catch (error) {
            alert('Errore di rete');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const isUpdate = formData.id !== '';
        const url = isUpdate ? `/api/dashboard/products/${formData.id}` : '/api/dashboard/products';
        const method = isUpdate ? 'PUT' : 'POST';

        const payload = {
            ...formData,
            basePriceCents: Math.round(Number(formData.basePriceCents) * 100) // Convert to cents
        };

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const savedProduct = await res.json();
                if (isUpdate) {
                    setProducts(prev => prev.map(p => p.id === savedProduct.id ? savedProduct : p));
                } else {
                    setProducts(prev => [savedProduct, ...prev]);
                    // Update formData ID to prevent duplicates if user keeps clicking save
                    setFormData(prev => ({ ...prev, id: savedProduct.id }));
                }
                setIsSuccess(true);
                setTimeout(() => setIsSuccess(false), 2500);
                // Il drawer non viene chiuso per permettere modifiche veloci continue al prodotto
            } else {
                alert('Errore salvataggio.');
            }
        } catch (e) {
            alert('Errore di connessione.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Sei sicuro di voler eliminare questo prodotto?')) return;

        try {
            const res = await fetch(`/api/dashboard/products/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setProducts(prev => prev.filter(p => p.id !== id));
            } else {
                alert('Errore eliminazione.');
            }
        } catch (e) {
            alert('Errore rete eliminazione.');
        }
    };

    // Inline Price Update (Optimistic UI)
    const updateInlinePrice = async (id: string, newPriceEuro: string) => {
        const parsed = parseFloat(newPriceEuro);
        if (isNaN(parsed)) return;

        const cents = Math.round(parsed * 100);

        // Optimistic
        setProducts(prev => prev.map(p => p.id === id ? { ...p, basePriceCents: cents } : p));

        try {
            await fetch(`/api/dashboard/products/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ basePriceCents: cents })
            });
        } catch (e) {
            console.error('Failed inline update');
        }
    };

    // Inline Status Toggle (Optimistic UI)
    const toggleInlineState = async (product: Product, e: React.MouseEvent) => {
        e.stopPropagation();
        const newActiveState = !product.isActive;
        // Optimistic UI update
        setProducts(prev => prev.map(p => p.id === product.id ? { ...p, isActive: newActiveState } : p));
        try {
            await fetch(`/api/dashboard/products/${product.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: newActiveState })
            });
        } catch {
            console.error('Failed toggle state');
            // Revert on error
            setProducts(prev => prev.map(p => p.id === product.id ? { ...p, isActive: !newActiveState } : p));
        }
    };

    // Strict Sorting Logic
    const sortedProducts = [...products].sort((a, b) => {
        const catA = a.category?.name || '';
        const catB = b.category?.name || '';

        // 1. Group by Category: Fiori sulle Tombe first, Per il Funerale second
        if (catA === 'Fiori sulle Tombe' && catB !== 'Fiori sulle Tombe') return -1;
        if (catB === 'Fiori sulle Tombe' && catA !== 'Fiori sulle Tombe') return 1;
        if (catA === 'Per il Funerale' && catB !== 'Per il Funerale') return -1;
        if (catB === 'Per il Funerale' && catA !== 'Per il Funerale') return 1;

        // Same category, sort by specific rules
        if (catA === 'Fiori sulle Tombe') {
            const isAccessoryA = a.name === 'Lumino' || a.name === 'Messaggio';
            const isAccessoryB = b.name === 'Lumino' || b.name === 'Messaggio';

            // Push accessories to the bottom
            if (isAccessoryA && !isAccessoryB) return 1;
            if (!isAccessoryA && isAccessoryB) return -1;

            if (isAccessoryA && isAccessoryB) {
                // Keep ascending price specifically for accessories too
                return a.basePriceCents - b.basePriceCents;
            }
        }

        // 2. Sort by Price Ascending (Lowest to Highest)
        return a.basePriceCents - b.basePriceCents;
    });

    return (
        <div className="relative">
            {/* Action Bar */}
            <div className="flex justify-between items-center mb-6">
                <div className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                    {products.length} Prodotti nel Catalogo
                </div>
                <button
                    onClick={() => openDrawer()}
                    className="flex items-center gap-2 bg-black text-white px-5 py-2.5 rounded-full text-[14px] font-semibold tracking-wide shadow-md hover:scale-105 transition-all"
                >
                    <Plus size={16} /> Aggiungi Prodotto
                </button>
            </div>

            {/* Prodotti Table (Full Width) */}
            <div className="bg-white border text-left border-gray-200 rounded-3xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto w-full custom-scrollbar">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100 text-gray-500">
                                <th className="font-semibold py-4 px-4 uppercase text-[11px] tracking-wider w-16">Img</th>
                                <th className="font-semibold py-4 px-4 uppercase text-[11px] tracking-wider">Nome Prodotto</th>
                                <th className="font-semibold py-4 px-4 uppercase text-[11px] tracking-wider">Categoria / Pagina</th>
                                <th className="font-semibold py-4 px-4 uppercase text-[11px] tracking-wider text-right w-32">Prezzo (€)</th>
                                <th className="font-semibold py-4 px-4 uppercase text-[11px] tracking-wider text-center w-24">Stato</th>
                                <th className="font-semibold py-4 px-4 uppercase text-[11px] tracking-wider text-right w-24">Azioni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {sortedProducts.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-400">Nessun prodotto presente.</td></tr>
                            ) : sortedProducts.map(product => (
                                <tr key={product.id} onClick={() => openDrawer(product)} className="hover:bg-gray-50/50 transition-colors group cursor-pointer">
                                    <td className="py-3 px-4">
                                        <div className="w-10 h-10 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                                            {product.mediaUrl ? (
                                                <Image src={product.mediaUrl} alt={product.name} width={40} height={40} className="w-full h-full object-cover" />
                                            ) : (
                                                <ImageIcon size={16} className="text-gray-400" />
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-3 px-4">
                                        <div className="font-semibold text-gray-900">{product.name}</div>
                                        <div className="text-xs text-gray-500 truncate max-w-[200px]">{product.shortDescription || '-'}</div>
                                    </td>
                                    <td className="py-3 px-4">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                                            <Tag size={12} /> {product.category?.name || 'Senza Categoria'}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <input
                                            type="number"
                                            step="0.01"
                                            defaultValue={(product.basePriceCents / 100).toFixed(2)}
                                            onClick={(e) => e.stopPropagation()}
                                            onBlur={(e) => updateInlinePrice(product.id, e.target.value)}
                                            className="w-20 text-right bg-transparent border-b border-dashed border-gray-300 focus:border-fm-gold hover:border-gray-400 outline-none font-medium text-gray-900 transition-colors py-1"
                                        />
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={(e) => toggleInlineState(product, e)}
                                                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${product.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`}
                                                role="switch"
                                                aria-checked={product.isActive}
                                            >
                                                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${product.isActive ? 'translate-x-4' : 'translate-x-0'}`} />
                                            </button>
                                            <span className={`text-[11px] font-semibold uppercase tracking-wider ${product.isActive ? 'text-emerald-600' : 'text-gray-400'}`}>
                                                {product.isActive ? 'Attivo' : 'Non attivo'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="flex items-center justify-end gap-1">
                                            <button onClick={(e) => { e.stopPropagation(); openDrawer(product); }} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                                <Edit2 size={16} />
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDelete(product.id); }} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* OVERLAY RIMOSSO (Non-blocking interaction) */}

            {/* CREATOR DRAWER */}
            <div className={`fixed right-0 top-16 h-[calc(100vh-4rem)] w-[50vw] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out border-l border-gray-200 flex flex-col ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                {/* Drawer Header - CON TASTO SALVA */}
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">{formData.id ? 'Modifica' : 'Nuovo'}</div>
                        <h3 className="text-xl font-display font-semibold text-gray-900 flex items-center gap-2">
                            <Package size={20} className="text-fm-gold" /> {categories.find(c => c.id === formData.categoryId)?.name ? `CATEGORIA: ${categories.find(c => c.id === formData.categoryId)?.name.toUpperCase()}` : 'PRODOTTO'}
                        </h3>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="submit"
                            form="productForm"
                            disabled={isSubmitting || isSuccess}
                            className={`!bg-blue-600 !text-white !font-bold py-2 px-6 rounded-md transition-all ${isSuccess ? '!bg-yellow-500 hover:!bg-yellow-600' : 'hover:!bg-blue-700'} ${isSubmitting ? 'opacity-70 cursor-wait' : ''}`}
                        >
                            {isSubmitting ? (
                                <>SALVATAGGIO...</>
                            ) : isSuccess ? (
                                <>SALVATO!</>
                            ) : (
                                <>SALVA</>
                            )}
                        </button>
                        <button type="button" onClick={closeDrawer} className="p-2.5 bg-white rounded-full text-gray-400 hover:text-black hover:bg-gray-200 shadow-sm transition-all border border-gray-100">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Drawer Body - Form */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-sm">
                    <form id="productForm" onSubmit={handleSubmit} className="space-y-6">

                        {/* Immagine Upload Drag & Drop */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Immagine Principale</label>
                            <div className="flex flex-col gap-3">
                                <div className="border-2 border-dashed border-gray-300 rounded-2xl p-6 flex flex-col items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-blue-500 hover:border-blue-400 transition-all cursor-pointer">
                                    {formData.mediaUrl ? (
                                        <Image src={formData.mediaUrl} alt="Preview" width={80} height={80} className="w-20 h-20 rounded-xl object-cover mb-2 border border-gray-200" />
                                    ) : (
                                        <ImageIcon size={32} className="mb-2 opacity-50" />
                                    )}
                                    <span className="text-[12px] font-semibold text-gray-700 mt-2">Trascina Immagine Qui o Clicca per Esplorare</span>
                                    <span className="text-[10px] font-medium text-gray-400 mt-1 uppercase">Supporta Formati Immagine o Database</span>
                                </div>
                                <input
                                    type="text"
                                    value={formData.mediaUrl}
                                    placeholder="...o incolla direttamente URL Immagine"
                                    onChange={e => setFormData({ ...formData, mediaUrl: e.target.value })}
                                    className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-fm-gold focus:border-fm-gold transition-all text-xs shadow-sm bg-gray-50"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Nome Prodotto</label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Mazzo Rose Rosse..."
                                className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-fm-gold focus:border-fm-gold transition-all"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Prezzo (€)</label>
                                <div className="relative">
                                    <Euro size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="number"
                                        step="0.01"
                                        required
                                        value={formData.basePriceCents}
                                        onChange={e => setFormData({ ...formData, basePriceCents: parseFloat(e.target.value) || 0 })}
                                        className="w-full border-gray-200 rounded-xl p-3 pl-9 outline-none focus:ring-2 focus:ring-fm-gold focus:border-fm-gold transition-all font-semibold"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Stato Globale</label>
                                <select
                                    value={formData.isActive.toString()}
                                    onChange={e => setFormData({ ...formData, isActive: e.target.value === 'true' })}
                                    className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-fm-gold focus:border-fm-gold transition-all font-medium"
                                >
                                    <option value="true">🟢 Attivo (Pubblico)</option>
                                    <option value="false">🟠 Bozza (Nascosto)</option>
                                </select>
                            </div>
                        </div>

                        {/* Categoria Selection / Creation */}
                        <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl">
                            <label className="block text-xs font-semibold text-gray-800 uppercase tracking-wider mb-2 flex items-center justify-between">
                                Categoria di Appartenenza
                                {!isCreatingCategory && (
                                    <button type="button" onClick={() => setIsCreatingCategory(true)} className="text-fm-gold hover:text-yellow-600 normal-case flex items-center gap-1">
                                        <Plus size={12} /> Nuova Categoria
                                    </button>
                                )}
                            </label>

                            {isCreatingCategory ? (
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Nome nuova categoria..."
                                        value={newCategoryName}
                                        onChange={e => setNewCategoryName(e.target.value)}
                                        className="flex-1 border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-fm-gold"
                                    />
                                    <button type="button" onClick={handleCreateCategory} className="bg-black text-white px-3 py-2 rounded-lg text-xs font-semibold hover:bg-gray-800">
                                        Salva
                                    </button>
                                    <button type="button" onClick={() => setIsCreatingCategory(false)} className="text-gray-400 hover:text-red-500 px-2">
                                        <XCircle size={18} />
                                    </button>
                                </div>
                            ) : (
                                <select
                                    required
                                    value={formData.categoryId}
                                    onChange={e => setFormData({ ...formData, categoryId: e.target.value })}
                                    className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-fm-gold focus:border-fm-gold transition-all bg-white shadow-sm"
                                >
                                    <option value="" disabled>Seleziona una categoria...</option>
                                    {categories.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <div className="pb-8">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Descrizione Breve</label>
                            <textarea
                                value={formData.shortDescription || ''}
                                onChange={e => setFormData({ ...formData, shortDescription: e.target.value })}
                                placeholder="Composizione floreale adatta per..."
                                className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-fm-gold focus:border-fm-gold transition-all min-h-[100px] resize-none"
                            />
                        </div>

                    </form>
                </div>
            </div>

        </div>
    );
}
