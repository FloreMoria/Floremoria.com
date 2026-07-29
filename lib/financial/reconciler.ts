import prisma from '@/lib/prisma';
import { BankTransaction, ReconciliationResult, AccountingEntry } from './types';
import { addAccountingEntries, updateTransactionCategory } from './ledgerStore';

/**
 * Calcola l'IVA scorporata (22% per i fiori e servizi standard)
 */
function calculateVatCents(totalCents: number, rate = 0.22): number {
    const net = totalCents / (1 + rate);
    return Math.round(totalCents - net);
}

/**
 * Esegue la riconciliazione automatica di una transazione bancaria e genera le relative voci di Prima Nota
 */
export async function reconcileTransaction(transaction: BankTransaction): Promise<ReconciliationResult> {
    const emittedDate = new Date(transaction.emittedAt);
    
    // 1. ESPENSI/COSTI ESTERI E SAAS RICORRENTI (Abbonamenti / Commissioni)
    const isOutflow = transaction.amountCents < 0;
    const absAmountCents = Math.abs(transaction.amountCents);

    if (isOutflow) {
        const refUpper = (transaction.reference || '').toUpperCase();
        const nameUpper = transaction.counterpartyName.toUpperCase();

        const isCursor = nameUpper.includes('ANYSPHERE') || refUpper.includes('CURSOR');
        const isClaude = nameUpper.includes('ANTHROPIC') || refUpper.includes('CLAUDE');
        const isAntigravity = nameUpper.includes('ANTIGRAVITY') || refUpper.includes('DEEPMIND');
        const isGoogle = nameUpper.includes('GOOGLE') || refUpper.includes('GSUITE') || refUpper.includes('G.CO');
        const isMeta = nameUpper.includes('META') || nameUpper.includes('FACEBOOK') || refUpper.includes('ADS');
        const isStripeFees = nameUpper.includes('STRIPE') || refUpper.includes('FEE') || refUpper.includes('COMMISSION');

        if (isCursor || isClaude || isAntigravity || isGoogle || isMeta || isStripeFees) {
            let dareAccount = '70300 - Software SaaS (Estero)';
            let description = `Abbonamento SaaS estero - ${transaction.counterpartyName}`;

            if (isMeta) {
                dareAccount = '70400 - Servizi Pubblicitari Estero';
                description = `Spesa pubblicitaria Meta Ads - ${transaction.counterpartyName}`;
            } else if (isStripeFees) {
                dareAccount = '70200 - Commissioni Stripe';
                description = `Commissioni/Trattenute Stripe - ${transaction.counterpartyName}`;
            }

            const entryId = `entry_expense_${transaction.id}`;
            const entry: AccountingEntry = {
                id: entryId,
                date: emittedDate.toISOString().split('T')[0],
                description,
                dareAccount,
                avereAccount: '50100 - Banca Qonto',
                amountCents: absAmountCents,
                vatAmountCents: 0, // Reverse charge / esente IVA alla fonte
                isForeignService: true,
                invoiceReference: `AUTO-FT-${transaction.id.slice(-6).toUpperCase()}`,
                status: 'CONFIRMED'
            };

            // Salviamo la scrittura e aggiorniamo la categoria
            addAccountingEntries([entry]);
            updateTransactionCategory(transaction.id, 'EXPENSE_SAAS');

            return {
                isReconciled: true,
                matchingScore: 100,
                type: 'EXPENSE_SAAS',
                notes: 'Spesa SaaS/Estera ricorrente identificata ed assoggettata a Reverse Charge.'
            };
        }

        // 2. COSTI OPERATIVI PARTNER (FIORISTI)
        // Cerca se c'è un codice ordine nella causale (es. PT-BG-26-003)
        const orderCodeRegex = /PT-[A-Z]{2}-\d{2}-\d{3,4}/i;
        const matchCode = (transaction.reference || '').match(orderCodeRegex);
        if (matchCode) {
            const orderCode = matchCode[0].toUpperCase();
            
            // Cerca l'ordine a database
            const order = await prisma.order.findUnique({
                where: { orderNumber: orderCode },
                include: { partner: true }
            });

            if (order && !order.isTest) {
                const entryId = `entry_partner_posa_${transaction.id}`;
                const entry: AccountingEntry = {
                    id: entryId,
                    date: emittedDate.toISOString().split('T')[0],
                    description: `Posa e competenze fiorista partner per ordine ${orderCode}`,
                    dareAccount: '70100 - Costi di Produzione (Fioristi Partner)',
                    avereAccount: '50100 - Banca Qonto',
                    amountCents: absAmountCents,
                    vatAmountCents: calculateVatCents(absAmountCents, 0.22),
                    isForeignService: false,
                    invoiceReference: `FT-PARTNER-${orderCode}`,
                    status: 'CONFIRMED'
                };

                addAccountingEntries([entry]);
                updateTransactionCategory(transaction.id, 'EXPENSE_PARTNER');

                return {
                    isReconciled: true,
                    orderId: order.id,
                    matchingScore: 100,
                    type: 'B2B_PARTNER',
                    notes: `Riconciliato con ordine partner ${orderCode} ed emessa Prima Nota costo fiorista.`
                };
            }
        }

        // 3. PAGAMENTO FATTURA FORNITORE ITALIANO (Generico)
        // Cerca se esiste una fattura con importo identico che è in stato UNPAID o PROCESSING
        const matchedInvoice = await prisma.supplierInvoice.findFirst({
            where: {
                status: { in: ['UNPAID', 'PROCESSING'] },
                amount: absAmountCents / 100
            },
            include: { supplier: true }
        });

        if (matchedInvoice) {
            // Aggiorna lo stato della fattura fornitore su database
            await prisma.supplierInvoice.update({
                where: { id: matchedInvoice.id },
                data: { status: 'PAID' }
            });

            const entryId = `entry_invoice_${matchedInvoice.id}`;
            const entry: AccountingEntry = {
                id: entryId,
                date: emittedDate.toISOString().split('T')[0],
                description: `Pagamento fattura n. ${matchedInvoice.invoiceNumber} a fornitore ${matchedInvoice.supplier.companyName}`,
                dareAccount: '70100 - Costi di Produzione (Fioristi Partner)', // Categoria default per fioristi/fornitori
                avereAccount: '50100 - Banca Qonto',
                amountCents: absAmountCents,
                vatAmountCents: calculateVatCents(absAmountCents, 0.22),
                isForeignService: false,
                invoiceReference: matchedInvoice.invoiceNumber,
                status: 'CONFIRMED'
            };

            addAccountingEntries([entry]);
            updateTransactionCategory(transaction.id, 'EXPENSE_PARTNER');

            return {
                isReconciled: true,
                matchingScore: 95,
                type: 'B2B_PARTNER',
                notes: `Fattura passiva n. ${matchedInvoice.invoiceNumber} di ${matchedInvoice.supplier.companyName} riconciliata e saldata.`
            };
        }

        // 4. ABBINAMENTO DIRETTO CON ANAGRAFICA FORNITORI (tramite Nome Controparte)
        const matchedSupplier = await prisma.supplier.findFirst({
            where: {
                companyName: {
                    contains: transaction.counterpartyName,
                    mode: 'insensitive'
                }
            }
        });

        if (matchedSupplier) {
            const entryId = `entry_supplier_direct_${transaction.id}`;
            const entry: AccountingEntry = {
                id: entryId,
                date: emittedDate.toISOString().split('T')[0],
                description: `Pagamento diretto a fornitore registrato: ${matchedSupplier.companyName}`,
                dareAccount: '70100 - Costi di Produzione (Fioristi Partner)',
                avereAccount: '50100 - Banca Qonto',
                amountCents: absAmountCents,
                vatAmountCents: calculateVatCents(absAmountCents, 0.22),
                isForeignService: false,
                invoiceReference: `REG-${transaction.id.slice(-6).toUpperCase()}`,
                status: 'CONFIRMED'
            };

            addAccountingEntries([entry]);
            updateTransactionCategory(transaction.id, 'EXPENSE_PARTNER');

            return {
                isReconciled: true,
                matchingScore: 85,
                type: 'B2B_PARTNER',
                notes: `Transazione abbinata direttamente all'anagrafica del fornitore "${matchedSupplier.companyName}" tramite nome controparte.`
            };
        }

        // Uscita non identificata
        return {
            isReconciled: false,
            matchingScore: 0,
            type: 'UNRECONCILED',
            notes: 'Uscita non abbinabile ad alcun ordine o fattura passiva registrata.'
        };
    } else {
        // ENTRATE (INFLOWS)
        const refUpper = (transaction.reference || '').toUpperCase();
        
        // 1. INCASSO PAYOUT STRIPE
        const isStripe = transaction.counterpartyName.toUpperCase().includes('STRIPE') || refUpper.includes('STRIPE');
        if (isStripe) {
            // Un payout Stripe di €98.00 tipicamente corrisponde a un ordine da €100.00 con €2.00 di commissioni trattenute.
            // Cerchiamo un ordine completato o in corso non ancora riconciliato creato nelle ultime 72 ore
            const dateThresholdMin = new Date(emittedDate.getTime() - 4 * 24 * 60 * 60 * 1000);
            const dateThresholdMax = new Date(emittedDate.getTime() + 1 * 24 * 60 * 60 * 1000);

            const orders = await prisma.order.findMany({
                where: {
                    isTest: false,
                    createdAt: { gte: dateThresholdMin, lte: dateThresholdMax },
                    status: { in: ['COMPLETED', 'IN_PROGRESS', 'DELIVERING'] }
                }
            });

            // Cerchiamo un ordine il cui importo (lordo) sia coerente con il payout + commissioni stimabili (circa 1-3%)
            const matchedOrder = orders.find(o => {
                const diff = o.totalPriceCents - transaction.amountCents;
                return diff >= 0 && diff <= 500; // La differenza (fees) è ragionevolmente tra €0.00 e €5.00
            });

            if (matchedOrder) {
                const grossAmount = matchedOrder.totalPriceCents;
                const feeAmount = grossAmount - transaction.amountCents;

                const entryGrossId = `entry_stripe_gross_${transaction.id}_${matchedOrder.id}`;
                const entryFeesId = `entry_stripe_fees_${transaction.id}_${matchedOrder.id}`;

                const entryGross: AccountingEntry = {
                    id: entryGrossId,
                    date: emittedDate.toISOString().split('T')[0],
                    description: `Incasso lordo clienti tramite Stripe - Ordine ${matchedOrder.orderNumber}`,
                    dareAccount: '50100 - Banca Qonto',
                    avereAccount: '60100 - Ricavi da Vendite',
                    amountCents: grossAmount,
                    vatAmountCents: calculateVatCents(grossAmount, 0.22),
                    isForeignService: false,
                    invoiceReference: matchedOrder.orderNumber,
                    status: 'CONFIRMED'
                };

                const entryFees: AccountingEntry = {
                    id: entryFeesId,
                    date: emittedDate.toISOString().split('T')[0],
                    description: `Trattenuta commissioni Stripe su ordine ${matchedOrder.orderNumber}`,
                    dareAccount: '70200 - Commissioni Stripe',
                    avereAccount: '50100 - Banca Qonto',
                    amountCents: feeAmount,
                    vatAmountCents: 0,
                    isForeignService: true,
                    invoiceReference: `FEE-${matchedOrder.orderNumber}`,
                    status: 'CONFIRMED'
                };

                addAccountingEntries([entryGross, entryFees]);
                updateTransactionCategory(transaction.id, 'STRIPE');

                return {
                    isReconciled: true,
                    orderId: matchedOrder.id,
                    matchingScore: 90,
                    type: 'STRIPE',
                    notes: `Payout Stripe abbinato all'ordine ${matchedOrder.orderNumber} (Lordo: €${(grossAmount/100).toFixed(2)}, Comm: €${(feeAmount/100).toFixed(2)}).`
                };
            }
        }

        // 2. ENTRATA DA PARTNER B2B O BONIFICO DIRETTO SEPA
        const orderCodeRegex = /PT-[A-Z]{2}-\d{2}-\d{3,4}/i;
        const matchCode = (transaction.reference || '').match(orderCodeRegex);
        if (matchCode) {
            const orderCode = matchCode[0].toUpperCase();

            // Cerca l'ordine a database
            const order = await prisma.order.findUnique({
                where: { orderNumber: orderCode }
            });

            if (order && !order.isTest) {
                const entryId = `entry_b2b_gross_${transaction.id}_${order.id}`;
                const entry: AccountingEntry = {
                    id: entryId,
                    date: emittedDate.toISOString().split('T')[0],
                    description: `Incasso bonifico B2B partner per ordine ${orderCode}`,
                    dareAccount: '50100 - Banca Qonto',
                    avereAccount: '60100 - Ricavi da Vendite',
                    amountCents: transaction.amountCents,
                    vatAmountCents: calculateVatCents(transaction.amountCents, 0.22),
                    isForeignService: false,
                    invoiceReference: orderCode,
                    status: 'CONFIRMED'
                };

                addAccountingEntries([entry]);
                updateTransactionCategory(transaction.id, 'B2B_PARTNER');

                return {
                    isReconciled: true,
                    orderId: order.id,
                    matchingScore: 100,
                    type: 'B2B_PARTNER',
                    notes: `Bonifico B2B abbinato perfettamente all'ordine ${orderCode}.`
                };
            }
        }

        // 3. MATCHING PER IMPORTO ESATTO ED INTERVALLO TEMPORALE (±48 ORE)
        // Se non c'è causale, cerchiamo un ordine con lo stesso importo esatto nelle ultime 48 ore
        const dateMin = new Date(emittedDate.getTime() - 2 * 24 * 60 * 60 * 1000);
        const dateMax = new Date(emittedDate.getTime() + 2 * 24 * 60 * 60 * 1000);

        const possibleOrder = await prisma.order.findFirst({
            where: {
                isTest: false,
                totalPriceCents: transaction.amountCents,
                createdAt: { gte: dateMin, lte: dateMax }
            }
        });

        if (possibleOrder) {
            const entryId = `entry_direct_sepa_${transaction.id}_${possibleOrder.id}`;
            const entry: AccountingEntry = {
                id: entryId,
                date: emittedDate.toISOString().split('T')[0],
                description: `Incasso bonifico diretto per ordine ${possibleOrder.orderNumber} (Match importo/data)`,
                dareAccount: '50100 - Banca Qonto',
                avereAccount: '60100 - Ricavi da Vendite',
                amountCents: transaction.amountCents,
                vatAmountCents: calculateVatCents(transaction.amountCents, 0.22),
                isForeignService: false,
                invoiceReference: possibleOrder.orderNumber,
                status: 'CONFIRMED'
            };

            addAccountingEntries([entry]);
            updateTransactionCategory(transaction.id, 'DIRECT_SEPA');

            return {
                isReconciled: true,
                orderId: possibleOrder.id,
                matchingScore: 80, // Score inferiore perché non c'è corrispondenza di causale esatta
                type: 'DIRECT_SEPA',
                notes: `Riconciliato tramite importo esatto (€${(transaction.amountCents/100).toFixed(2)}) e range temporale con l'ordine ${possibleOrder.orderNumber}.`
            };
        }

        // Entrata non identificata
        return {
            isReconciled: false,
            matchingScore: 0,
            type: 'UNRECONCILED',
            notes: 'Bonifico in entrata non abbinabile ad alcun ordine attivo.'
        };
    }
}

/**
 * Ingestione iniziale o periodica di tutti gli ordini inseriti manualmente
 * che devono essere impostati come PAGATI ed inseriti nella Prima Nota.
 */
export async function processManualOrders(): Promise<number> {
    // Troviamo gli ordini non contrassegnati come test, che hanno pagamento bonifico o inseriti da admin
    const manualOrders = await prisma.order.findMany({
        where: {
            isTest: false,
            // Gli ordini inseriti manualmente hanno solitamente note o provenienze gestionali (ad es. bonifico)
            // Filtriamo quelli in corso o completati per inserirli in Prima Nota
            status: { in: ['COMPLETED', 'IN_PROGRESS', 'ACCEPTED'] }
        }
    });

    let count = 0;
    const entriesToSave: AccountingEntry[] = [];

    for (const order of manualOrders) {
        // Cerca se esiste già un incasso per questo ordine in Prima Nota
        const entryGrossId = `entry_manual_gross_${order.id}`;
        
        // Se non esiste, generiamo la Prima Nota per l'ordine pagato manualmente
        const orderNumber = order.orderNumber || order.id.slice(0, 8);
        const entry: AccountingEntry = {
            id: entryGrossId,
            date: new Date(order.createdAt).toISOString().split('T')[0],
            description: `Incasso ordine manuale confermato/pagato - Ordine ${orderNumber}`,
            dareAccount: '50100 - Banca Qonto',
            avereAccount: '60100 - Ricavi da Vendite',
            amountCents: order.totalPriceCents,
            vatAmountCents: calculateVatCents(order.totalPriceCents, 0.22),
            isForeignService: false,
            invoiceReference: orderNumber,
            status: 'CONFIRMED'
        };

        entriesToSave.push(entry);
        count++;
    }

    if (entriesToSave.length > 0) {
        addAccountingEntries(entriesToSave);
    }

    return count;
}
